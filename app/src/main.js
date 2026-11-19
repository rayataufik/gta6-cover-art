// main.js — the editor for Golden Hour Cover Studio.
//
// Owns the state, the controls and the live preview. It loads the user's
// photos (file picker, drag and drop, or the two free sample photos),
// lets them pick a layout, a grade and a caption, crop each panel by
// dragging and scrolling on the preview, and export a PNG in one of the
// three post sizes. Everything runs on the person's own machine: no
// photo is ever uploaded anywhere.

(function () {
  'use strict';

  var EXPORT_SIZES = [
    { id: '1080x1080', w: 1080, h: 1080, label: '1080 x 1080' },
    { id: '1080x1350', w: 1080, h: 1350, label: '1080 x 1350' },
    { id: '1920x1080', w: 1920, h: 1080, label: '1920 x 1080' },
  ];

  var SAMPLES = [
    { id: 'pier', label: 'Pier dusk', src: 'samples/pier.jpg' },
    { id: 'boulevard', label: 'Boulevard', src: 'samples/boulevard.jpg' },
  ];

  var state = {
    photos: [],
    panels: window.CoverArt.defaultPanels('strips'),
    layout: 'strips',
    grade: 'sunset',
    title: 'SUNSET HEIST',
    subtitle: 'A GOLDEN HOUR STORY',
    titleSize: 1,
    captionPos: 'bottom',
    captionStyle: 'sunset',
    exportSize: EXPORT_SIZES[0],
  };

  var selectedPanel = 0;
  var stage = null;
  var stageCtx = null;
  var readyResolve = null;
  var readyPromise = new Promise(function (resolve) { readyResolve = resolve; });

  function $(id) { return document.getElementById(id); }

  function previewSize() {
    var s = state.exportSize;
    var scale = Math.min(1, 720 / Math.max(s.w, s.h));
    return { w: Math.round(s.w * scale), h: Math.round(s.h * scale) };
  }

  function redraw() {
    if (!stage || !stageCtx) return;
    var size = previewSize();
    if (stage.width !== size.w || stage.height !== size.h) {
      stage.width = size.w;
      stage.height = size.h;
    }
    window.CoverArt.drawCover(stageCtx, size.w, size.h, state);
    highlightSelected();
  }

  // A dashed outline around the selected panel, in preview coordinates.
  function highlightSelected() {
    var size = previewSize();
    var rects = window.CoverArt.layoutPanels(size.w, size.h, state.layout);
    var rect = rects[selectedPanel];
    if (!rect) return;
    stageCtx.save();
    stageCtx.strokeStyle = '#ffd76a';
    stageCtx.lineWidth = 2;
    stageCtx.setLineDash([8, 6]);
    stageCtx.strokeRect(rect.x + 3, rect.y + 3, rect.w - 6, rect.h - 6);
    stageCtx.restore();
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('could not load ' + src)); };
      img.src = src;
    });
  }

  function addPhoto(img) {
    state.photos.push(img);
    // A new photo fills the selected panel first, then the rest.
    state.panels[selectedPanel].photo = state.photos.length - 1;
    redraw();
    refreshPanelPicker();
  }

  function loadSample(id) {
    var sample = null;
    for (var i = 0; i < SAMPLES.length; i++) {
      if (SAMPLES[i].id === id) sample = SAMPLES[i];
    }
    if (!sample) return Promise.reject(new Error('no sample ' + id));
    return loadImage(sample.src).then(addPhoto);
  }

  function loadFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        loadImage(reader.result).then(function (img) {
          addPhoto(img);
          resolve();
        }, reject);
      };
      reader.onerror = function () { reject(new Error('could not read ' + file.name)); };
      reader.readAsDataURL(file);
    });
  }

  function setLayout(layout) {
    if (!window.CoverArt.LAYOUTS[layout]) return;
    var old = state.panels;
    state.layout = layout;
    state.panels = window.CoverArt.defaultPanels(layout);
    for (var i = 0; i < state.panels.length && i < old.length; i++) {
      state.panels[i].photo = old[i].photo;
    }
    selectedPanel = 0;
    redraw();
    refreshPanelPicker();
    syncButtons();
  }

  function setGrade(grade) {
    if (!window.CoverArt.GRADES[grade]) return;
    state.grade = grade;
    redraw();
    syncButtons();
  }

  function setCaptionStyle(style) {
    state.captionStyle = style;
    redraw();
    syncButtons();
  }

  function setCaptionPos(pos) {
    state.captionPos = pos;
    redraw();
    syncButtons();
  }

  function setExportSize(id) {
    for (var i = 0; i < EXPORT_SIZES.length; i++) {
      if (EXPORT_SIZES[i].id === id) state.exportSize = EXPORT_SIZES[i];
    }
    redraw();
    syncButtons();
  }

  function refreshPanelPicker() {
    var picker = $('panelPhoto');
    if (!picker) return;
    picker.innerHTML = '';
    var rects = window.CoverArt.layoutPanels(100, 100, state.layout);
    for (var i = 0; i < rects.length; i++) {
      var opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = 'Panel ' + (i + 1) + ' — photo ' + (state.panels[i].photo + 1);
      picker.appendChild(opt);
    }
    picker.value = String(selectedPanel);
    var photoSel = $('photoChoice');
    if (photoSel) {
      photoSel.innerHTML = '';
      for (var j = 0; j < state.photos.length; j++) {
        var po = document.createElement('option');
        po.value = String(j);
        po.textContent = 'Photo ' + (j + 1);
        photoSel.appendChild(po);
      }
      photoSel.value = String(state.panels[selectedPanel].photo);
    }
  }

  function syncButtons() {
    function mark(groupId, value) {
      var group = $(groupId);
      if (!group) return;
      var buttons = group.querySelectorAll('button');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].classList.toggle('active', buttons[i].dataset.value === value);
      }
    }
    mark('layoutGroup', state.layout);
    mark('gradeGroup', state.grade);
    mark('styleGroup', state.captionStyle);
    mark('posGroup', state.captionPos);
    mark('sizeGroup', state.exportSize.id);
  }

  function exportPNG() {
    var size = state.exportSize;
    var btn = $('exportBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Exporting…';
    }
    return window.CoverArt.exportCover(state, size.w, size.h).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'golden-hour-cover-' + size.id + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Export PNG';
      }
    }, function (err) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Export PNG';
      }
      throw err;
    });
  }

  // Pointer panning on the preview: drag moves the selected panel's
  // photo, the wheel zooms it. A click with no drag selects a panel.
  function bindStage() {
    var dragging = false;
    var moved = false;
    var lastX = 0;
    var lastY = 0;

    function panelAt(clientX, clientY) {
      var box = stage.getBoundingClientRect();
      var x = (clientX - box.left) * (stage.width / box.width);
      var y = (clientY - box.top) * (stage.height / box.height);
      var rects = window.CoverArt.layoutPanels(stage.width, stage.height, state.layout);
      for (var i = 0; i < rects.length; i++) {
        var r = rects[i];
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
      }
      return -1;
    }

    stage.addEventListener('pointerdown', function (e) {
      var hit = panelAt(e.clientX, e.clientY);
      if (hit < 0) return;
      selectedPanel = hit;
      refreshPanelPicker();
      dragging = true;
      moved = false;
      lastX = e.clientX;
      lastY = e.clientY;
      stage.setPointerCapture(e.pointerId);
      redraw();
    });
    stage.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - lastX;
      var dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      lastX = e.clientX;
      lastY = e.clientY;
      var box = stage.getBoundingClientRect();
      var crop = state.panels[selectedPanel];
      crop.px = Math.min(1, Math.max(0, crop.px + dx / box.width));
      crop.py = Math.min(1, Math.max(0, crop.py + dy / box.height));
      redraw();
    });
    stage.addEventListener('pointerup', function () {
      dragging = false;
      if (moved) redraw();
    });
    stage.addEventListener('wheel', function (e) {
      e.preventDefault();
      var crop = state.panels[selectedPanel];
      var factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      crop.zoom = Math.min(4, Math.max(1, crop.zoom * factor));
      redraw();
    }, { passive: false });
  }

  function bindControls() {
    var fileInput = $('fileInput');
    var dropZone = $('dropZone');
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var files = Array.prototype.slice.call(fileInput.files || []);
        var chain = Promise.resolve();
        files.forEach(function (f) {
          chain = chain.then(function () { return loadFile(f); });
        });
        chain.catch(function (err) { showError(err.message); });
        fileInput.value = '';
      });
    }
    if (dropZone) {
      ['dragenter', 'dragover'].forEach(function (ev) {
        dropZone.addEventListener(ev, function (e) {
          e.preventDefault();
          dropZone.classList.add('dragging');
        });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        dropZone.addEventListener(ev, function (e) {
          e.preventDefault();
          dropZone.classList.remove('dragging');
        });
      });
      dropZone.addEventListener('drop', function (e) {
        var files = Array.prototype.slice.call(e.dataTransfer.files || []);
        var chain = Promise.resolve();
        files.forEach(function (f) {
          if (f.type.indexOf('image/') === 0) chain = chain.then(function () { return loadFile(f); });
        });
        chain.catch(function (err) { showError(err.message); });
      });
    }
    var samples = $('sampleGroup');
    if (samples) {
      samples.addEventListener('click', function (e) {
        var btn = e.target.closest('button');
        if (!btn) return;
        loadSample(btn.dataset.value).catch(function (err) { showError(err.message); });
      });
    }
    function groupClick(id, fn) {
      var group = $(id);
      if (!group) return;
      group.addEventListener('click', function (e) {
        var btn = e.target.closest('button');
        if (btn) fn(btn.dataset.value);
      });
    }
    groupClick('layoutGroup', setLayout);
    groupClick('gradeGroup', setGrade);
    groupClick('styleGroup', setCaptionStyle);
    groupClick('posGroup', setCaptionPos);
    groupClick('sizeGroup', setExportSize);

    var title = $('titleInput');
    if (title) {
      title.addEventListener('input', function () {
        state.title = title.value;
        redraw();
      });
    }
    var subtitle = $('subtitleInput');
    if (subtitle) {
      subtitle.addEventListener('input', function () {
        state.subtitle = subtitle.value;
        redraw();
      });
    }
    var sizeSlider = $('titleSize');
    if (sizeSlider) {
      sizeSlider.addEventListener('input', function () {
        state.titleSize = Number(sizeSlider.value) / 100;
        redraw();
      });
    }
    var zoomSlider = $('zoomSlider');
    if (zoomSlider) {
      zoomSlider.addEventListener('input', function () {
        state.panels[selectedPanel].zoom = Number(zoomSlider.value) / 100;
        redraw();
      });
    }
    var panelPicker = $('panelPhoto');
    if (panelPicker) {
      panelPicker.addEventListener('change', function () {
        selectedPanel = Number(panelPicker.value);
        refreshPanelPicker();
        redraw();
      });
    }
    var photoChoice = $('photoChoice');
    if (photoChoice) {
      photoChoice.addEventListener('change', function () {
        state.panels[selectedPanel].photo = Number(photoChoice.value);
        redraw();
      });
    }
    var exportBtn = $('exportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        exportPNG().catch(function (err) { showError(err.message); });
      });
    }
  }

  function showError(msg) {
    var el = $('errorBox');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    setTimeout(function () { el.hidden = true; }, 5000);
  }

  function boot() {
    stage = $('stage');
    stageCtx = stage.getContext('2d');
    bindStage();
    bindControls();
    syncButtons();
    refreshPanelPicker();
    var fontsReady = (document.fonts && document.fonts.load)
      ? document.fonts.load('100px Anton').catch(function () {})
      : Promise.resolve();
    return fontsReady.then(function () {
      return loadSample('pier');
    }).then(function () {
      redraw();
      readyResolve();
    }).catch(function (err) {
      showError(err.message);
      redraw();
      readyResolve();
    });
  }

  window.__coverApp = {
    state: state,
    redraw: redraw,
    loadSample: loadSample,
    loadFile: loadFile,
    setLayout: setLayout,
    setGrade: setGrade,
    setCaptionStyle: setCaptionStyle,
    setCaptionPos: setCaptionPos,
    setExportSize: setExportSize,
    exportPNG: exportPNG,
    ready: readyPromise,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
