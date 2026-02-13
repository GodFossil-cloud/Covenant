/*! Covenant Tab Weld v0.1.15
   Purpose: keep ToC + Mirror tabs (including the medallion cap) welded to the panel top edge.

   v0.1.3: ensure the cap sits on the panel top edge (not centered in the notch) and
           force drag-frame welding to run after panel drag handlers on iOS Safari.
   v0.1.4: seat the top edge of the clickable pill/tab to the panel top edge.
   v0.1.5: ToC glyph must remain centered in the tab face (do not drag-carry it with cap shift);
           reset inline transforms when panels are not active to avoid "stuck" glyphs.
   v0.1.6: also reset carry vars (--*-toggle-drag-x/y, --mirror-cap-shift-y) when inactive,
           preventing iOS Safari from leaving dock tabs translated "stuck" after close.
   v0.1.7: brute-force pin the ToC hamburger glyph to the center with inline !important styles
           every frame (iOS Safari safety net), so it cannot stick to top/bottom in any state.
   v0.1.8: also clear/override `inset` (Safari shorthand clobber), and schedule a post-frame
           re-pin so late style writes can't strand the glyph at top/bottom.
   v0.1.9: stop fighting iOS Safari with absolute/inset; center the ToC glyph in-flow using
           grid centering on the toggle, so no top/bottom math can strand it.
   v0.1.10: explicitly set ToC glyph edges to auto (left/top/right/bottom) so toc.css can't
            re-apply 50% offsets when the glyph is relative (prevents left drift + above-tab jump).
   v0.1.11: ToC glyph was still being edge-pinned (top/bottom/left/right = 0) by some global
            nav button span rule on iOS; force the glyph to position:static + inset:unset and
            center the toggle via flex. This makes “stick to top/bottom edge” impossible.
   v0.1.12: remove the vertical micro-nudge for the ToC hamburger and rely on a geometric icon
            (CSS bars) so visual centering is true on iOS Safari.
   v0.1.13: fix iOS “bottom-right drift”: when the glyph is absolutely centered with left/top 50%,
            JS must preserve translate(-50%,-50%) when writing transforms.
   v0.1.14: do not clear ToC glyph centering during inactive resets; ensure force-centering runs
            after any reset/weld writes each frame.
   v0.1.15: snap weld math to the device pixel grid (avoid 1px/0px rounding flips that can make the dock notch tick).
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

  function dpr() {
    try {
      var v = window.devicePixelRatio;
      return (typeof v === 'number' && isFinite(v) && v > 0) ? v : 1;
    } catch (err) {
      return 1;
    }
  }

  function snapPx(v) {
    // Snap to the physical pixel grid (prevents 0/1 rounding flip when layout shifts by < 1 CSS px).
    var n = (typeof v === 'number' && isFinite(v)) ? v : 0;
    var r = dpr();

    n = Math.round(n * r) / r;

    // Kill negative zero and micro-noise.
    if (Math.abs(n) < (0.25 / r)) n = 0;

    return n;
  }

  function setVarPx(el, varName, v) {
    try {
      if (!el) return;
      var n = snapPx(v);
      el.style.setProperty(varName, n.toFixed(3) + 'px');
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

  var postPinTimer = 0;

  function schedulePostPin() {
    try {
      if (postPinTimer) return;
      postPinTimer = window.setTimeout(function () {
        postPinTimer = 0;
        forceCenterTocGlyph();
      }, 0);
    } catch (err) {}
  }

  function forceCenterTocGlyph() {
    try {
      var toggle = byId('tocToggle');
      if (!toggle || !toggle.style) return;
      var glyph = toggle.querySelector('.toc-glyph');
      if (!glyph || !glyph.style) return;

      // Center the ToC toggle face via flex.
      toggle.style.setProperty('display', 'flex', 'important');
      toggle.style.setProperty('align-items', 'center', 'important');
      toggle.style.setProperty('justify-content', 'center', 'important');
      toggle.style.setProperty('position', 'relative', 'important');

      // iOS Safari edge-pin killer: force true absolute centering and neutralize edge pins.
      glyph.style.setProperty('position', 'absolute', 'important');
      glyph.style.setProperty('inset', 'auto', 'important');
      glyph.style.setProperty('left', '50%', 'important');
      glyph.style.setProperty('top', '50%', 'important');
      glyph.style.setProperty('right', 'auto', 'important');
      glyph.style.setProperty('bottom', 'auto', 'important');

      glyph.style.setProperty('margin', '0', 'important');
      glyph.style.setProperty('padding', '0', 'important');

      // Geometry box for the CSS hamburger (bars are drawn in CSS, not by font).
      glyph.style.setProperty('display', 'block', 'important');
      glyph.style.setProperty('width', '18px', 'important');
      glyph.style.setProperty('height', '12px', 'important');
      glyph.style.setProperty('font-size', '0', 'important');
      glyph.style.setProperty('line-height', '0', 'important');

      // Preserve the -50%/-50% translate whenever JS writes transform.
      glyph.style.setProperty(
        'transform',
        'translate3d(-50%,-50%,0) translate3d(var(--toc-glyph-nudge-x, 0px), var(--toc-glyph-nudge-y, 0px), 0)',
        'important'
      );
    } catch (err) {}
  }

  function resetInlineWeld(toggle) {
    try {
      if (!toggle) return;
      var cap = toggle.querySelector('.dock-cap');
      var glyph = toggle.querySelector('.toc-glyph');
      if (cap) {
        cap.style.removeProperty('transform');
        cap.style.removeProperty('transition');
        cap.style.removeProperty('will-change');
      }
      if (glyph) {
        // Never clear the ToC glyph centering; it is continuously pinned for iOS Safari.
        if (toggle.id === 'tocToggle') {
          glyph.style.removeProperty('transition');
          glyph.style.removeProperty('will-change');
        } else {
          glyph.style.removeProperty('transform');
          glyph.style.removeProperty('transition');
          glyph.style.removeProperty('will-change');
          glyph.style.removeProperty('inset');
        }
      }

      // Critical: also reset carry vars so iOS Safari can't strand the tab translated after close.
      if (toggle.id === 'tocToggle') {
        toggle.style.setProperty('--toc-toggle-drag-x', '0px');
        toggle.style.setProperty('--toc-toggle-drag-y', '0px');
      } else if (toggle.id === 'mirrorToggle') {
        toggle.style.setProperty('--reliquary-toggle-drag-x', '0px');
        toggle.style.setProperty('--reliquary-toggle-drag-y', '0px');
        toggle.style.setProperty('--mirror-cap-shift-y', '0px');
      }
    } catch (err) {}
  }

  function seatCapToPanelTop(toggle, panel, tabTop) {
    try {
      if (!toggle || !panel) return;

      var cap = toggle.querySelector('.dock-cap');
      var glyph = toggle.querySelector('.toc-glyph');
      if (!cap || !glyph || !cap.getBoundingClientRect) return;

      var p = panel.getBoundingClientRect();
      var capRect = cap.getBoundingClientRect();

      var lift = resolveVarPx('--dock-cap-lift') || 10;
      var capH = (capRect && capRect.height) ? capRect.height : (resolveVarPx('--dock-cap-size') / 2);
      if (!capH || capH <= 0) capH = 23;

      // Want cap bottom at panel top.
      var desiredCapTop = p.top - capH;

      // capTop = tabTop + (-lift + capShift).
      var capShift = desiredCapTop - tabTop + lift;
      capShift = snapPx(capShift);

      cap.style.transition = 'none';
      glyph.style.transition = 'none';

      // Important: beat any inline transforms authored by toc.js/reliquary.js during drag (iOS Safari ordering).
      cap.style.setProperty('transform', 'translate3d(-50%,' + snapPx(((lift) + capShift)) + 'px,0)', 'important');

      // ToC glyph must remain centered in the tab face; do not carry it with capShift.
      if (toggle.id === 'tocToggle') {
        glyph.style.setProperty('transform', 'translate3d(-50%,-50%,0) translate3d(var(--toc-glyph-nudge-x, 0px), var(--toc-glyph-nudge-y, 0px), 0)', 'important');
      } else {
        glyph.style.setProperty('transform', 'translate3d(-50%,-50%,0) translateY(snapPx((capShift)))', 'important');
      }

      cap.style.willChange = 'transform';
      glyph.style.willChange = 'transform';
    } catch (err2) {}
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

    // Seat the tab on the panel top edge: tab top flush to panel top.
    // Note: baseTop excludes --dock-tab-raise; re-apply it here so the computed dy yields a correct viewport top.
    var tabTop = p.top - dockRaise;
    var dy = tabTop - baseTop;

    setVarPx(toggle, '--toc-toggle-drag-x', dx);
    setVarPx(toggle, '--toc-toggle-drag-y', dy);

    seatCapToPanelTop(toggle, panel, tabTop);
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

    // Seat the tab on the panel top edge: tab top flush to panel top.
    // Note: baseTop excludes --dock-tab-raise; re-apply it here so the computed dy yields a correct viewport top.
    var tabTop = p.top - dockRaise;
    var dy = tabTop - baseTop;

    setVarPx(toggle, '--reliquary-toggle-drag-x', dx);
    setVarPx(toggle, '--reliquary-toggle-drag-y', dy);

    // Seat the cap the same way (do not allow header-notch centering to pull it down).
    seatCapToPanelTop(toggle, panel, tabTop);

    // Also keep the legacy shift var coherent (some CSS paths still read it).
    try {
      var cap = toggle.querySelector('.dock-cap');
      if (cap && cap.getBoundingClientRect) {
        var capRect = cap.getBoundingClientRect();
        var desiredBottom = p.top;
        var currentShift = readElVarPx(toggle, '--mirror-cap-shift-y');
        var nextShift = currentShift + (desiredBottom - capRect.bottom);
        if (!isFinite(nextShift)) nextShift = 0;
        if (nextShift > 240) nextShift = 240;
        if (nextShift < -240) nextShift = -240;
        setVarPx(toggle, '--mirror-cap-shift-y', nextShift);
      }
    } catch (err3) {}
  }

  function updateDraggingClasses() {
    try {
      var tocToggle = byId('tocToggle');
      var relToggle = byId('mirrorToggle');

      var tocPanel = byId('tocPanel');
      var relPanel = byId('reliquaryPanel');

      if (tocToggle) {
        var tocDragging = root.classList.contains('toc-opening') || root.classList.contains('toc-closing') || hasState(tocPanel, 'is-dragging');
        tocToggle.classList.toggle('is-toc-dragging', !!tocDragging);
      }

      if (relToggle) {
        var relDragging = root.classList.contains('reliquary-opening') || root.classList.contains('reliquary-closing') || hasState(relPanel, 'is-dragging');
        relToggle.classList.toggle('is-reliquary-dragging', !!relDragging);
      }
    } catch (err) {}
  }

  // iOS Safari: ensure our weld runs AFTER the drag handlers (toc.js / reliquary.js) that write cap transforms.
  function wirePointerWeld() {
    try {
      if (!window.PointerEvent) return;

      var tocToggle = byId('tocToggle');
      var relToggle = byId('mirrorToggle');

      function weldFromPointer() {
        updateDraggingClasses();
        if (isTocActive()) weldToC();
        if (isReliquaryActive()) weldReliquary();
        forceCenterTocGlyph();
        schedulePostPin();
      }

      if (tocToggle && tocToggle.addEventListener) {
        tocToggle.addEventListener('pointermove', weldFromPointer);
        tocToggle.addEventListener('pointerdown', weldFromPointer);
        tocToggle.addEventListener('pointerup', weldFromPointer);
        tocToggle.addEventListener('pointercancel', weldFromPointer);
      }

      if (relToggle && relToggle.addEventListener) {
        relToggle.addEventListener('pointermove', weldFromPointer);
        relToggle.addEventListener('pointerdown', weldFromPointer);
        relToggle.addEventListener('pointerup', weldFromPointer);
        relToggle.addEventListener('pointercancel', weldFromPointer);
      }
    } catch (err) {}
  }

  function tick() {
    try {
      updateDraggingClasses();

      if (isTocActive()) weldToC();
      else resetInlineWeld(byId('tocToggle'));

      if (isReliquaryActive()) weldReliquary();
      else resetInlineWeld(byId('mirrorToggle'));

      // Final pin: run after any reset/weld writes so iOS Safari can't strand the glyph.
      forceCenterTocGlyph();

      schedulePostPin();
    } catch (err) {}

    requestAnimationFrame(tick);
  }

  function start() {
    if (!window.requestAnimationFrame) return;
    wirePointerWeld();
    requestAnimationFrame(tick);
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
