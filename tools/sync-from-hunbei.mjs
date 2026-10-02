// Regenerates index.html, css/fonts.css and assets/ from the live Hunbei page.
//
//   npm run sync
//
// WARNING: this overwrites index.html and css/fonts.css. Only use it while the
// content is still being edited on Hunbei; once you edit index.html by hand,
// stop using this script (or port your edits over).
//
// Requires Google Chrome (driven via puppeteer-core) and macOS `sips` for
// resizing photos.

import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCENE_URL = 'https://h5.hunbei.com/view/A1710396f06cf';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESIGN_REM = 37.5;       // Hunbei designs at 375px wide = 10rem
const MAX_REM_PX = 45;         // css/style.css caps 1rem at 45px (450px column)
const DPR = 2;                 // export photos for 2x screens

const rem = (px) => `${+(px / DESIGN_REM).toFixed(4)}rem`;
const num = (v) => parseFloat(v);

// ---------------------------------------------------------------------------
// 1. Render the page in Chrome and read every element off the live DOM

async function scrape() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148');
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // The countdown's end time only exists in the (encrypted) scene data, so
  // catch it as the app decrypts and parses it.
  await page.evaluateOnNewDocument(() => {
    const parse = JSON.parse;
    JSON.parse = function (text, ...rest) {
      const m = typeof text === 'string' && text.match(/"endTime":"([^"]+)"/);
      if (m) window.__endTime = m[1];
      return parse.call(this, text, ...rest);
    };
  });
  await page.goto(SCENE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 4000));

  const data = await page.evaluate(() => {
    const attr = (el, sel, name = 'style') => el.querySelector(sel)?.getAttribute(name) ?? '';
    const pageEl = document.querySelector('#page-list .page-item.current');
    const scroll = pageEl.querySelector('.scroll-wrap');
    const css = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n');

    const elements = [...pageEl.querySelector('.ele-wrap').children]
      .filter((e) => e.classList.contains('eles'))
      .map((e) => {
        const o = { id: e.dataset.id, type: e.dataset.type, style: e.getAttribute('style') };
        if (o.type === 'image') {
          o.src = e.querySelector('img').getAttribute('src');
          o.imgStyle = attr(e, 'img');
          o.wrapStyle = attr(e, '.rotate-wrap');
        } else if (o.type === 'text') {
          const t = e.querySelector('.text-editor');
          o.fontClass = [...t.classList].find((c) => !['text-common', 'text-editor'].includes(c)) ?? '';
          o.textStyle = t.getAttribute('style');
          o.html = t.innerHTML;
          o.wrapStyle = attr(e, '.ani-wrap');
        } else if (o.type === 'shape') {
          o.fill = e.querySelector('svg [fill]').getAttribute('fill');
          o.wrapStyle = attr(e, '.ani-wrap');
        } else if (o.type === 'calendar') {
          o.wrapStyle = attr(e, '.ani-wrap');
          o.themeColor = getComputedStyle(e.querySelector('.can-size')).color;
          o.dateColor = getComputedStyle(e.querySelector('.can-date li:not(.active) span')).color;
          o.heartColor = getComputedStyle(e.querySelector('.can-date li.active span')).color;
        } else if (o.type === 'countdown') {
          const box = e.querySelector('.c-com');
          o.boxColor = getComputedStyle(box).backgroundColor;
          o.textColor = getComputedStyle(box.querySelector('.c-text')).color;
          o.labels = [...e.querySelectorAll('.c-text')].map((t) => t.textContent.trim());
        }
        return o;
      });

    const audio = document.querySelector('#audio');
    return {
      endTime: window.__endTime,
      height: scroll.style.height,
      bgColor: getComputedStyle(pageEl.querySelector('.page-bg')).backgroundColor,
      music: audio.querySelector('audio').getAttribute('src'),
      musicIcon: audio.querySelector('.music-icon').getAttribute('src'),
      musicBg: audio.querySelector('.audio').style.backgroundColor,
      fontFaces: [...css.matchAll(/@font-face\{font-family:([\w-]+);src:\s*url\(([^)]+)\)/g)].map((m) => ({ name: m[1], url: m[2] })),
      fontClasses: [...css.matchAll(/\.([\w-]+)\{\s*font-family:([^;!]+)/g)].map((m) => ({ cls: m[1], stack: m[2].trim() })),
      elements,
    };
  });

  await browser.close();
  return data;
}

// ---------------------------------------------------------------------------
// 2. Download assets

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

// Hunbei serves images through Qiniu's imageMogr2. Keep the crop step (the
// framing chosen in the editor) but drop thumbnailing / webp conversion so we
// get the full-resolution crop.
function fullResUrl(src) {
  const [base, query = ''] = src.split('?');
  const firstStep = query.split('|')[0]
    .replace(/\/thumbnail\/[^/]*/, '')
    .replace(/\/format\/\w+/, '');
  return firstStep ? `${base}?${firstStep}` : base;
}

