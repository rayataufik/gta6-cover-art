// Golden Hour Cover Studio — the editor.
// Loads photos, wires the controls, pans and zooms panels, exports the PNG.

'use strict';

const SAMPLES = {
  pier: 'samples/pier.jpg',
  boulevard: 'samples/boulevard.jpg',
};

const EXPORT_SIZES = {
  '1080x1080': [1080, 1080],
  '1080x1350': [1080, 1350],
  '1920x1080': [1920, 1080],
};

/** Fresh editor state. */
function freshState() {
  return {
    layout: 'strips',
    grade: 'sunset',
    title: 'SUNSET HEIST',
    subtitle: 'A GOLDEN HOUR STORY',
    titleSize: 1,
    pos: 'bottom',
    style: 'sunset',
    exportSize: '1080x1080',
    photos: [],
    photoNames: [],
    panels: [],
    selected: 0,
  };
}

const state = freshState();
const canvas = document.getElementById('coverCanvas');

/** (Re)build the panel list for the current layout, keeping photos where they fit. */
function resetPanels() {
  const n = window.GoldenHourCover.panelCount(state.layout);
  const old = state.panels;
  state.panels = [];
  for (let i = 0; i < n; i++) {
    const prev = old[i];
    state.panels.push(prev ? { ...prev } : { photo: 0, zoom: 1, ox: 0, oy: 0 });
  }
  if (state.selected >= n) state.selected = 0;
}

/** Redraw the preview canvas at its display size (square). */
function redraw() {
  const size = 1080;
  window.GoldenHourCover.drawCover(canvas, state, size, size);
  syncControls();
}

/** Keep the dropdowns and slider in step with the state. */
function syncControls() {
  const panelSelect = document.getElementById('panelSelect');
  const photoSelect = document.getElementById('photoSelect');
  const zoom = document.getElementById('zoomSlider');
  const n = state.panels.length;
  if (panelSelect.options.length !== n) {
    panelSelect.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = `Panel ${i + 1}${state.photos.length > 1 ? '' : ''}`;
      panelSelect.appendChild(o);
    }
  }
  panelSelect.value = String(state.selected);
  const names = state.photoNames.length ? state.photoNames : ['No photo yet'];
  if (photoSelect.options.length !== names.length ||
      [...photoSelect.options].some((o, i) => o.textContent !== names[i])) {
    photoSelect.innerHTML = '';
    names.forEach((name, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = name;
      photoSelect.appendChild(o);
    });
  }
  const pan = state.panels[state.selected];
  photoSelect.value = String(pan ? (pan.photo ?? 0) : 0);
  zoom.value = String(pan ? pan.zoom : 1);
}

/** Load an image from a URL or object URL; resolves with the Image or null. */
function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Add loaded images as photos and redraw. */
async function addPhotos(files) {
  let changed = false;
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const img = await loadImage(url);
    if (img) {
      state.photos.push(img);
      state.photoNames.push(file.name || `Photo ${state.photos.length}`);
      changed = true;
    }
  }
  if (changed) {
    // Give every panel a photo if it has none yet.
    state.panels.forEach((p, i) => {
      if (p.photo === null || p.photo === undefined) p.photo = i % state.photos.length;
    });
    redraw();
  }
}

/** Load one of the bundled sample photos. */
async function loadSample(key) {
  const img = await loadImage(SAMPLES[key]);
  if (!img) return;
  if (!state.photos.some((_, i) => state.photoNames[i] === key)) {
    state.photos.push(img);
    state.photoNames.push(key === 'pier' ? 'Pier dusk' : 'Boulevard');
  }
  state.panels.forEach((p, i) => {
    if (state.photos.length === 1) p.photo = 0;
  });
  redraw();
}

/** Which panel is under a point on the displayed canvas. */
function panelAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 1080;
  const y = ((clientY - rect.top) / rect.height) * 1080;
  const rects = window.GoldenHourCover.layoutPanels(state.layout, 1080, 1080);
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}

