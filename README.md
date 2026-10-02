# 邑起豪好 Our Days — wedding invitation

A static recreation of the Hunbei invitation page
(<https://h5.hunbei.com/view/A1710396f06cf>), without any of the platform
features (comments, gifts, ads, RSVP form, tips).

## Run locally

Open the folder in VS Code and click **Go Live** (Live Server extension) — or
`npm start`. No build step; `index.html` is the whole site.

## Deploy

Plain static files: upload the folder (minus `node_modules/` and `tools/`) to
Cloudflare Pages / Netlify / GitHub Pages. Fonts, music and images are all
local, so nothing depends on Hunbei.

## How the page works

- `index.html` is hand-written, one `<section>` per part of the story, in
  normal document flow. Sizes are in `rem`, where `10rem` = column width
  (full screen on phones, max 450px on desktop), so everything scales together.
- `css/style.css`: spacing/colour tokens at the top (`--pad`, `--gap`,
  `--section`, `--radius`, colours), then one block per section.
- `css/fonts.css`: 星光小熊貓體 (story text), Alibaba PuHuiTi (Latin in the
  movie/music cards), plus the original Hunbei fonts for the chapter titles.
- `js/main.js`: background music (starts on first tap, since browsers block
  autoplay; the music button and the "Stay with me" card toggle it), slow
  auto-scroll (stops when the visitor touches/scrolls; set
  `AUTO_SCROLL_SECONDS = 0` to disable), the countdown (Taipei time) and the
  fade-in of `.reveal` elements.

## Languages

繁體中文 (default), 廣東話 and English, picked from the top-left menu and
remembered per visitor. Links can force one: `?lang=yue` or `?lang=en`.
The Chinese text is in `index.html` (elements with `data-i18n="key"`);
the other languages are in `js/i18n.js` under the same keys. English uses
Chubby Crayon for the handwriting parts (it has no digits, so those use
星光小熊貓體).

## Fonts are subsets

The font files only contain the characters currently on the page (in all
three languages), to keep them small. New text with characters that aren't on the page yet will show
those characters in a fallback font until the subset is regenerated (with
`pyftsubset` from the full font file).

## Hunbei origin

The first version was generated from the Hunbei page by
`tools/sync-from-hunbei.mjs`. The page has since been redesigned by hand, so
that tool is kept for reference only — running it would overwrite
`index.html`. `assets/images/manifest.json` maps the photos to their Hunbei
source URLs.
