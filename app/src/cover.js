// cover.js — the cover renderer for Golden Hour Cover Studio.
//
// Pure drawing code: it takes a plain state object and a canvas context
// and paints a multi-panel GTA-style poster. It knows nothing about the
// page, the network or the file system, so the same code draws the live
// preview, the screenshot states and the exported PNG.
//
// State shape:
//   photos:  loaded images (HTMLImageElement), in upload order
//   panels:  one crop per panel: { photo, zoom, px, py }
//            photo is an index into photos; zoom is >= 1; px/py in [0, 1]
//            are the photo's anchor inside the panel (0.5 = centred)
//   layout:  'strips' | 'grid' | 'hero' | 'single'
//   grade:   'sunset' | 'neon' | 'noir'
//   title, subtitle: caption text
//   titleSize: caption size multiplier, 0.7 .. 1.4
//   captionPos: 'top' | 'bottom'
//   captionStyle: 'white' | 'sunset' | 'neon'

(function () {
  'use strict';

  var LAYOUTS = {
    strips: { panels: 3, label: '3 strips' },
    grid: { panels: 4, label: '2 x 2 grid' },
    hero: { panels: 3, label: 'Big left + 2 stacked' },
    single: { panels: 1, label: 'Full bleed' },
  };

  var GRADES = {
    sunset: { label: 'Sunset' },
    neon: { label: 'Neon' },
    noir: { label: 'Noir' },
  };

  // Default crops: with one photo the panels still read as different
  // framings, because each panel starts on another part of the picture.
  var DEFAULT_CROPS = [
    { photo: 0, zoom: 1.05, px: 0.18, py: 0.42 },
    { photo: 0, zoom: 1.22, px: 0.5, py: 0.5 },
    { photo: 0, zoom: 1.12, px: 0.82, py: 0.58 },
    { photo: 0, zoom: 1.35, px: 0.35, py: 0.3 },
  ];

  function defaultPanels(layout) {
    var n = LAYOUTS[layout].panels;
    var out = [];
    for (var i = 0; i < n; i++) {
      var c = DEFAULT_CROPS[i % DEFAULT_CROPS.length];
      out.push({ photo: c.photo, zoom: c.zoom, px: c.px, py: c.py });
    }
    return out;
  }

  // Panel rectangles for a layout, in cover coordinates. The poster is
  // full bleed: panels run to the canvas edge and only the gutters
  // between them show the dark backing.
  function layoutPanels(w, h, layout) {
    var g = Math.max(4, Math.round(Math.min(w, h) * 0.012));
    var rects = [];
    if (layout === 'strips') {
      var pw = (w - g * 2) / 3;
      for (var i = 0; i < 3; i++) {
        rects.push({ x: i * (pw + g), y: 0, w: pw, h: h });
      }
    } else if (layout === 'grid') {
      var cw = (w - g) / 2;
      var ch = (h - g) / 2;
      rects.push({ x: 0, y: 0, w: cw, h: ch });
      rects.push({ x: cw + g, y: 0, w: cw, h: ch });
      rects.push({ x: 0, y: ch + g, w: cw, h: ch });
      rects.push({ x: cw + g, y: ch + g, w: cw, h: ch });
    } else if (layout === 'hero') {
      var lw = Math.round(w * 0.62);
      var rw = w - lw - g;
      var rh = (h - g) / 2;
      rects.push({ x: 0, y: 0, w: lw, h: h });
      rects.push({ x: lw + g, y: 0, w: rw, h: rh });
      rects.push({ x: lw + g, y: rh + g, w: rw, h: rh });
    } else {
      rects.push({ x: 0, y: 0, w: w, h: h });
    }
    return rects;
  }

  // A seeded pseudo-random stream, so the film grain is identical on
  // every run and every machine.
  function seededRandom(seed) {
    var s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  var grainTile = null;
  function getGrainTile() {
    if (grainTile) return grainTile;
    var size = 128;
    var tile = document.createElement('canvas');
    tile.width = size;
    tile.height = size;
    var g = tile.getContext('2d');
    var img = g.createImageData(size, size);
    var rnd = seededRandom(20261120);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = Math.floor(rnd() * 256);
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    grainTile = tile;
    return tile;
  }

  // Draws one photo into one panel, cover-fit, at the panel's zoom and
  // pan. Zoom never drops below 1, so the photo always covers the panel.
  function drawPanelPhoto(ctx, img, rect, crop) {
    var iw = img.naturalWidth || img.width;
    var ih = img.naturalHeight || img.height;
    var zoom = Math.max(1, crop.zoom || 1);
    var scale = Math.max(rect.w / iw, rect.h / ih) * zoom;
    var dw = iw * scale;
    var dh = ih * scale;
    var px = Math.min(1, Math.max(0, crop.px == null ? 0.5 : crop.px));
    var py = Math.min(1, Math.max(0, crop.py == null ? 0.5 : crop.py));
    var dx = rect.x + (rect.w - dw) * px;
    var dy = rect.y + (rect.h - dh) * py;
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  function drawEmptyPanel(ctx, rect) {
    var grad = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
    grad.addColorStop(0, '#2b2140');
    grad.addColorStop(0.55, '#57253f');
    grad.addColorStop(1, '#1c2b4a');
    ctx.fillStyle = grad;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(2, rect.w * 0.006);
    ctx.setLineDash([14, 10]);
    ctx.strokeRect(rect.x + 14, rect.y + 14, rect.w - 28, rect.h - 28);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold ' + Math.max(13, Math.round(rect.w * 0.045)) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ADD A PHOTO', rect.x + rect.w / 2, rect.y + rect.h / 2);
  }

  // The colour grade for one panel, painted over its photo.
  function applyGrade(ctx, rect, grade) {
    if (grade === 'sunset') {
      var warm = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
      warm.addColorStop(0, 'rgba(255,176,66,0.10)');
      warm.addColorStop(0.55, 'rgba(255,110,60,0.05)');
      warm.addColorStop(1, 'rgba(255,46,136,0.26)');
      ctx.fillStyle = warm;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    } else if (grade === 'neon') {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      var pink = ctx.createRadialGradient(
        rect.x + rect.w * 0.15, rect.y + rect.h * 0.12, 10,
        rect.x + rect.w * 0.15, rect.y + rect.h * 0.12, Math.max(rect.w, rect.h) * 0.85,
      );
      pink.addColorStop(0, 'rgba(255,0,180,0.34)');
      pink.addColorStop(1, 'rgba(255,0,180,0)');
      ctx.fillStyle = pink;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      var cyan = ctx.createRadialGradient(
        rect.x + rect.w * 0.9, rect.y + rect.h * 0.9, 10,
        rect.x + rect.w * 0.9, rect.y + rect.h * 0.9, Math.max(rect.w, rect.h) * 0.85,
      );
      cyan.addColorStop(0, 'rgba(0,220,255,0.32)');
      cyan.addColorStop(1, 'rgba(0,220,255,0)');
      ctx.fillStyle = cyan;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
    } else {
      // noir: a cool shadow wash; the photo itself is drawn greyscale.
      ctx.fillStyle = 'rgba(24,58,86,0.14)';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
  }

  function drawPanelBorder(ctx, rect, w) {
    var lw = Math.max(2, Math.round(w * 0.004));
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = lw;
    ctx.strokeRect(rect.x + lw / 2, rect.y + lw / 2, rect.w - lw, rect.h - lw);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = Math.max(1, lw / 2);
    ctx.strokeRect(rect.x + lw + 1, rect.y + lw + 1, rect.w - 2 * lw - 2, rect.h - 2 * lw - 2);
    ctx.restore();
  }

  // Film grain and a vignette over the whole cover, after the panels.
  function applyFinish(ctx, w, h) {
    var tile = getGrainTile();
    var pattern = ctx.createPattern(tile, 'repeat');
    ctx.save();
    ctx.globalAlpha = 0.055;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    var vig = ctx.createRadialGradient(
      w / 2, h / 2, Math.min(w, h) * 0.42,
      w / 2, h / 2, Math.max(w, h) * 0.75,
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  // The caption: a big Anton title and a letter-spaced subtitle, over a
  // soft dark band so the lettering reads on any photo.
  function drawCaption(ctx, w, h, state) {
    var pad = Math.round(h * 0.045);
    var title = (state.title || '').trim().toUpperCase();
    var subtitle = (state.subtitle || '').trim().toUpperCase();
    if (!title && !subtitle) return;
    var bandH = Math.round(h * (title ? 0.24 : 0.1));
    var bandY = state.captionPos === 'top' ? 0 : h - bandH;
    var band = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
    if (state.captionPos === 'top') {
      band.addColorStop(0, 'rgba(0,0,0,0.62)');
      band.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
      band.addColorStop(0, 'rgba(0,0,0,0)');
      band.addColorStop(1, 'rgba(0,0,0,0.62)');
    }
    ctx.fillStyle = band;
    ctx.fillRect(0, bandY, w, bandH);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    var subSize = Math.max(13, Math.round(h * 0.028));
    var titleSize = Math.round(h * 0.115 * (state.titleSize || 1));
    var gap = Math.round(h * 0.018);
    var accent = state.captionStyle === 'neon' ? '#37e6ff'
      : state.captionStyle === 'sunset' ? '#ffb13c' : '#ffffff';

    // Shrink the title until it fits the cover with room to spare.
    var maxW = w - pad * 2;
    var size = titleSize;
    var titleW = 0;
    if (title) {
      for (;;) {
        ctx.font = size + 'px Anton, "Arial Narrow", sans-serif';
        try { ctx.letterSpacing = Math.round(size * 0.03) + 'px'; } catch (e) { /* older canvas: no letter spacing */ }
        titleW = ctx.measureText(title).width;
        if (titleW <= maxW || size <= 20) break;
        size = Math.floor(size * 0.92);
      }
    }

    // Bottom: the title's baseline sits above the subtitle; top: the
    // title first, the subtitle under it.
    var titleBaseline;
    var subBaseline;
    if (state.captionPos === 'top') {
      titleBaseline = pad + size;
      subBaseline = titleBaseline + gap + subSize;
    } else {
      subBaseline = h - pad;
      titleBaseline = subBaseline - (subtitle ? gap + subSize : 0);
    }

    if (title) {
      ctx.font = size + 'px Anton, "Arial Narrow", sans-serif';
      try { ctx.letterSpacing = Math.round(size * 0.03) + 'px'; } catch (e) {}
      var grad = null;
      if (state.captionStyle === 'sunset') {
        grad = ctx.createLinearGradient(w / 2 - titleW / 2, 0, w / 2 + titleW / 2, 0);
        grad.addColorStop(0, '#ffd76a');
        grad.addColorStop(0.5, '#ff7a3c');
        grad.addColorStop(1, '#ff2e88');
      } else if (state.captionStyle === 'neon') {
        grad = ctx.createLinearGradient(w / 2 - titleW / 2, 0, w / 2 + titleW / 2, 0);
        grad.addColorStop(0, '#7df9ff');
        grad.addColorStop(0.5, '#e08cff');
        grad.addColorStop(1, '#ff5ce1');
      }
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = Math.round(size * 0.08);
      ctx.shadowOffsetY = Math.round(size * 0.03);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#101014';
      ctx.lineWidth = Math.max(2, Math.round(size * 0.075));
      ctx.strokeText(title, w / 2, titleBaseline);
      ctx.fillStyle = grad || '#ffffff';
      ctx.fillText(title, w / 2, titleBaseline);
      ctx.restore();
    }

    if (subtitle) {
      ctx.font = 'bold ' + subSize + 'px system-ui, "Segoe UI", sans-serif';
      try { ctx.letterSpacing = Math.round(subSize * 0.42) + 'px'; } catch (e) {}
      var subW = ctx.measureText(subtitle).width;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(subtitle, w / 2, subBaseline);
      ctx.restore();
      // A short accent bar between the title and the subtitle, centred.
      // Bottom: just under the title's baseline; top: just under the
      // subtitle, so it never crosses the lettering.
      var barW = Math.min(subW, Math.round(w * 0.22));
      var barY = state.captionPos === 'top'
        ? subBaseline + Math.round(subSize * 0.5)
        : titleBaseline + Math.round(gap * 0.5);
      ctx.fillStyle = accent;
      ctx.fillRect(Math.round((w - barW) / 2), Math.round(barY), barW, Math.max(3, Math.round(h * 0.004)));
    }
    ctx.restore();
  }

  // The whole cover, at any pixel size.
  function drawCover(ctx, w, h, state) {
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0d0d12';
    ctx.fillRect(0, 0, w, h);
    var rects = layoutPanels(w, h, state.layout);
    for (var i = 0; i < rects.length; i++) {
      var rect = rects[i];
      var crop = state.panels[i] || { photo: 0, zoom: 1, px: 0.5, py: 0.5 };
      var img = state.photos[crop.photo];
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.w, rect.h);
      ctx.clip();
      if (img) {
        if (state.grade === 'noir') {
          try { ctx.filter = 'grayscale(1) contrast(1.12) brightness(1.03)'; } catch (e) {}
        }
        drawPanelPhoto(ctx, img, rect, crop);
        try { ctx.filter = 'none'; } catch (e) {}
        applyGrade(ctx, rect, state.grade);
      } else {
        drawEmptyPanel(ctx, rect);
      }
      ctx.restore();
      drawPanelBorder(ctx, rect, w);
    }
    applyFinish(ctx, w, h);
    drawCaption(ctx, w, h, state);
    ctx.restore();
  }

  // Renders the cover at full export size and hands back a PNG blob.
  function exportCover(state, w, h) {
    return new Promise(function (resolve, reject) {
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('no 2d canvas'));
        return;
      }
      drawCover(ctx, w, h, state);
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error('export produced no PNG'));
      }, 'image/png');
    });
  }

  window.CoverArt = {
    LAYOUTS: LAYOUTS,
    GRADES: GRADES,
    defaultPanels: defaultPanels,
    layoutPanels: layoutPanels,
    drawCover: drawCover,
    exportCover: exportCover,
  };
})();