// ---- controls -----------------------------------------------------------

document.getElementById('photoInput').addEventListener('change', (e) => {
  addPhotos([...e.target.files]);
  e.target.value = '';
});

document.querySelectorAll('[data-sample]').forEach((btn) => {
  btn.addEventListener('click', () => loadSample(btn.dataset.sample));
});

function bindRow(id, key, redrawAfter = true) {
  document.getElementById(id).addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-' + key + ']');
    if (!btn) return;
    document.querySelectorAll(`#${id} button`).forEach((b) => b.classList.toggle('on', b === btn));
    state[key] = btn.dataset[key];
    if (key === 'layout') resetPanels();
    if (redrawAfter) redraw();
  });
}

bindRow('layoutRow', 'layout');
bindRow('posRow', 'pos');
bindRow('styleRow', 'style');
bindRow('gradeRow', 'grade');
bindRow('sizeRow', 'size', false);
document.getElementById('sizeRow').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-size]');
  if (btn) state.exportSize = btn.dataset.size;
});

document.getElementById('panelSelect').addEventListener('change', (e) => {
  state.selected = Number(e.target.value);
  redraw();
});

document.getElementById('photoSelect').addEventListener('change', (e) => {
  const pan = state.panels[state.selected];
  if (pan) {
    pan.photo = Number(e.target.value);
    redraw();
  }
});

document.getElementById('zoomSlider').addEventListener('input', (e) => {
  const pan = state.panels[state.selected];
  if (pan) {
    pan.zoom = Number(e.target.value);
    redraw();
  }
});

document.getElementById('titleInput').addEventListener('input', (e) => {
  state.title = e.target.value;
  redraw();
});

document.getElementById('subtitleInput').addEventListener('input', (e) => {
  state.subtitle = e.target.value;
  redraw();
});

document.getElementById('sizeSlider').addEventListener('input', (e) => {
  state.titleSize = Number(e.target.value);
  redraw();
});

// ---- canvas interaction: pick, pan, zoom -------------------------------

let drag = null;

canvas.addEventListener('pointerdown', (e) => {
  const i = panelAt(e.clientX, e.clientY);
  if (i < 0) return;
  state.selected = i;
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, ox: state.panels[i].ox, oy: state.panels[i].oy };
  redraw();
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const rect = canvas.getBoundingClientRect();
  const pan = state.panels[state.selected];
  const scale = rect.width / 1080;
  pan.ox = drag.ox + (e.clientX - drag.x) / scale / 1080;
  pan.oy = drag.oy + (e.clientY - drag.y) / scale / 1080;
  redraw();
});

canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('pointercancel', () => { drag = null; });

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const pan = state.panels[state.selected];
  if (!pan) return;
  const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
  pan.zoom = Math.max(1, Math.min(3, pan.zoom * factor));
  redraw();
}, { passive: false });

// ---- drag and drop -------------------------------------------------------

canvas.addEventListener('dragover', (e) => e.preventDefault());
canvas.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = [...(e.dataTransfer.files || [])].filter((f) => f.type.startsWith('image/'));
  if (files.length) addPhotos(files);
});

// ---- export --------------------------------------------------------------

document.getElementById('exportBtn').addEventListener('click', async () => {
  const [w, h] = EXPORT_SIZES[state.exportSize] || EXPORT_SIZES['1080x1080'];
  try {
    const blob = await window.GoldenHourCover.exportCover(state, w, h);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `golden-hour-${state.exportSize}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (err) {
    console.error('export failed', err);
  }
});

// ---- boot ----------------------------------------------------------------

resetPanels();
loadSample('pier').then(() => {
  // The pier sample is the default photo; boulevard joins it so panels can mix.
  loadSample('boulevard');
});
redraw();

// Expose the state and a redraw for the shot driver (shots.js).
window.GoldenHour = { state, redraw, loadSample, resetPanels, EXPORT_SIZES };
