// Golden Hour Cover Studio — the cover renderer.
// Draws the multi-panel poster, its grades and its caption onto a canvas,
// and exports it as a PNG. No network, no libraries: plain canvas 2D.

'use strict';

/** A tiny fixed-seed generator, so the grain is identical on every run. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Panel rectangles for a layout, in cover coordinates. */
function layoutPanels(layout, w, h) {
  const gap = Math.round(Math.min(w, h) * 0.008);
  if (layout === 'grid') {
    const cw = (w - gap) / 2, ch = (h - gap) / 2;
    return [
      { x: 0, y: 0, w: cw, h: ch },
      { x: cw + gap, y: 0, w: cw, h: ch },
      { x: 0, y: ch + gap, w: cw, h: ch },
      { x: cw + gap, y: ch + gap, w: cw, h: ch },
    ];
  }
  if (layout === 'hero') {
    const big = Math.round(w * 0.62);
    const side = w - big - gap;
    const half = (h - gap) / 2;
    return [
      { x: 0, y: 0, w: big, h },
      { x: big + gap, y: 0, w: side, h: half },
      { x: big + gap, y: half + gap, w: side, h: half },
    ];
  }
  if (layout === 'single') {
    return [{ x: 0, y: 0, w, h }];
  }
  // strips: three vertical strips.
  const sw = (w - 2 * gap) / 3;
  return [
    { x: 0, y: 0, w: sw, h },
    { x: sw + gap, y: 0, w: sw, h },
    { x: 2 * (sw + gap), y: 0, w: sw, h },
  ];
}

/** How many panels a layout has. */
function panelCount(layout) {
  return layoutPanels(layout, 100, 100).length;
}

/** Draw one photo into a panel rect, cover-fit, with pan and zoom. */
function drawPhotoInto(ctx, img, rect, pan) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const base = Math.max(rect.w / iw, rect.h / ih);
  const scale = base * (pan.zoom || 1);
  const dw = iw * scale, dh = ih * scale;
  // Pan is a fraction of the panel; clamp so the photo still covers it.
  const maxX = Math.max(0, (dw - rect.w) / 2);
  const maxY = Math.max(0, (dh - rect.h) / 2);
  const ox = Math.max(-maxX, Math.min(maxX, (pan.ox || 0) * rect.w));
  const oy = Math.max(-maxY, Math.min(maxY, (pan.oy || 0) * rect.h));
  const dx = rect.x + (rect.w - dw) / 2 + ox;
  const dy = rect.y + (rect.h - dh) / 2 + oy;
  ctx.drawImage(img, dx, dy, dw, dh);
}