function styleMap(style) {
  const map = {};
  for (const decl of (style ?? '').split(';')) {
    const i = decl.indexOf(':');
    if (i > 0) map[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return map;
}

const toCss = (map) => Object.entries(map).map(([k, v]) => `${k}: ${v}`).join('; ');
const pxToRem = (v) => (/px$/.test(v) ? rem(num(v)) : v);

// ---------------------------------------------------------------------------
// 3. Build HTML for each element

function boxStyle(style, extra = {}) {
  const s = styleMap(style);
  const out = {};
  for (const k of ['left', 'top', 'width', 'height']) if (s[k] && s[k] !== 'auto') out[k] = s[k];
  if (s.transform && !/^rotate\(0deg\)$/.test(s.transform)) out.transform = s.transform;
  if (s.opacity && s.opacity !== '1') out.opacity = s.opacity;
  return toCss({ ...out, ...extra });
}

function radius(style) {
  const r = styleMap(style)['border-radius'];
  return r && num(r) !== 0 ? { 'border-radius': r } : {};
}

function textHtml(o, fontClassMap) {
  const s = styleMap(o.textStyle);
  const keep = {};
  for (const k of ['color', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'line-height', 'text-align', 'background-color', 'opacity']) {
    if (s[k] && !(k === 'opacity' && s[k] === '1')) keep[k] = s[k];
  }
  // Background / rounded corners of a text box live on its wrapper
  const wrap = styleMap(o.wrapStyle);
  if (wrap['background-color']) keep['background-color'] = wrap['background-color'];
  Object.assign(keep, radius(o.wrapStyle));
  const cls = fontClassMap.has(o.fontClass) ? ` f-${o.fontClass}` : '';
  if (!cls && s['font-family']) keep['font-family'] = s['font-family'];
  return `<div class="el text${cls}" style="${boxStyle(o.style)}"><p style="${toCss(keep)}">${o.html}</p></div>`;
}

function calendarHtml(o, end) {
  const [y, m, d] = end.split(/[- ]/).map(Number);
  const first = new Date(y, m - 1, 1).getDay();           // 0 = Sunday
  const offset = (first + 6) % 7;                          // Monday-first grid
  const days = new Date(y, m, 0).getDate();
  const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
  const cells = Array.from({ length: days }, (_, i) => i + 1).map((n) => n === d
    ? `<li class="active"><span>${n}</span><i class="heart"></i></li>`
    : `<li><span>${n}</span></li>`);
  const vars = `--theme: ${o.themeColor}; --date: ${o.dateColor}; --heart: ${o.heartColor}`;
  const wrap = styleMap(o.wrapStyle);
  return `<div class="el calendar" style="${boxStyle(o.style)}; ${vars}; background-color: ${wrap['background-color']}; border-width: ${wrap['border-width']}">
      <div class="cal-top"><span class="cal-month">${m} <small>/ ${m}</small></span><span class="cal-year">-${y}-</span></div>
      <div class="cal-week">${weekdays.map((w) => `<span>${w}</span>`).join('')}</div>
      <ul class="cal-days" style="--offset: ${offset}">
        ${cells.join('\n        ')}
      </ul>
    </div>`;
}

function countdownHtml(o, end) {
  const units = ['days', 'hours', 'minutes', 'seconds'];
  const boxes = units.map((u, i) => `
      <div class="cd-box" data-unit="${u}">
        <div class="cd-digits"></div>
        <div class="cd-label">${o.labels[i]}</div>
      </div>`).join('');
  const target = end.replace(' ', 'T') + '+08:00';          // Taipei time
  return `<div class="el countdown" style="${boxStyle(o.style)}; --box: ${o.boxColor}; --fg: ${o.textColor}" data-target="${target}">${boxes}
    </div>`;
}

// ---------------------------------------------------------------------------

async function main() {
  console.log('Rendering', SCENE_URL);
  const scene = await scrape();
  const END_TIME = scene.endTime;          // e.g. "2026-12-12 12:00:00"
  if (!END_TIME) throw new Error('Could not find the countdown end time');

  const imgDir = path.join(ROOT, 'assets/images');
  const fontDir = path.join(ROOT, 'assets/fonts');
  await fs.rm(imgDir, { recursive: true, force: true });
  await fs.rm(fontDir, { recursive: true, force: true });
  await fs.mkdir(imgDir, { recursive: true });
  await fs.mkdir(fontDir, { recursive: true });

  // Fonts --------------------------------------------------------------------
  const usedClasses = new Set(scene.elements.map((e) => e.fontClass).filter(Boolean));
  const fontClassMap = new Map();
  for (const { cls, stack } of scene.fontClasses) {
    if (usedClasses.has(cls)) fontClassMap.set(cls, stack.split(',').map((f) => f.trim().replace(/'/g, '')));
  }
  const faces = scene.fontFaces.filter((f) => [...fontClassMap.values()].some((s) => s.includes(f.name)));
  let fontsCss = '/* Generated by tools/sync-from-hunbei.mjs. Hunbei serves fonts subset to the\n   characters used on the page, so new characters may fall back to system fonts. */\n';
  const seenUrl = new Map();
  for (const f of faces) {
    let file = seenUrl.get(f.url);
    if (!file) {
      file = `${f.name}${path.extname(new URL(f.url).pathname)}`;
      await download(f.url, path.join(fontDir, file));
      seenUrl.set(f.url, file);
    }
    fontsCss += `@font-face { font-family: ${f.name}; src: url(../assets/fonts/${file}); font-display: swap; }\n`;
  }
  fontsCss += '\n';
  const facesByName = new Set(faces.map((f) => f.name));
  for (const [cls, stack] of fontClassMap) {
    fontsCss += `.f-${cls} { font-family: ${stack.filter((n) => facesByName.has(n)).join(', ')}, serif; }\n`;
  }
  await fs.writeFile(path.join(ROOT, 'css/fonts.css'), fontsCss);

  // Music ----------------------------------------------------------------------
  await download(scene.music, path.join(ROOT, 'assets/audio/music.mp3'));
  await download(scene.musicIcon.split('?')[0], path.join(ROOT, 'assets/icons/music.png'));

  // Elements ---------------------------------------------------------------------
  const manifest = [];
  const html = [];
  let n = 0;
  const bySrc = new Map();
  for (const o of scene.elements) {
    if (o.type === 'text') {
      if (!o.html.replace(/<br>|&nbsp;|\s/g, '')) continue;          // empty text boxes
      html.push(textHtml(o, fontClassMap));
    } else if (o.type === 'shape') {
      html.push(`<div class="el shape" style="${boxStyle(o.style, { background: o.fill, ...radius(o.wrapStyle) })}"></div>`);
    } else if (o.type === 'image') {
      const url = fullResUrl(o.src);
      const img = styleMap(o.imgStyle);
      const imgCss = {};
      for (const k of ['left', 'top', 'width', 'height']) if (img[k]) imgCss[k] = pxToRem(img[k]);
      let file = bySrc.get(url);
      if (!file) {
        const ext = path.extname(new URL(url).pathname).toLowerCase();
        const isPhoto = ext === '.jpg' || ext === '.jpeg';
        file = `${String(++n).padStart(2, '0')}${isPhoto ? '.jpg' : ext}`;
        const dest = path.join(imgDir, file);
        await download(url, dest);
        if (isPhoto) {
          // Longest side needed at the 450px column on a 2x screen.
          const need = Math.ceil(Math.max(num(img.width), num(img.height)) / DESIGN_REM * MAX_REM_PX * DPR);
          execFileSync('sips', ['-Z', String(need), '-s', 'format', 'jpeg', '-s', 'formatOptions', '82', dest, '--out', dest], { stdio: 'ignore' });
        }
        bySrc.set(url, file);
        manifest.push({ file, source: url });
      }
      const box = boxStyle(o.style, radius(o.wrapStyle));
      html.push(`<div class="el image" style="${box}"><img src="assets/images/${file}" alt="" style="${toCss(imgCss)}" loading="lazy"></div>`);
    } else if (o.type === 'calendar') {
      html.push(calendarHtml(o, END_TIME));
    } else if (o.type === 'countdown') {
      html.push(countdownHtml(o, END_TIME));
    }
  }
  await fs.writeFile(path.join(imgDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  const index = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>邑起豪好 Our Days｜關永豪 &amp; 張邑如</title>
  <meta name="description" content="誠摯邀請您參加我們的婚禮 · 2026.12.12">
  <meta name="theme-color" content="${scene.bgColor}">
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="css/fonts.css">
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <button id="music" class="music" type="button" aria-label="播放 / 暫停音樂" style="background-color: ${scene.musicBg}">
    <img src="assets/icons/music.png" alt="">
  </button>
  <audio id="bgm" src="assets/audio/music.mp3" loop preload="auto"></audio>

  <main class="page" style="height: ${scene.height}; background-color: ${scene.bgColor}">
    ${html.join('\n    ')}
  </main>

  <script src="js/main.js"></script>
</body>
</html>
`;
  await fs.writeFile(path.join(ROOT, 'index.html'), index);
  console.log(`Wrote index.html (${html.length} elements, ${manifest.length} images, ${seenUrl.size} fonts)`);
}

main().catch((err) => { console.error(err); process.exit(1); });
