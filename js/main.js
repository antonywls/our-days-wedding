// ---- Background music --------------------------------------------------------
// Browsers block autoplay with sound, so if play() is refused we start the
// music on the visitor's first tap / click / key press instead.

const bgm = document.getElementById('bgm');
const musicBtn = document.getElementById('music');

bgm.addEventListener('play', () => musicBtn.classList.add('playing'));
bgm.addEventListener('pause', () => musicBtn.classList.remove('playing'));

musicBtn.addEventListener('click', () => {
  if (bgm.paused) bgm.play(); else bgm.pause();
});

function startOnFirstInteraction() {
  const events = ['pointerdown', 'touchend', 'keydown'];
  const start = (e) => {
    events.forEach((type) => document.removeEventListener(type, start, true));
    if (!musicBtn.contains(e.target) && bgm.paused) bgm.play().catch(() => {});
  };
  events.forEach((type) => document.addEventListener(type, start, true));
}

bgm.play().catch(startOnFirstInteraction);

// ---- Auto-scroll -----------------------------------------------------------------
// Like the original, the page slowly scrolls itself to the end (in 175s).
// Any interaction from the visitor stops it for good.

const AUTO_SCROLL_SECONDS = 175;   // set to 0 to disable

if (AUTO_SCROLL_SECONDS > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const stopEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
  let running = true;
  let last = null;
  let y = window.scrollY;

  const stop = () => {
    running = false;
    stopEvents.forEach((type) => window.removeEventListener(type, stop));
  };
  stopEvents.forEach((type) => window.addEventListener(type, stop, { passive: true }));

  const step = (t) => {
    if (!running) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (last !== null) {
      y = Math.min(max, y + (max / AUTO_SCROLL_SECONDS) * ((t - last) / 1000));
      window.scrollTo(0, y);
    }
    last = t;
    if (y < max) requestAnimationFrame(step);
  };
  setTimeout(() => requestAnimationFrame(step), 1000);
}

// ---- Countdown -------------------------------------------------------------------

for (const el of document.querySelectorAll('.countdown')) {
  const target = new Date(el.dataset.target).getTime();
  const boxes = Object.fromEntries(
    [...el.querySelectorAll('.cd-box')].map((box) => [box.dataset.unit, box.querySelector('.cd-digits')]),
  );

  const setDigit = (digit, value) => {
    const curr = digit.querySelector('.curr');
    if (curr.textContent === value) return;
    if (curr.textContent === '') { curr.textContent = value; return; }
    digit.querySelector('.next').textContent = value;
    digit.classList.add('flip');
    setTimeout(() => {
      curr.textContent = value;
      digit.classList.remove('flip');
    }, 400);
  };

  const render = (container, value) => {
    const text = String(value).padStart(2, '0');
    while (container.children.length !== text.length) {
      if (container.children.length < text.length) {
        container.insertAdjacentHTML('afterbegin', '<span class="cd-digit"><span class="next"></span><span class="curr"></span></span>');
      } else {
        container.firstElementChild.remove();
      }
    }
    [...container.children].forEach((digit, i) => setDigit(digit, text[i]));
  };

  const tick = () => {
    const s = Math.max(0, Math.floor((target - Date.now()) / 1000));
    render(boxes.days, Math.floor(s / 86400));
    render(boxes.hours, Math.floor(s / 3600) % 24);
    render(boxes.minutes, Math.floor(s / 60) % 60);
    render(boxes.seconds, s % 60);
  };

  tick();
  setInterval(tick, 1000);
}
