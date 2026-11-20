// Golden Hour Cover Studio — the shot driver.
// Reads ?shot=cover|editor plus the photo, caption, layout, grade, style,
// position and size, applies them to the editor, and signals readiness
// (window.__shotReady) so screenshots are reproducible.

'use strict';

(function () {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (!shot) return;

  const app = window.GoldenHour;
  if (!app) return;
  const state = app.state;

  const photo = params.get('photo');
  const caption = params.get('caption');
  const layout = params.get('layout');
  const grade = params.get('grade');
  const style = params.get('style');
  const pos = params.get('pos');
  const size = params.get('size');

  function applyInputs() {
    if (caption) {
      state.title = decodeURIComponent(caption).toUpperCase();
      const titleInput = document.getElementById('titleInput');
      if (titleInput) titleInput.value = state.title;
    }
    if (layout && ['strips', 'grid', 'hero', 'single'].includes(layout)) {
      state.layout = layout;
      app.resetPanels();
      document.querySelectorAll('#layoutRow button').forEach((b) => {
        b.classList.toggle('on', b.dataset.layout === layout);
      });
    }
    if (grade && ['sunset', 'neon', 'noir'].includes(grade)) {
      state.grade = grade;
      document.querySelectorAll('#gradeRow button').forEach((b) => {
        b.classList.toggle('on', b.dataset.grade === grade);
      });
    }
    if (style && ['white', 'sunset', 'neon'].includes(style)) {
      state.style = style;
      document.querySelectorAll('#styleRow button').forEach((b) => {
        b.classList.toggle('on', b.dataset.style === style);
      });
    }
    if (pos && ['top', 'bottom'].includes(pos)) {
      state.pos = pos;
      document.querySelectorAll('#posRow button').forEach((b) => {
        b.classList.toggle('on', b.dataset.pos === pos);
      });
    }
    if (size && app.EXPORT_SIZES[size]) state.exportSize = size;
  }

  function whenPhotosReady() {
    return new Promise((resolve) => {
      const want = photo || 'pier';
      const have = state.photos.length > 0;
      if (have) {
        // Put the wanted photo on every panel for a clean shot.
        const idx = state.photoNames.findIndex((n) => n.toLowerCase().includes(want));
        const pick = idx >= 0 ? idx : 0;
        state.panels.forEach((p) => { p.photo = pick; p.zoom = 1; p.ox = 0; p.oy = 0; });
        resolve();
        return;
      }
      app.loadSample(want).then(() => {
        state.panels.forEach((p) => { p.photo = 0; p.zoom = 1; p.ox = 0; p.oy = 0; });
        resolve();
      });
    });
  }

  // Cover shots show the cover alone: hide the editor chrome so the
  // screenshot is the artwork, not the app around it.
  if (shot === 'cover') {
    const style = document.createElement('style');
    style.textContent = [
      'body { background: #0c0a09; }',
      '.topbar, .panel, .hint { display: none !important; }',
      '.studio { display: block; padding: 0; }',
      '.canvas-wrap { border: 0; border-radius: 0; padding: 0; background: transparent; }',
      '#coverCanvas { width: 100vw; height: 100vh; object-fit: contain; border-radius: 0; }',
    ].join('\n');
    document.head.appendChild(style);
  }

  // Auto-export: ?shot=cover&autoexport=1 draws the real export and reports it.
  const autoexport = params.get('autoexport') === '1';

  function finish() {
    applyInputs();
    whenPhotosReady().then(() => {
      app.redraw();
      if (!autoexport) {
        window.__shotReady = true;
        return;
      }
      const [w, h] = app.EXPORT_SIZES[state.exportSize] || [1080, 1080];
      window.GoldenHourCover.exportCover(state, w, h).then((blob) => {
        const el = document.createElement('div');
        el.id = 'autoexport-result';
        el.textContent = JSON.stringify({ width: w, height: h, bytes: blob.size, type: blob.type });
        document.body.appendChild(el);
        window.__shotReady = true;
      }).catch(() => {
        window.__shotReady = true;
      });
    });
  }

  // The editor boots asynchronously (it loads the sample photos first);
  // wait a tick so its state exists, then apply the shot.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(finish, 50));
  } else {
    setTimeout(finish, 50);
  }
})();