/** A warm sunset wash over the whole cover. */
function sunsetWash(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(90, 20, 90, 0.10)');
  g.addColorStop(0.55, 'rgba(255, 110, 0, 0.05)');
  g.addColorStop(1, 'rgba(255, 80, 0, 0.22)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** A magenta/cyan neon wash over the whole cover. */
function neonWash(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, 'rgba(255, 0, 140, 0.12)');
  g.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  g.addColorStop(1, 'rgba(0, 220, 255, 0.14)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** A dark vignette: clear in the middle, dark at the corners. */
function vignette(ctx, w, h, strength) {
  const r = Math.hypot(w, h) / 2;
  const g = ctx.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
  g.addColorStop(0, 'rgba(0, 0, 0, 0)');
  g.addColorStop(1, `rgba(0, 0, 0, ${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Fixed-seed film grain: the same dots on every run. */
function grain(ctx, w, h) {
  const rand = mulberry32(20261120);
  const n = Math.round((w * h) / 420);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const x = rand() * w, y = rand() * h;
    const v = rand() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v}, ${v}, ${v}, 0.05)`;
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  ctx.restore();
}

/** The caption: a big Anton title, a letter-spaced subtitle, a gold rule. */
function drawCaption(ctx, w, h, state) {
  const title = (state.title || '').trim().toUpperCase();
  const subtitle = (state.subtitle || '').trim().toUpperCase();
  if (!title && !subtitle) return;
  const base = w * 0.105 * (state.titleSize || 1);
  const bottom = state.pos !== 'top';
  const margin = h * 0.045;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const cx = w / 2;
  if (title) {
    ctx.font = `${Math.round(base)}px Anton, 'Arial Black', sans-serif`;
    const tw = ctx.measureText(title).width;
    const size = tw > w * 0.94 ? base * (w * 0.94 / tw) : base;
    ctx.font = `${Math.round(size)}px Anton, 'Arial Black', sans-serif`;
    // Title baseline: near the bottom (caption at the foot) or near the top
    // (caption at the head). The rule and the subtitle always follow below
    // the title, so nothing ever runs past an edge.
    const y = bottom
      ? h - margin - (subtitle ? size * 0.42 : 0)
      : margin + size;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, size * 0.09);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    if (state.style === 'neon') {
      ctx.shadowColor = '#00e5ff';
      ctx.shadowBlur = size * 0.45;
      ctx.fillStyle = '#eafcff';
    } else if (state.style === 'sunset') {
      const g = ctx.createLinearGradient(0, y - size, 0, y);
      g.addColorStop(0, '#ffe14d');
      g.addColorStop(0.55, '#ff7b00');
      g.addColorStop(1, '#ff2e63');
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = '#ffffff';
    }
    ctx.strokeText(title, cx, y);
    ctx.fillText(title, cx, y);
    ctx.shadowBlur = 0;
    // Gold rule under the title.
    const rw = Math.min(w * 0.5, ctx.measureText(title).width * 0.62);
    ctx.fillStyle = '#f5a623';
    const ry = y + size * 0.16;
    ctx.fillRect(cx - rw / 2, ry, rw, Math.max(3, size * 0.045));
    if (subtitle) {
      const sub = Math.round(size * 0.26);
      ctx.font = `700 ${sub}px system-ui, sans-serif`;
      const sy = y + size * 0.42;
      ctx.lineWidth = Math.max(2, sub * 0.22);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillStyle = '#fff3d6';
      const spaced = subtitle.split('').join(' ');
      ctx.strokeText(spaced, cx, sy);
      ctx.fillText(spaced, cx, sy);
    }
  } else if (subtitle) {
    const sub = Math.round(w * 0.032);
    ctx.font = `700 ${sub}px system-ui, sans-serif`;
    const y = bottom ? h - margin : margin + sub;
    ctx.lineWidth = Math.max(2, sub * 0.22);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillStyle = '#fff3d6';
    ctx.strokeText(subtitle, cx, y);
    ctx.fillText(subtitle, cx, y);
  }
  ctx.restore();
}

/**
 * Draw the whole cover onto a canvas of the given size.
 * state: { layout, grade, title, subtitle, titleSize, pos, style,
 *          photos: [Image], panels: [{photo, zoom, ox, oy}] }
 */
function drawCover(canvas, state, w, h) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#0c0a09';
  ctx.fillRect(0, 0, w, h);
  const rects = layoutPanels(state.layout, w, h);
  const noir = state.grade === 'noir';
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    const pan = state.panels[i] || { photo: 0, zoom: 1, ox: 0, oy: 0 };
    const img = state.photos[pan.photo ?? 0];
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    if (img) {
      if (noir) ctx.filter = 'grayscale(0.9) contrast(1.18) brightness(0.96)';
      else if (state.grade === 'neon') ctx.filter = 'saturate(1.25) contrast(1.08)';
      drawPhotoInto(ctx, img, rect, pan);
      ctx.filter = 'none';
    } else {
      const g = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
      g.addColorStop(0, '#3a1c40');
      g.addColorStop(1, '#b34700');
      ctx.fillStyle = g;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
    ctx.restore();
    // Panel divider: a dark gap with a thin gold edge.
    ctx.strokeStyle = 'rgba(245, 166, 35, 0.55)';
    ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.002);
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  }
  if (state.grade === 'sunset') sunsetWash(ctx, w, h);
  else if (state.grade === 'neon') neonWash(ctx, w, h);
  vignette(ctx, w, h, state.grade === 'noir' ? 0.55 : 0.42);
  grain(ctx, w, h);
  drawCaption(ctx, w, h, state);
  // Outer frame.
  ctx.strokeStyle = 'rgba(245, 166, 35, 0.8)';
  ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.006);
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
}

/** Draw the cover at an export size and return a PNG blob. */
function exportCover(state, w, h) {
  const canvas = document.createElement('canvas');
  drawCover(canvas, state, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('export failed'));
    }, 'image/png');
  });
}

// Classic-script export: the editor (main.js) reads these off window.
window.GoldenHourCover = { layoutPanels, panelCount, drawCover, exportCover };
