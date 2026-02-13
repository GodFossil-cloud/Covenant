/*! Covenant iOS Dock Gesture Guard v0.1.0
   Purpose: prevent iOS Safari from initiating page scroll/rubber-band during footer dock gestures,
   which can present as a ~1px vertical tick in fixed UI while dragging ToC/Reliquary panels.

   Non-invasive: does not change panel geometry, does not touch sacred text, does not add navigation.
*/
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;

  function closestSafe(target, selector) {
    if (!target) return null;
    var el = (target.nodeType === 1) ? target : target.parentElement;
    if (!el || !el.closest) return null;
    return el.closest(selector);
  }

  var isIOS = (function () {
    try {
      var ua = navigator.userAgent || '';
      var platform = navigator.platform || '';
      var iOSDevice = /iPad|iPhone|iPod/.test(ua);
      var iPadOS = (platform === 'MacIntel' && navigator.maxTouchPoints && navigator.maxTouchPoints > 1);
      return iOSDevice || iPadOS;
    } catch (err) {
      return false;
    }
  })();

  if (!isIOS) return;

  var tocToggle = doc.getElementById('tocToggle');
  var mirrorToggle = doc.getElementById('mirrorToggle');
  var tocPanel = doc.getElementById('tocPanel');
  var reliquaryPanel = doc.getElementById('reliquaryPanel');

  // Tell the browser: do not treat these as panning surfaces.
  try { if (tocToggle) tocToggle.style.touchAction = 'none'; } catch (err1) {}
  try { if (mirrorToggle) mirrorToggle.style.touchAction = 'none'; } catch (err2) {}

  // On iOS Safari, the 1px tick is often visual viewport movement (rubber-band/scroll leakage).
  // Block touchmove outside the panel body during active motion/drag states.
  var blocker = null;
  var OPTS = { capture: true, passive: false };

  function isActive() {
    try {
      if (root.classList.contains('toc-opening')) return true;
      if (root.classList.contains('toc-closing')) return true;
      if (root.classList.contains('toc-open')) return true;
      if (root.classList.contains('reliquary-opening')) return true;
      if (root.classList.contains('reliquary-closing')) return true;
      if (root.classList.contains('reliquary-open')) return true;
      if (root.classList.contains('reliquary-dragging')) return true;

      if (tocPanel && tocPanel.classList) {
        if (tocPanel.classList.contains('is-dragging')) return true;
        if (tocPanel.classList.contains('is-open')) return true;
        if (tocPanel.classList.contains('is-closing')) return true;
      }

      if (reliquaryPanel && reliquaryPanel.classList) {
        if (reliquaryPanel.classList.contains('is-dragging')) return true;
        if (reliquaryPanel.classList.contains('is-open')) return true;
      }

      return false;
    } catch (err) {
      return false;
    }
  }

  function ensureBlockerInstalled() {
    if (blocker) return;

    blocker = function (e) {
      if (!isActive()) return;

      // Allow scrolling inside the panel bodies.
      if (closestSafe(e.target, '#tocPanel .toc-panel-body')) return;
      if (closestSafe(e.target, '#reliquaryPanel .reliquary-panel-body')) return;

      if (e && e.cancelable) e.preventDefault();
    };

    doc.addEventListener('touchmove', blocker, OPTS);
  }

  // Install immediately (low cost; only blocks when active states are present).
  ensureBlockerInstalled();

  // Extra hardening: prevent default on the initial gesture seed so Safari doesn't begin a pan
  // before PointerEvents drag logic takes over.
  function seedGuard(e) {
    if (!e) return;
    if (e.cancelable) e.preventDefault();
  }

  try {
    if (tocToggle) {
      tocToggle.addEventListener('pointerdown', seedGuard, true);
      tocToggle.addEventListener('pointermove', seedGuard, true);
    }
    if (mirrorToggle) {
      mirrorToggle.addEventListener('pointerdown', seedGuard, true);
      mirrorToggle.addEventListener('pointermove', seedGuard, true);
    }
  } catch (err3) {}
})();
