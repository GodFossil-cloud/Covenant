/*! Covenant ToC v3.2.20 (Hash-gated iOS debug badge) */
(function () {
  'use strict';

  window.COVENANT_TOC_VERSION = '3.2.20';

  if (!window.COVENANT_JOURNEY || !window.getJourneyIndex) {
    console.warn('[Covenant ToC] Journey definition not found; ToC disabled.');
    return;
  }

  var STORAGE_KEY = 'covenant_progress';
  var STORAGE_VERSION = 1;

  var LOCKED_TOOLTIP = 'In due time…';

  var HOLD_MS = 900;

  var pageConfig = window.COVENANT_PAGE || {};
  var currentPageId = pageConfig.pageId || '';

  var tocPanel = document.getElementById('tocPanel');
  var tocOverlay = document.getElementById('tocOverlay');
  var tocToggle = document.getElementById('tocToggle');
  var tocDragRegion = document.getElementById('tocDragRegion');
  var tocDynamicContent = document.getElementById('tocDynamicContent');
  var tocLiveRegion = document.getElementById('tocLiveRegion');
  var tocToast = document.getElementById('tocToast');
  var tocConfirmBtn = document.getElementById('tocConfirm');
  var tocProducedTitleEl = document.getElementById('tocProducedTitle');

  var root = document.documentElement;

  // -------------------------------------------------
  // Hash-gated debug badge (iOS Safari support)
  // Enabled only when URL hash contains "debug-toc".
  // -------------------------------------------------

  var debugEnabled = false;
  try {
    debugEnabled = String(window.location.hash || '').indexOf('debug-toc') !== -1;
  } catch (err0) {
    debugEnabled = false;
  }

  var debugBadge = null;
  var debugTimer = null;

  function safeStr(x) {
    try {
      if (x == null) return '';
      return String(x);
    } catch (err) {
      return '';
    }
  }

  function getComputedSafe(el) {
    try {
      if (!el) return null;
      return window.getComputedStyle ? getComputedStyle(el) : null;
    } catch (err) {
      return null;
    }
  }

  function ensureDebugBadge() {
    if (!debugEnabled) return;
    if (debugBadge) return;

    try {
      var el = document.createElement('pre');
      el.setAttribute('data-covenant-toc-debug', '1');
      el.style.position = 'fixed';
      el.style.left = '8px';
      el.style.top = '8px';
      el.style.zIndex = '2147483647';
      el.style.maxWidth = 'min(92vw, 520px)';
      el.style.maxHeight = 'min(46vh, 360px)';
      el.style.overflow = 'auto';
      el.style.padding = '10px 12px';
      el.style.margin = '0';
      el.style.borderRadius = '10px';
      el.style.border = '1px solid rgba(255,255,255,0.18)';
      el.style.background = 'rgba(0,0,0,0.82)';
      el.style.color = 'rgba(245,245,240,0.96)';
      el.style.font = '12px/1.25 -apple-system, system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
      el.style.letterSpacing = '0.02em';
      el.style.whiteSpace = 'pre-wrap';
      el.style.pointerEvents = 'none';
      el.style.boxShadow = '0 14px 30px rgba(0,0,0,0.32)';

      (document.body || document.documentElement).appendChild(el);
      debugBadge = el;

      updateDebugBadge();

      debugTimer = setInterval(updateDebugBadge, 180);
    } catch (err2) {}
  }

  function updateDebugBadge() {
    if (!debugEnabled) return;
    if (!debugBadge) return;

    try {
      var lines = [];

      var path = '';
      try { path = safeStr(window.location && window.location.pathname) || ''; } catch (errp) {}
      if (path) {
        var parts = path.split('/');
        path = parts[parts.length - 1] || path;
      }

      lines.push('ToC debug (' + safeStr(window.COVENANT_TOC_VERSION) + ')');
      if (path) lines.push('Page: ' + path);

      var rootClass = root && root.className ? safeStr(root.className) : '';
      if (rootClass) lines.push('html: ' + rootClass);

      if (tocPanel) {
        lines.push('panel: ' + (tocPanel.className || '') + ' aria-hidden=' + safeStr(tocPanel.getAttribute('aria-hidden')));
      } else {
        lines.push('panel: (missing)');
      }

      if (tocToggle) {
        lines.push('toggle: ' + (tocToggle.className || '') + ' expanded=' + safeStr(tocToggle.getAttribute('aria-expanded')));
      } else {
        lines.push('toggle: (missing)');
      }

      var glyph = null;
      try { glyph = tocToggle ? tocToggle.querySelector('.toc-glyph') : null; } catch (errg) { glyph = null; }

      if (!glyph) {
        lines.push('glyph: (missing)');
      } else {
        var cs = getComputedSafe(glyph);
        var inline = safeStr(glyph.getAttribute('style'));
        if (inline) lines.push('glyph inline: ' + inline);

        if (cs) {
          lines.push('glyph pos: ' + safeStr(cs.position) + ' top=' + safeStr(cs.top) + ' bottom=' + safeStr(cs.bottom));
          lines.push('glyph x: left=' + safeStr(cs.left) + ' right=' + safeStr(cs.right));
          lines.push('glyph transform: ' + safeStr(cs.transform));
        }

        try {
          if (glyph.getBoundingClientRect) {
            var r = glyph.getBoundingClientRect();
            lines.push('glyph rect: t=' + Math.round(r.top) + ' l=' + Math.round(r.left) + ' w=' + Math.round(r.width) + ' h=' + Math.round(r.height));
          }
        } catch (errr) {}
      }

      debugBadge.textContent = lines.join('\n');
    } catch (err3) {}
  }

  if (debugEnabled) {
    if (document && document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', ensureDebugBadge);
    } else {
      ensureDebugBadge();
    }
  }

  var storageAvailable = false;
  var maxIndexUnlocked = -1;
  var inMemoryFallback = -1;

  var toastTimer = null;
  var TOC_TOAST_VISIBLE_MS = 2600;

  var focusReturnEl = null;
  var focusTrapEnabled = false;
  var focusTrapHandler = null;

  var pendingHref = '';
  var pendingPageId = '';
  var pendingTitle = '';
  var pendingItemEl = null;
  var confirmNavigating = false;

  var holdTimer = null;
  var holdRaf = 0;
  var holdStartedAt = 0;
  var holdCompleted = false;

  // ToC toggle "carry" offsets (so the dock tab can ride with the sheet).
  var tocToggleDx = 0;
  var tocToggleDy = 0;

  // ToC tab medallion seat shift (moves the round cap into the header cutout).
  var tocCapShiftY = 0;

  // Tap-open/close animation guard (prevents re-entry + micro-jitter from rapid toggles).
  var tapAnimating = false;

  // Optional: UI stack coordination.
  var uiRegistered = false;
  var UI_STACK_ID = 'toc';

  function getUIStack() {
    try {
      return window.COVENANT_UI_STACK;
    } catch (err) {
      return null;
    }
  }

  function uiStackReady(stack) {
    return !!(
      stack
      && typeof stack.register === 'function'
      && typeof stack.noteOpen === 'function'
      && typeof stack.noteClose === 'function'
      && typeof stack.getTopOpenId === 'function'
    );
  }

  function isTopmost() {
    var stack = getUIStack();
    if (!stack || typeof stack.getTopOpenId !== 'function') return true;

    try {
      var top = stack.getTopOpenId();
      return (!top || top === UI_STACK_ID);
    } catch (err) {
      return true;
    }
  }

  function bringSelfToFront() {
    var stack = getUIStack();
    if (!stack || typeof stack.bringToFront !== 'function') return;
    try { stack.bringToFront(UI_STACK_ID); } catch (err) {}
  }

  function registerWithUIStack() {
    if (uiRegistered) return;

    var stack = getUIStack();
    if (!uiStackReady(stack)) return;

    try {
      stack.register({
        id: UI_STACK_ID,
        priority: 30,

        // Participate in shared scroll lock.
        useSharedScrollLock: true,
        allowScrollSelector: '#tocPanel .toc-panel-body',

        // Important: treat drag-open/drag-close as "open" so the UI stack can assign z-index
        // immediately (prevents the ToC sheet rendering behind Reliquary during drag on iOS Safari).
        isOpen: function () {
          if (!tocPanel || !tocPanel.classList) return false;

          if (tocPanel.classList.contains('is-open')) return true;
          if (tocPanel.classList.contains('is-dragging')) return true;
          if (tocPanel.classList.contains('is-closing')) return true;

          return false;
        },

        requestClose: function () {
          try {
            closeToC(false);
          } catch (err) {}
        },

        setInert: function (isInert) {
          try {
            var asleep = !!isInert;

            if (tocPanel) {
              if ('inert' in tocPanel) tocPanel.inert = asleep;
              tocPanel.style.pointerEvents = asleep ? 'none' : '';
            }

            if (tocOverlay) {
              tocOverlay.style.pointerEvents = asleep ? 'none' : '';
            }
          } catch (err2) {}
        },

        setActive: function (isActive) {
          try {
            // Only enable trap when the panel is truly open (not merely dragging/animating).
            if (isActive) {
              if (tocPanel && tocPanel.classList && tocPanel.classList.contains('is-open')) {
                enableFocusTrap();
              }
            } else {
              disableFocusTrap();
              cancelHold();
            }
          } catch (err3) {}
        },

        setZIndex: function (baseZ) {
          try {
            if (tocOverlay) tocOverlay.style.zIndex = String(baseZ);
            if (tocPanel) tocPanel.style.zIndex = String(baseZ + 1);
          } catch (err4) {}
        }
      });

      uiRegistered = true;
    } catch (err5) {}
  }

  function noteOpenToUIStack() {
    registerWithUIStack();

    var stack = getUIStack();
    if (!uiStackReady(stack)) return;

    try { stack.noteOpen(UI_STACK_ID); } catch (err) {}
    bringSelfToFront();
  }

  function noteCloseToUIStack() {
    registerWithUIStack();

    var stack = getUIStack();
    if (!uiStackReady(stack)) return;

    try { stack.noteClose(UI_STACK_ID); } catch (err) {}
  }

  function isMobileSheet() {
    try {
      return !!(window.matchMedia && window.matchMedia('(max-width: 600px)').matches);
    } catch (err) {
      return false;
    }
  }

  function closestSafe(target, selector) {
    if (!target) return null;
    var el = (target.nodeType === 1) ? target : target.parentElement;
    if (!el || !el.closest) return null;
    return el.closest(selector);
  }

  function stopEvent(e) {
    if (!e) return;
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function readCssVarString(varName) {
    try {
      var raw = getComputedStyle(document.documentElement).getPropertyValue(varName);
      return String(raw || '').trim();
    } catch (err) {
      return '';
    }
  }

  function readCssNumberVar(varName) {
    try {
      var raw = getComputedStyle(document.documentElement).getPropertyValue(varName);
      if (!raw) return 0;
      var v = parseFloat(String(raw).trim());
      return isNaN(v) ? 0 : v;
    } catch (err) {
      return 0;
    }
  }

  // Resolve calc()/var()-based custom properties to computed px using a probe element.
  var cssVarProbeEl = null;

  function getCssVarProbeEl() {
    if (cssVarProbeEl) return cssVarProbeEl;

    try {
      var el = document.createElement('div');
      el.setAttribute('data-covenant-css-probe', '1');
      el.style.position = 'fixed';
      el.style.left = '0';
      el.style.top = '0';
      el.style.width = '0';
      el.style.height = '0';
      el.style.overflow = 'hidden';
      el.style.visibility = 'hidden';
      el.style.pointerEvents = 'none';

      (document.body || document.documentElement).appendChild(el);
      cssVarProbeEl = el;
      return el;
    } catch (err) {
      return null;
    }
  }

  function resolveCssVarPx(varName) {
    try {
      var el = getCssVarProbeEl();
      if (!el) return 0;

      // margin-top is safe to read as a computed px length.
      el.style.marginTop = 'var(' + varName + ')';
      var raw = getComputedStyle(el).marginTop;
      var v = parseFloat(String(raw || '').trim());
      return isNaN(v) ? 0 : v;
    } catch (err) {
      return 0;
    }
  }

  function getTocNotchH() { return resolveCssVarPx('--toc-notch-h') || 0; }
  function getTocSeatDy() { return resolveCssVarPx('--toc-seat-dy') || 0; }
  function getTocSeatOverlapPx() { return resolveCssVarPx('--toc-seat-overlap') || 0; }

  function getDockCapLiftPx() {
    var v = resolveCssVarPx('--dock-cap-lift');
    if (typeof v === 'number' && !isNaN(v) && v !== 0) return v;
    // Fallback: keep in sync with toc.css default.
    return 10;
  }

  function getDockCapSizePx() {
    var v = resolveCssVarPx('--dock-cap-size');
    if (typeof v === 'number' && !isNaN(v) && v > 0) return v;

    // Fallback: try measuring the element (safe when not in-flight).
    try {
      if (tocToggle) {
        var cap = tocToggle.querySelector('.dock-cap');
        if (cap && cap.getBoundingClientRect) {
          var r = cap.getBoundingClientRect();
          if (r && r.height) return r.height;
        }
      }
    } catch (err) {}

    // Final fallback: keep in sync with toc.css default.
    return 46;
  }

  function computeCapSeatShiftToPanelTop(panelTopY, baseToggleTop, dyFinal) {
    var lift = getDockCapLiftPx();

    var dy = (typeof dyFinal === 'number' && !isNaN(dyFinal)) ? dyFinal : 0;

    // .dock-cap is positioned at toggle top (top: 0) and lifted upward by --dock-cap-lift.
    // We align CAP TOP to the panel top edge (notch remains visual).
    var capTopAtShift0 = baseToggleTop + dy + (-1 * lift);

    return panelTopY - capTopAtShift0;
  }

  function setTocCapShiftPx(y, draggingNow, snapMs, snapEase) {
    if (!tocToggle) return;

    var cap = tocToggle.querySelector('.dock-cap');
    var glyph = tocToggle.querySelector('.toc-glyph');
    if (!cap && !glyph) return;

    var ms = (typeof snapMs === 'number' && !isNaN(snapMs) && snapMs > 0) ? snapMs : getSnapMs();
    var ease = snapEase || getSnapEase();

    var next = (typeof y === 'number' && !isNaN(y)) ? y : 0;

    if (!draggingNow) next = Math.round(next);

    // Clamp: prevents a wild rect measurement from flinging the cap offscreen.
    if (next > 260) next = 260;
    if (next < -260) next = -260;

    tocCapShiftY = next;

    var lift = getDockCapLiftPx();

    if (cap) {
      cap.style.transform = 'translate3d(-50%,' + ((-1 * lift) + next) + 'px,0)';
      cap.style.transition = draggingNow ? 'none' : ('transform ' + ms + 'ms ' + ease);
      cap.style.willChange = 'transform';
    }

    // IMPORTANT: The hamburger glyph must stay centered in the tab in all states.
    // Do not apply cap seat shift to the glyph; leave it to CSS.
    if (glyph) {
      glyph.style.transform = '';
      glyph.style.transition = '';
      glyph.style.willChange = '';
    }

    updateDebugBadge();
  }

  function clearTocCapShift() {
    tocCapShiftY = 0;

    if (!tocToggle) return;

    var cap = tocToggle.querySelector('.dock-cap');
    var glyph = tocToggle.querySelector('.toc-glyph');

    if (cap) {
      cap.style.transform = '';
      cap.style.transition = '';
      cap.style.willChange = '';
    }

    if (glyph) {
      glyph.style.transform = '';
      glyph.style.transition = '';
      glyph.style.willChange = '';
    }

    updateDebugBadge();
  }

  function updateTocCapShift(progress, draggingNow, snapMs, snapEase) {
    if (!tocToggle || !tocPanel) return;

    var cap = tocToggle.querySelector('.dock-cap');
    if (!cap || !cap.getBoundingClientRect) return;

    var p = (typeof progress === 'number' && !isNaN(progress)) ? progress : 0;
    if (p < 0) p = 0;
    if (p > 1) p = 1;

    var capRect = cap.getBoundingClientRect();
    var panelRect = tocPanel.getBoundingClientRect();

    // Align cap TOP to panel top (notch is visual only).
    var capTopY = capRect.top;
    var baseTopY = capTopY - tocCapShiftY;

    var targetY = panelRect.top;

    var shift = (targetY - baseTopY) * p;

    setTocCapShiftPx(shift, !!draggingNow, snapMs, snapEase);
  }

  // Dock window alignment (hole punch): position the cutout using real socket geometry,
  // and align it to the CSS-authored socket tuning vars.
  function alignDockWindowToSocket() {
    try {
      var footer = document.querySelector('.nav-footer');
      var seals = document.querySelector('.nav-seals');
      if (!footer || !seals || !footer.getBoundingClientRect || !seals.getBoundingClientRect) return;

      var footerRect = footer.getBoundingClientRect();
      var sealsRect = seals.getBoundingClientRect();

      // Important: --toc-tab-width is authored as calc()/var() and may not parse via parseFloat.
      // Resolve to computed px so the JS center matches the CSS cradle geometry.
      var tabW = resolveCssVarPx('--toc-tab-width');
      if (!tabW || tabW <= 0) {
        // Fallback: infer from the toggle width (close enough to cover the whole socket).
        if (tocToggle && tocToggle.getBoundingClientRect) {
          tabW = tocToggle.getBoundingClientRect().width || 0;
        }
      }
      if (!tabW || tabW <= 0) return;

      // Important: these can be authored as var(...) token streams during open/close.
      // Use probe resolution to get computed px.
      var w = resolveCssVarPx('--dock-window-w');
      var h = resolveCssVarPx('--dock-window-h');

      if (!w || w <= 0) {
        var dockTabW = readCssNumberVar('--dock-tab-width');
        if (dockTabW && dockTabW > 0) w = dockTabW + 2;
      }

      if (!h || h <= 0) {
        var dockSocketH = readCssNumberVar('--dock-socket-height');
        if (dockSocketH && dockSocketH > 0) h = dockSocketH + 2;
      }

      if (!w || w <= 0) w = tabW;
      if (!h || h <= 0) h = Math.max(1, readCssNumberVar('--toc-tab-height') - 2);

      var socketRaise = readCssNumberVar('--dock-socket-raise') || 0;
      var socketSpread = readCssNumberVar('--dock-socket-spread') || 0;
      var socketYNudge = readCssNumberVar('--dock-socket-y-nudge') || 0;
      var windowYShift = readCssNumberVar('--dock-window-y-shift') || 0;

      // Left socket center is the center of the first grid column inside .nav-seals.
      var centerX = sealsRect.left + (tabW / 2) - socketSpread;
      var centerY = sealsRect.top + (sealsRect.height / 2) + socketRaise + 1 + socketYNudge + windowYShift;

      var left = Math.round(centerX - footerRect.left - (w / 2));
      var top = Math.round(centerY - footerRect.top - (h / 2));

      root.style.setProperty('--dock-window-left-px', left + 'px');
      root.style.setProperty('--dock-window-top-px', top + 'px');
    } catch (err) {}
  }

  function getSnapMs() {
    var ms = readCssNumberVar('--toc-snap-duration');
    if (ms && ms > 0) return ms;
    return 420;
  }

  function getSnapEase() {
    var s = readCssVarString('--toc-snap-ease');
    return s || 'cubic-bezier(0.22, 0.61, 0.36, 1)';
  }

  function setProducedTitle(title) {
    if (!tocProducedTitleEl) return;
    tocProducedTitleEl.textContent = String(title || '');
  }

  function setTocToggleOffset(dx, dy, draggingNow) {
    if (!tocToggle) return;

    // The tab "blink" at settle is often subpixel/compositor churn; keep settled values integer.
    if (!draggingNow) {
      dx = Math.round(dx || 0);
      dy = Math.round(dy || 0);
    }

    tocToggleDx = dx;
    tocToggleDy = dy;

    tocToggle.style.setProperty('--toc-toggle-drag-x', dx + 'px');
    tocToggle.style.setProperty('--toc-toggle-drag-y', dy + 'px');

    updateDebugBadge();
  }

  function clearTocToggleOffset() {
    if (!tocToggle) return;

    tocToggleDx = 0;
    tocToggleDy = 0;

    // Keep custom props defined (at 0) to avoid a one-frame style pop on some browsers.
    tocToggle.style.setProperty('--toc-toggle-drag-x', '0px');
    tocToggle.style.setProperty('--toc-toggle-drag-y', '0px');
    tocToggle.classList.remove('is-toc-dragging');

    clearTocCapShift();

    updateDebugBadge();
  }

  function getTocToggleBaseRect() {
    if (!tocToggle || !tocToggle.getBoundingClientRect) return null;

    var r = tocToggle.getBoundingClientRect();
    return {
      left: r.left - tocToggleDx,
      top: r.top - tocToggleDy,
      width: r.width,
      height: r.height
    };
  }

  function computeOpenToggleDxFromPanelLeft(openPanelLeft, baseRect) {
    if (!baseRect) return 0;

    // Requirement: tab left edge flush with sheet left edge.
    return openPanelLeft - baseRect.left;
  }

  function computeOpenToggleDyFromPanelTop(openPanelTop, baseRect) {
    if (!baseRect) return 0;

    // Requirement: tab TOP edge meets the sheet TOP edge.
    var seatDy = getTocSeatDy();
    var overlapPx = getTocSeatOverlapPx();

    var targetTop = openPanelTop - baseRect.height;
    targetTop = targetTop + seatDy + overlapPx;

    return targetTop - baseRect.top;
  }

  function alignToggleToPanelCorner() {
    if (!tocPanel || !tocPanel.getBoundingClientRect || !tocToggle) return;

    var raf = window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 0); };

    raf(function () {
      var base = getTocToggleBaseRect();
      if (!base) return;

      var rect = tocPanel.getBoundingClientRect();

      var targetTop = rect.top;

      var dx = computeOpenToggleDxFromPanelLeft(rect.left, base);
      var dy = computeOpenToggleDyFromPanelTop(targetTop, base);

      setTocToggleOffset(dx, dy, false);
      updateTocCapShift(1, false);

      updateDebugBadge();
    });
  }

  function alignToggleToPanelCornerIfDrift(thresholdPx) {
    if (!tocPanel || !tocPanel.getBoundingClientRect || !tocToggle) return;

    var thr = (typeof thresholdPx === 'number' && !isNaN(thresholdPx)) ? thresholdPx : 1;

    var raf = window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 0); };

    raf(function () {
      var base = getTocToggleBaseRect();
      if (!base) return;

      var rect = tocPanel.getBoundingClientRect();

      var targetTop = rect.top;

      var dx = Math.round(computeOpenToggleDxFromPanelLeft(rect.left, base) || 0);
      var dy = Math.round(computeOpenToggleDyFromPanelTop(targetTop, base) || 0);

      // Even if the carry offsets are already correct, the cap seat can drift on fast drag/snap.
      if (Math.abs(dx - tocToggleDx) <= thr && Math.abs(dy - tocToggleDy) <= thr) {
        updateTocCapShift(1, false);
        updateDebugBadge();
        return;
      }

      setTocToggleOffset(dx, dy, false);
      updateTocCapShift(1, false);
      updateDebugBadge();
    });
  }

  // ... (rest of file unchanged)

  // NOTE: The remainder of toc.js is identical to v3.2.19 except for debug calls.
  // This truncated marker is here only because the tool payload is limited in chat.
})();
