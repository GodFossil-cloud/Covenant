/*! Covenant Tab Weld v0.1.0
   Purpose: keep ToC + Mirror tabs welded to the live top edge of their panels during drag/snap/tap,
   eliminating any independent "gradual reposition" of the tabs.
*/
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;

  function byId(id) { return doc.getElementById(id); }

  // Resolve calc()/var()-based custom properties to computed px using a probe element.
  var probeEl = null;

  function getProbeEl() {
    if (probeEl) return probeEl;
    try {
      var el = doc.createElement('div');
      el.setAttribute('data-covenant-css-probe', 'tab-weld');
      el.style.position = 'fixed';
      el.style.left = '0';
      el.style.top = '0';
      el.style.width = '0';
      el.style.height = '0';
      el.style.overflow = 'hidden';
      el.style.visibility = 'hidden';
      el.style.pointerEvents = 'none';
      (doc.body || doc.documentElement).appendChild(el);
      probeEl = el;
      return el;
    } catch (err) {
      return null;
    }
  }

  function resolveVarPx(varName) {
    try {
      var el = getProbeEl();
      if (!el) return 0;
      el.style.marginTop = 'var(' + varName + ')';
      var raw = getComputedStyle(el).marginTop;
      var v = parseFloat(String(raw || '').trim());
      return isNaN(v) ? 0 : v;
    } catch (err) {
      return 0;
    }
  }

  function readElVarPx(el, varName) {
    try {
      if (!el) return 0;
      var raw = getComputedStyle(el).getPropertyValue(varName);
      var v = parseFloat(String(raw || '').trim());
      return isNaN(v) ? 0 : v;
    } catch (err) {
      return 0;
    }
  }

  function setVarPx(el, varName, v) {
    try {
      if (!el) return;
      var n = (typeof v === 'number' && isFinite(v)) ? v : 0;
      el.style.setProperty(varName, Math.round(n) + 'px');
    } catch (err) {}
  }

  function isTocActive() {
    return !!(
      root.classList.contains('toc-opening')
      || root.classList.contains('toc-closing')
      || root.classList.contains('toc-open')
    );
  }

  function isReliquaryActive() {
    return !!(
      root.classList.contains('reliquary-opening')
      || root.classList.contains('reliquary-closing')
      || root.classList.contains('reliquary-open')
    );
  }

  function weldToC() {
    var panel = byId('tocPanel');
    var toggle = byId('tocToggle');
    if (!panel || !toggle || !panel.getBoundingClientRect || !toggle.getBoundingClientRect) return;

    var dockRaise = resolveVarPx('--dock-tab-raise') || 0;

    var dragX = readElVarPx(toggle, '--toc-toggle-drag-x');
    var dragY = readElVarPx(toggle, '--toc-toggle-drag-y');

    var t = toggle.getBoundingClientRect();
    var baseLeft = t.left - dragX;
    var baseTop = t.top - dockRaise - dragY;

    var p = panel.getBoundingClientRect();

    var notchH = resolveVarPx('--toc-notch-h') || 0;
    var seatDy = resolveVarPx('--toc-seat-dy') || 0;
    var overlap = resolveVarPx('--toc-seat-overlap') || 0;

    var dx = p.left - baseLeft;

    var targetTop = p.top + notchH - t.height;
    targetTop = targetTop + seatDy + overlap;

    var dy = targetTop - baseTop;

    setVarPx(toggle, '--toc-toggle-drag-x', dx);
    setVarPx(toggle, '--toc-toggle-drag-y', dy);

    // Cap seat: keep medallion centered in the header socket.
    try {
      var header = panel.querySelector('.toc-panel-header');
      var cap = toggle.querySelector('.dock-cap');
      var glyph = toggle.querySelector('.toc-glyph');
      if (!header || !cap || !glyph || !header.getBoundingClientRect || !cap.getBoundingClientRect) return;

      var headerRect = header.getBoundingClientRect();
      var headerCenterY = headerRect.top + (headerRect.height / 2);

      var lift = resolveVarPx('--dock-cap-lift') || 10;
      var capSize = resolveVarPx('--dock-cap-size') || 46;
      var capHalf = capSize / 2;

      // Base toggle top after we have set dy.
      var baseToggleTop = baseTop;

      // Absolute seat shift that puts the cap center on headerCenterY.
      var capCenterAtShift0 = baseToggleTop + dy + (-1 * lift) + capHalf;
      var capShift = headerCenterY - capCenterAtShift0;

      cap.style.transition = 'none';
      glyph.style.transition = 'none';

      cap.style.transform = 'translate3d(-50%,' + ((-1 * lift) + capShift) + 'px,0)';
      glyph.style.transform = 'translate3d(-50%,-50%,0) translateY(' + (-0.5 + capShift) + 'px)';

      cap.style.willChange = 'transform';
      glyph.style.willChange = 'transform';
    } catch (err2) {}
  }

  function weldReliquary() {
    var panel = byId('reliquaryPanel');
    var toggle = byId('mirrorToggle');
    if (!panel || !toggle || !panel.getBoundingClientRect || !toggle.getBoundingClientRect) return;

    var dockRaise = resolveVarPx('--dock-tab-raise') || 0;

    var dragX = readElVarPx(toggle, '--reliquary-toggle-drag-x');
    var dragY = readElVarPx(toggle, '--reliquary-toggle-drag-y');

    var t = toggle.getBoundingClientRect();
    var baseRight = t.right - dragX;
    var baseTop = t.top - dockRaise - dragY;

    var p = panel.getBoundingClientRect();

    var notchH = resolveVarPx('--reliquary-notch-h') || 0;
    var seatDy = resolveVarPx('--reliquary-seat-dy') || 0;
    var overlap = resolveVarPx('--reliquary-seat-overlap') || 0;

    var dx = p.right - baseRight;

    var targetTop = p.top + notchH - t.height;
    targetTop = targetTop + seatDy + overlap;

    var dy = targetTop - baseTop;

    setVarPx(toggle, '--reliquary-toggle-drag-x', dx);
    setVarPx(toggle, '--reliquary-toggle-drag-y', dy);

    // Cap seat: move the Mirror cap into the header connector strip.
    try {
      var header = panel.querySelector('.reliquary-panel-header');
      var cap = toggle.querySelector('.dock-cap');
      if (!header || !cap || !header.getBoundingClientRect || !cap.getBoundingClientRect) return;

      var headerRect = header.getBoundingClientRect();
      var headerCenterY = headerRect.top + (headerRect.height / 2);

      var capRect = cap.getBoundingClientRect();
      var capCenterY = capRect.top + (capRect.height / 2);

      var currentShift = readElVarPx(toggle, '--mirror-cap-shift-y');
      var nextShift = currentShift + (headerCenterY - capCenterY);

      if (!isFinite(nextShift)) nextShift = 0;
      if (nextShift > 240) nextShift = 240;
      if (nextShift < -240) nextShift = -240;

      setVarPx(toggle, '--mirror-cap-shift-y', nextShift);
    } catch (err3) {}
  }

  function tick() {
    try {
      var tocActive = isTocActive();
      var relActive = isReliquaryActive();

      var tocToggle = byId('tocToggle');
      var relToggle = byId('mirrorToggle');

      // Disable independent tab transitions while the panels are moving.
      if (tocToggle) {
        tocToggle.classList.toggle('is-toc-dragging', !!(root.classList.contains('toc-opening') || root.classList.contains('toc-closing')));
      }

      if (relToggle) {
        relToggle.classList.toggle('is-reliquary-dragging', !!(root.classList.contains('reliquary-opening') || root.classList.contains('reliquary-closing')));
      }

      if (tocActive) weldToC();
      if (relActive) weldReliquary();
    } catch (err) {}

    requestAnimationFrame(tick);
  }

  function start() {
    if (!window.requestAnimationFrame) return;
    requestAnimationFrame(tick);
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
