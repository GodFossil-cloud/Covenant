/*! Covenant iOS Dock Gesture Guard v0.1.1
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
  // (iOS PointerEvents support is imperfect; we still also guard touchmove below.)
  try { if (tocToggle) tocToggle.style.touchAction = 'none'; } catch (err1) {}
  try { if (mirrorToggle) mirrorToggle.style.touchAction = 'none'; } catch (err2) {}

  // Track a "finger is down on a dock drag handle" session.
  // IMPORTANT: do NOT preventDefault touchstart (it can suppress the click).
  var dockTouchActive = false;
  var dockTouchId = null;

  function beginDockTouchSession(e) {
    try {
      if (!e || !e.changedTouches || !e.changedTouches.length) return;
      var t = e.changedTouches[0];
      if (!t) return;
      dockTouchActive = true;
      dockTouchId = t.identifier;
    } catch (err) {
      dockTouchActive = true;
      dockTouchId = null;
    }
  }

  function endDockTouchSession(e) {
    if (!dockTouchActive) return;

    try {
      if (!e || !e.changedTouches || dockTouchId == null) {
        dockTouchActive = false;
        dockTouchId = null;
        return;
      }

      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i] && e.changedTouches[i].identifier === dockTouchId) {
          dockTouchActive = false;
          dockTouchId = null;
          return;
        }
      }
    } catch (err) {
      dockTouchActive = false;
      dockTouchId = null;
    }
  }

  // On iOS Safari, the 1px tick is often visual viewport movement (rubber-band/scroll leakage).
  // Block touchmove outside the panel body during:
  // - active ToC/Reliquary motion states, OR
  // - an active dock touch session (finger down on ToC/Mirror).
  var blocker = null;
  var OPTS = { capture: true, passive: false };

  function isActive() {
    try {
      if (dockTouchActive) return true;

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

  // PointerEvents hardening (helps some iOS builds, but touchmove is the primary fix).
  function seedGuard(e) {
    if (!e) return;
    if (e.cancelable) e.preventDefault();
  }

  try {
    if (tocToggle) {
      tocToggle.addEventListener('touchstart', beginDockTouchSession, { capture: true, passive: true });
      tocToggle.addEventListener('touchend', endDockTouchSession, { capture: true, passive: true });
      tocToggle.addEventListener('touchcancel', endDockTouchSession, { capture: true, passive: true });

      tocToggle.addEventListener('pointerdown', seedGuard, true);
      tocToggle.addEventListener('pointermove', seedGuard, true);
    }

    if (mirrorToggle) {
      mirrorToggle.addEventListener('touchstart', beginDockTouchSession, { capture: true, passive: true });
      mirrorToggle.addEventListener('touchend', endDockTouchSession, { capture: true, passive: true });
      mirrorToggle.addEventListener('touchcancel', endDockTouchSession, { capture: true, passive: true });

      mirrorToggle.addEventListener('pointerdown', seedGuard, true);
      mirrorToggle.addEventListener('pointermove', seedGuard, true);
    }

    // Safety net: if the touch ends elsewhere, stop the session.
    doc.addEventListener('touchend', endDockTouchSession, { capture: true, passive: true });
    doc.addEventListener('touchcancel', endDockTouchSession, { capture: true, passive: true });
  } catch (err3) {}
})();
