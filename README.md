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

- The original is a 375px-wide design with every element absolutely
  positioned. That is kept as-is: positions are in `rem`, where
  `10rem` = column width (full screen on phones, max 450px on desktop).
  See `css/style.css`.
- `js/main.js`: background music (starts on first tap, since browsers block
  autoplay), slow auto-scroll like the original (stops when the visitor
  touches/scrolls; set `AUTO_SCROLL_SECONDS = 0` to disable), and the
  countdown (Taipei time).

## Re-syncing from Hunbei

While the content is still being edited on Hunbei:

```sh
npm install
npm run sync
```

This re-renders the live page in Chrome and regenerates `index.html`,
`css/fonts.css`, `assets/images/` and `assets/fonts/`. **It overwrites any hand
edits to those files.**

Notes:
- Hunbei fonts are subsets containing only the characters used on the page.
  Adding new text by hand may show some characters in a fallback font —
  re-sync after editing on Hunbei instead, or get the full font files.
- Photos are downloaded with the crop from the Hunbei editor and resized for a
  2x screen. `assets/images/manifest.json` maps each file to its source URL
  (including crop), for swapping in high-res originals.
