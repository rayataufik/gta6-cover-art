// shots.js — deterministic screenshot states for Golden Hour Cover Studio.
//
// The app reads its query string so a screenshot is reproducible: the
// same address always draws the same cover. Used by the entry's maker
// to take the screenshots, and by anyone checking the app.
//
//   ?shot=cover&photo=pier&caption=SUNSET%20HEIST&layout=strips
//       &grade=sunset&style=sunset&size=1080x1080
//     draws the cover full-screen, editor chrome hidden.
//   ?shot=editor&photo=boulevard&caption=BOULEVARD%20QUEEN&layout=grid
//       &grade=neon
//     shows the editor with that photo and caption loaded.
//   photo: pier | boulevard | both (both loads pier, then boulevard)
//   layout: strips | grid | hero | single
//   grade: sunset | neon | noir
//   style: white | sunset | neon
//   pos: top | bottom
//   size: 1080x1080 | 1080x1350 | 1920x1080
//   title: caption size in percent, 70..140
//
// When the state is drawn, window.__shotReady is set to true, so a
// screenshot runner knows the frame is ready.

(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var shot = params.get('shot');
  if (!shot) return;

  function text(name, fallback) {
    var v = params.get(name);
    return v == null || v === '' ? fallback : v;
  }

  function applyShot() {
    var app = window.__coverApp;
    if (!app) return;
    var photo = text('photo', 'pier');
    var layout = text('layout', 'strips');
    var grade = text('grade', 'sunset');
    var style = text('style', 'sunset');
    var pos = text('pos', 'bottom');
    var size = text('size', '1080x1080');
    var titleSize = Number(text('title', '100')) || 100;

    app.state.title = text('caption', app.state.title);
    app.state.subtitle = text('subtitle', app.state.subtitle);
    app.state.titleSize = Math.min(1.4, Math.max(0.7, titleSize / 100));
    // Keep the editor's inputs showing the same state the cover draws.
    var titleInput = document.getElementById('titleInput');
    if (titleInput) titleInput.value = app.state.title;
    var subtitleInput = document.getElementById('subtitleInput');
    if (subtitleInput) subtitleInput.value = app.state.subtitle;
    var sizeSlider = document.getElementById('titleSize');
    if (sizeSlider) sizeSlider.value = String(Math.round(app.state.titleSize * 100));
    app.setLayout(layout);
    app.setGrade(grade);
    app.setCaptionStyle(style);
    app.setCaptionPos(pos);
    app.setExportSize(size);

    var loads = [];
    if (photo === 'both') {
      loads.push(app.loadSample('pier'));
      loads.push(app.loadSample('boulevard'));
    } else {
      loads.push(app.loadSample(photo));
    }
    return Promise.all(loads.map(function (p) { return p.catch(function () {}); })).then(function () {
      // With two photos, spread them across the panels: panel i takes
      // photo i, so the cover shows both pictures.
      if (photo === 'both' && app.state.photos.length >= 2) {
        for (var i = 0; i < app.state.panels.length; i++) {
          app.state.panels[i].photo = i % app.state.photos.length;
        }
      }
      if (shot === 'cover') {
        document.body.classList.add('shot-cover');
        var stage = document.getElementById('stage');
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        stage.width = vw;
        stage.height = vh;
        window.CoverArt.drawCover(stage.getContext('2d'), vw, vh, app.state);
      } else {
        app.redraw();
      }
      window.__shotReady = true;
    });
  }

  if (window.__coverApp && window.__coverApp.ready) {
    window.__coverApp.ready.then(applyShot);
  } else {
    window.addEventListener('load', function () {
      if (window.__coverApp && window.__coverApp.ready) {
        window.__coverApp.ready.then(applyShot);
      }
    });
  }
})();
