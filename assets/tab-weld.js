/*! Covenant Tab Weld v0.1.2
   Purpose: keep ToC + Mirror tabs welded to the live top edge of their panels during drag/snap/tap.

   v0.1.2: seat tabs flush to the panel top edge (ignore notch-centering vars),
           and treat ToC as active based on panel state (.is-open) not root toc-open.
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

  function hasState(el, cls) {
    try { return !!(el && el.classList && el.classList.contains(cls)); } catch (err) { return false; }
  }

  function isTocActive() {
    var panel = byId('tocPanel');

    if (root.classList.contains('toc-opening') || root.classList.contains('toc-closing')) return true;

    // ToC does not set html.toc-open; use panel state.
    if (hasState(panel, 'is-open') || hasState(panel, 'is-dragging') || hasState(panel, 'is-closing')) return true;

    return false;
  }

  function isReliquaryActive() {
    var panel = byId('reliquaryPanel');

    if (root.classList.contains('reliquary-opening') || root.classList.contains('reliquary-closing') || root.classList.contains('reliquary-open')) return true;

    if (hasState(panel, 'is-open') || hasState(panel, 'is-dragging')) return true;

    return false;
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

    var dx = p.left - baseLeft;

    // Seat the tab on the panel top edge: tab bottom flush to panel top.
    var tabTop = p.top - t.height;
    var dy = tabTop - baseTop;

    setVarPx(toggle, '--toc-toggle-drag-x', dx);
    setVarPx(toggle, '--toc-toggle-drag-y', dy);

    // Cap seat: keep medallion sitting on the panel top edge (cap bottom flush to panel top).
    try {
      var cap = toggle.querySelector('.dock-cap');
      var glyph = toggle.querySelector('.toc-glyph');
      if (!cap || !glyph) return;

      var lift = resolveVarPx('--dock-cap-lift') || 10;
      var capSize = resolveVarPx('--dock-cap-size') || 46;
      var capHalfH = capSize / 2;

      // Want cap bottom at p.top => capTop = p.top - capHalfH.
      var desiredCapTop = p.top - capHalfH;

      // capTop = tabTop + (-lift + capShift).
      var capShift = desiredCapTop - tabTop + lift;

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

    var dx = p.right - baseRight;

    // Seat the tab on the panel top edge: tab bottom flush to panel top.
    var tabTop = p.top - t.height;
    var dy = tabTop - baseTop;

    setVarPx(toggle, '--reliquary-toggle-drag-x', dx);
    setVarPx(toggle, '--reliquary-toggle-drag-y', dy);

    // Cap seat: keep the Mirror medallion sitting on the panel edge (cap bottom flush to panel top).
    try {
      var cap = toggle.querySelector('.dock-cap');
      if (!cap || !cap.getBoundingClientRect) return;

      var capRect = cap.getBoundingClientRect();
      var desiredBottom = p.top;

      var currentShift = readElVarPx(toggle, '--mirror-cap-shift-y');
      var nextShift = currentShift + (desiredBottom - capRect.bottom);

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

      var tocPanel = byId('tocPanel');
      var relPanel = byId('reliquaryPanel');

      // Disable independent tab transitions while the panels are moving.
      if (tocToggle) {
        var tocDragging = root.classList.contains('toc-opening') || root.classList.contains('toc-closing') || hasState(tocPanel, 'is-dragging');
        tocToggle.classList.toggle('is-toc-dragging', !!tocDragging);
      }

      if (relToggle) {
        var relDragging = root.classList.contains('reliquary-opening') || root.classList.contains('reliquary-closing') || hasState(relPanel, 'is-dragging');
        relToggle.classList.toggle('is-reliquary-dragging', !!relDragging);
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
