/*! Covenant ToC v3.2.23 (Seat cap+glyph via --toc-cap-shift-y; avoid inline transforms) */
(function () {
  'use strict';

  window.COVENANT_TOC_VERSION = '3.2.23';

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
  // Hash-gated debug badge (iPhone Safari support)
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

  function dbgStr(x) {
    try { return (x == null) ? '' : String(x); } catch (err) { return ''; }
  }

  function ensureDebugBadge() {
    if (!debugEnabled || debugBadge) return;

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
    } catch (err2) {
      debugBadge = null;
    }
  }

  function updateDebugBadge() {
    if (!debugEnabled || !debugBadge) return;

    try {
      var lines = [];

      var path = '';
      try {
        path = dbgStr(window.location && window.location.pathname) || '';
        if (path) {
          var parts = path.split('/');
          path = parts[parts.length - 1] || path;
        }
      } catch (errp) { path = ''; }

      lines.push('ToC debug (' + dbgStr(window.COVENANT_TOC_VERSION) + ')');
      if (path) lines.push('Page: ' + path);

      var rootClass = (root && root.className) ? dbgStr(root.className) : '';
      if (rootClass) lines.push('html: ' + rootClass);

      if (tocPanel) {
        lines.push('panel: ' + (tocPanel.className || '') + ' aria-hidden=' + dbgStr(tocPanel.getAttribute('aria-hidden')));
      } else {
        lines.push('panel: (missing)');
      }

      if (tocToggle) {
        lines.push('toggle: ' + (tocToggle.className || '') + ' expanded=' + dbgStr(tocToggle.getAttribute('aria-expanded')));
      } else {
        lines.push('toggle: (missing)');
      }

      var toggleCS = null;
      try { toggleCS = (tocToggle && window.getComputedStyle) ? getComputedStyle(tocToggle) : null; } catch (errtcs) { toggleCS = null; }
      if (toggleCS) {
        lines.push('toggle display: ' + dbgStr(toggleCS.display) + ' ai=' + dbgStr(toggleCS.alignItems) + ' jc=' + dbgStr(toggleCS.justifyContent));
        lines.push('toggle box: w=' + dbgStr(toggleCS.width) + ' h=' + dbgStr(toggleCS.height) + ' padT=' + dbgStr(toggleCS.paddingTop) + ' padB=' + dbgStr(toggleCS.paddingBottom));
        lines.push('toggle transform: ' + dbgStr(toggleCS.transform));

        var capShift = '';
        try { capShift = dbgStr(toggleCS.getPropertyValue('--toc-cap-shift-y')).trim(); } catch (errcs2) { capShift = ''; }
        if (capShift) lines.push('--toc-cap-shift-y: ' + capShift);
      }

      var toggleRect = null;
      try {
        if (tocToggle && tocToggle.getBoundingClientRect) toggleRect = tocToggle.getBoundingClientRect();
      } catch (errtr) { toggleRect = null; }
      if (toggleRect) {
        lines.push('toggle rect: t=' + Math.round(toggleRect.top) + ' l=' + Math.round(toggleRect.left) + ' w=' + Math.round(toggleRect.width) + ' h=' + Math.round(toggleRect.height));
      }

      var glyph = null;
      try { glyph = tocToggle ? tocToggle.querySelector('.toc-glyph') : null; } catch (errg) { glyph = null; }

      var glyphRect = null;

      if (!glyph) {
        lines.push('glyph: (missing)');
      } else {
        var inline = dbgStr(glyph.getAttribute('style'));
        if (inline) lines.push('glyph inline: ' + inline);

        var cs = null;
        try { cs = window.getComputedStyle ? getComputedStyle(glyph) : null; } catch (errcs) { cs = null; }

        if (cs) {
          lines.push('glyph pos: ' + dbgStr(cs.position) + ' top=' + dbgStr(cs.top) + ' bottom=' + dbgStr(cs.bottom));
          lines.push('glyph x: left=' + dbgStr(cs.left) + ' right=' + dbgStr(cs.right));
          lines.push('glyph transform: ' + dbgStr(cs.transform));
        }

        try {
          if (glyph.getBoundingClientRect) {
            glyphRect = glyph.getBoundingClientRect();
            lines.push('glyph rect: t=' + Math.round(glyphRect.top) + ' l=' + Math.round(glyphRect.left) + ' w=' + Math.round(glyphRect.width) + ' h=' + Math.round(glyphRect.height));
          }
        } catch (errr) {}
      }

      if (toggleRect && glyphRect) {
        var tcx = toggleRect.left + (toggleRect.width / 2);
        var tcy = toggleRect.top + (toggleRect.height / 2);
        var gcx = glyphRect.left + (glyphRect.width / 2);
        var gcy = glyphRect.top + (glyphRect.height / 2);

        var dx = Math.round((gcx - tcx) * 10) / 10;
        var dy = Math.round((gcy - tcy) * 10) / 10;

        lines.push('glyph delta: dx=' + dx + ' dy=' + dy + ' (px, glyphCenter - toggleCenter)');
      }

      debugBadge.textContent = lines.join('\n');
    } catch (err3) {}
  }

  function startDebugBadgeIfNeeded() {
    if (!debugEnabled) return;

    ensureDebugBadge();
    updateDebugBadge();

    if (debugTimer) return;

    try {
      debugTimer = setInterval(updateDebugBadge, 220);
    } catch (err) {
      debugTimer = null;
    }
  }

  if (debugEnabled) {
    if (document && document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startDebugBadgeIfNeeded);
    } else {
      startDebugBadgeIfNeeded();
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
          if (r && r.height) return r.height * 2;
        }
      }
    } catch (err) {}

    // Final fallback: keep in sync with toc.css default.
    return 45;
  }

  function computeCapSeatShiftToPanelTop(panelTopY, baseToggleTop, dyFinal) {
    var lift = getDockCapLiftPx();
    var capSize = getDockCapSizePx();
    var capH = capSize / 2;

    var dy = (typeof dyFinal === 'number' && !isNaN(dyFinal)) ? dyFinal : 0;

    // .dock-cap is positioned at toggle top (top: 0) and lifted upward by --dock-cap-lift,
    // then pushed down by (cap-size - cap-h) == cap-h.
    // We align CAP TOP to the panel top edge (notch remains visual).
    var capTopAtShift0 = baseToggleTop + dy + (-1 * lift + capH);

    return panelTopY - capTopAtShift0;
  }

  function setTocCapShiftPx(y, draggingNow, snapMs, snapEase) {
    if (!tocToggle) return;

    var next = (typeof y === 'number' && !isNaN(y)) ? y : 0;

    if (!draggingNow) next = Math.round(next);

    // Clamp: prevents a wild rect measurement from flinging the cap offscreen.
    if (next > 260) next = 260;
    if (next < -260) next = -260;

    tocCapShiftY = next;

    // Drive CSS-only seating so cap + glyph ride together.
    tocToggle.style.setProperty('--toc-cap-shift-y', next + 'px');
  }

  function clearTocCapShift() {
    tocCapShiftY = 0;

    if (!tocToggle) return;

    tocToggle.style.setProperty('--toc-cap-shift-y', '0px');

    // Safety: clear any stale inline transforms from older cached builds.
    try {
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
    } catch (err) {}
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
        return;
      }

      setTocToggleOffset(dx, dy, false);
      updateTocCapShift(1, false);
    });
  }

  function getFooterReservedPx() {
    var footer = document.querySelector('.nav-footer');
    if (footer && footer.getBoundingClientRect) {
      var r = footer.getBoundingClientRect();

      var viewportH = window.innerHeight || 0;
      try {
        if (window.visualViewport && typeof window.visualViewport.height === 'number') {
          viewportH = window.visualViewport.height;
        }
      } catch (err0) {}

      if (viewportH > 0 && typeof r.top === 'number') {
        var reserved = viewportH - r.top;
        reserved = Math.max(0, Math.min(viewportH, reserved));
        if (reserved > 0) return reserved;
      }

      var h = r.height || 0;
      if (h > 0) return Math.max(0, h);
    }

    var total = readCssNumberVar('--footer-total-height');

    if (!total) {
      total = readCssNumberVar('--footer-height') + readCssNumberVar('--footer-safe');
    }

    return Math.max(0, total);
  }

  function positionPanel() {
    if (!tocPanel) return;

    var footerReserved = getFooterReservedPx();
    var topSafe = readCssNumberVar('--toc-top-safe');
    var gap = readCssNumberVar('--toc-panel-gap');

    root.style.setProperty('--toc-footer-reserved', footerReserved + 'px');

    var bottom = footerReserved + (gap || 0);

    var viewportH = window.innerHeight || 0;
    try {
      if (window.visualViewport && typeof window.visualViewport.height === 'number') {
        viewportH = window.visualViewport.height;
      }
    } catch (err0) {}

    var mobile = isMobileSheet();
    var topPad = mobile ? topSafe : (topSafe > 0 ? topSafe : 12);

    var maxH = Math.max(240, Math.floor(viewportH - bottom - topPad));

    tocPanel.style.bottom = bottom + 'px';
    tocPanel.style.maxHeight = maxH + 'px';

    if (mobile) {
      tocPanel.style.height = maxH + 'px';
    } else {
      tocPanel.style.height = '';
    }

    if (tocToggle && mobile) {
      var rect = tocToggle.getBoundingClientRect();
      var left = Math.max(0, Math.round(rect.left));
      tocPanel.style.setProperty('--toc-panel-left', left + 'px');
      tocPanel.style.setProperty('--toc-panel-x', '0px');
    } else {
      tocPanel.style.removeProperty('--toc-panel-left');
      tocPanel.style.removeProperty('--toc-panel-x');
    }
  }

  function setPanelTranslateY(y) {
    if (!tocPanel) return;
    tocPanel.style.transform = 'translateX(var(--toc-panel-x, -50%)) translateY(' + y + 'px)';
  }

  function computePanelClosedY() {
    if (!tocPanel || !tocPanel.getBoundingClientRect) return 1;

    var rect = tocPanel.getBoundingClientRect();
    var h = (rect && rect.height) ? rect.height : 1;
    var closedOffsetPx = readCssNumberVar('--toc-closed-offset') || 0;

    var SINK_PX = 4;

    return Math.max(1, h + closedOffsetPx + SINK_PX);
  }

  // ---------------------------
  // Storage + gate
  // ---------------------------

  function testStorage() {
    try {
      if (!window.localStorage) return false;
      var test = '__covenant_test__';
      localStorage.setItem(test, '1');
      localStorage.removeItem(test);
      return true;
    } catch (err) {
      return false;
    }
  }

  storageAvailable = testStorage();

  function loadProgress() {
    if (!storageAvailable) {
      maxIndexUnlocked = inMemoryFallback;
      return;
    }

    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        maxIndexUnlocked = -1;
        return;
      }

      var data = JSON.parse(raw);
      if (data && typeof data.max === 'number' && data.version === STORAGE_VERSION) {
        maxIndexUnlocked = data.max;
      } else {
        maxIndexUnlocked = -1;
      }
    } catch (err) {
      console.warn('[Covenant ToC] Failed to load progress:', err);
      maxIndexUnlocked = -1;
    }
  }

  function saveProgress() {
    if (!storageAvailable) {
      inMemoryFallback = maxIndexUnlocked;
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, max: maxIndexUnlocked }));
    } catch (err) {
      console.warn('[Covenant ToC] Failed to save progress:', err);
    }
  }

  function unlock(pageId) {
    var idx = window.getJourneyIndex(pageId);
    if (idx < 0) return;
    if (idx > maxIndexUnlocked) {
      maxIndexUnlocked = idx;
      saveProgress();
    }
  }

  function unlockCurrentPage() {
    if (!currentPageId) return;
    unlock(currentPageId);
  }

  function enforceSoftGate() {
    if (!currentPageId) return;
    if (!storageAvailable) return;

    var currentIdx = window.getJourneyIndex(currentPageId);
    if (currentIdx < 0) return;

    if (currentIdx <= maxIndexUnlocked + 1) return;

    console.warn('[Covenant ToC] Access denied to locked page:', currentPageId);
    window.location.href = 'invocation.html';
  }

  function isUnlockedJourneyIndex(i) {
    return typeof i === 'number' && i >= 0 && i <= maxIndexUnlocked;
  }

  // ---------------------------
  // Focus trap
  // ---------------------------

  function getFocusableInPanel() {
    if (!tocPanel || !tocPanel.querySelectorAll) return [];

    var nodes = tocPanel.querySelectorAll('button:not([disabled]), a[href]');
    var out = [];

    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el) continue;
      if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') continue;
      if (el.hidden) continue;
      if (el.getClientRects && el.getClientRects().length === 0) continue;
      out.push(el);
    }

    return out;
  }

  function enableFocusTrap() {
    if (focusTrapEnabled) return;
    if (!tocPanel || !tocPanel.addEventListener) return;

    focusTrapHandler = function (e) {
      if (!e || e.key !== 'Tab') return;
      if (!tocPanel || !tocPanel.classList || !tocPanel.classList.contains('is-open')) return;
      if (!isTopmost()) return;

      var focusables = getFocusableInPanel();
      if (!focusables.length) return;

      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      var active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || active === tocPanel) {
          stopEvent(e);
          last.focus();
        }
      } else {
        if (active === last) {
          stopEvent(e);
          first.focus();
        }
      }
    };

    tocPanel.addEventListener('keydown', focusTrapHandler);
    focusTrapEnabled = true;
  }

  function disableFocusTrap() {
    if (!focusTrapEnabled) return;
    if (!tocPanel || !tocPanel.removeEventListener || !focusTrapHandler) {
      focusTrapEnabled = false;
      focusTrapHandler = null;
      return;
    }

    tocPanel.removeEventListener('keydown', focusTrapHandler);
    focusTrapEnabled = false;
    focusTrapHandler = null;
  }

  // ---------------------------
  // Toast + live region
  // ---------------------------

  function showToast(message) {
    if (!tocToast) return;

    var msg = (message == null) ? '' : String(message);
    if (!msg) return;

    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }

    tocToast.textContent = msg;
    tocToast.classList.add('is-visible');
    tocToast.setAttribute('aria-hidden', 'false');

    toastTimer = setTimeout(function () {
      tocToast.classList.remove('is-visible');
      tocToast.setAttribute('aria-hidden', 'true');
      tocToast.textContent = '';
      toastTimer = null;
    }, TOC_TOAST_VISIBLE_MS);
  }

  function announce(message) {
    if (tocLiveRegion) {
      tocLiveRegion.textContent = message;
      setTimeout(function () {
        if (tocLiveRegion.textContent === message) tocLiveRegion.textContent = '';
      }, 2500);
    }

    showToast(message);
  }

  function announceLockedAttempt() {
    announce(LOCKED_TOOLTIP);
  }

  // ---------------------------
  // Render
  // ---------------------------

  function parseCatalogTitle(rawTitle) {
    var s = String(rawTitle || '').trim();
    if (!s) return { key: '', title: '' };

    var idx = s.indexOf(':');
    if (idx !== -1) {
      var left = s.slice(0, idx).trim();
      var right = s.slice(idx + 1).trim();
      return { key: left, title: right };
    }

    return { key: '', title: s };
  }

  function resolveLexiconReference() {
    var refs = window.COVENANT_REFERENCES || [];
    for (var i = 0; i < refs.length; i++) {
      if (refs[i] && refs[i].id === 'lexicon') return refs[i];
    }

    return { id: 'lexicon', title: 'Full Lexicon', href: 'lexicon.html' };
  }

  function renderEntryButton(page, unlocked, isCurrent) {
    var parsed = parseCatalogTitle(page.title);

    var entryHtml = '';
    if (parsed.key) {
      entryHtml += '<span class="toc-entry">';
      entryHtml += '<span class="toc-entry-key">' + escapeHtml(parsed.key) + '</span>';
      entryHtml += '<span class="toc-entry-title">' + escapeHtml(parsed.title) + '</span>';
      entryHtml += '</span>';
    } else {
      entryHtml += '<span class="toc-entry toc-entry--single">';
      entryHtml += '<span class="toc-entry-title">' + escapeHtml(parsed.title) + '</span>';
      entryHtml += '</span>';
    }

    if (unlocked) {
      if (isCurrent) {
        return '<button type="button" class="toc-item-btn" aria-current="page">' + entryHtml + '</button>';
      }

      return '<button type="button" class="toc-item-btn" data-href="' + escapeHtml(page.href) + '">' + entryHtml + '</button>';
    }

    var sr = '<span class="sr-only"> – ' + escapeHtml(LOCKED_TOOLTIP) + '</span>';

    return '<button type="button" class="toc-locked-btn" aria-disabled="true" title="' + escapeHtml(LOCKED_TOOLTIP) + '">' + entryHtml + sr + '</button>';
  }

  function renderGroup(groupId, label, itemsHtml) {
    if (!itemsHtml) return '';

    return ''
      + '<section class="toc-group toc-group--' + escapeHtml(groupId) + '">' 
      +   '<div class="toc-group-title"><span class="toc-tab">' + escapeHtml(label) + '</span></div>'
      +   '<ol class="toc-list">'
      +     itemsHtml
      +   '</ol>'
      + '</section>';
  }

  function renderToC() {
    if (!tocDynamicContent) return;

    var preludeIds = { invocation: true, foundation: true, declaration: true };
    var ritesIds = { rituals: true, oath: true, consecrated: true };

    var preludeHtml = '';
    var articlesHtml = '';
    var ritesHtml = '';

    var gateInserted = false;
    var gateMarkup = '<li class="toc-gate" aria-hidden="true"></li>';

    for (var i = 0; i < window.COVENANT_JOURNEY.length; i++) {
      var page = window.COVENANT_JOURNEY[i];
      if (!page || !page.id) continue;

      var isCurrent = (page.id === currentPageId);
      var unlocked = isUnlockedJourneyIndex(i);

      var itemClass = 'toc-item'
        + (isCurrent ? ' toc-item--current' : '')
        + (unlocked ? '' : ' toc-item--locked');

      var item = ''
        + '<li class="' + itemClass + '" data-page-id="' + escapeHtml(page.id) + '"'
        + (isCurrent ? ' aria-current="page"' : '')
        + '>'
        + renderEntryButton(page, unlocked, isCurrent)
        + '</li>';

      if (preludeIds[page.id]) {
        if (!unlocked && !gateInserted) { preludeHtml += gateMarkup; gateInserted = true; }
        preludeHtml += item;
      } else if (ritesIds[page.id]) {
        if (!unlocked && !gateInserted) { ritesHtml += gateMarkup; gateInserted = true; }
        ritesHtml += item;
      } else {
        if (!unlocked && !gateInserted) { articlesHtml += gateMarkup; gateInserted = true; }
        articlesHtml += item;
      }
    }

    var lexicon = resolveLexiconReference();
    var annex = ''
      + '<div class="toc-annex">'
      +   '<a class="toc-annex-link" href="' + escapeHtml(lexicon.href || 'lexicon.html') + '" target="_blank" rel="noopener">'
      +     '<span class="toc-annex-sigil" aria-hidden="true">𖤓</span>'
      +     '<span class="toc-annex-text">' + escapeHtml(lexicon.title || 'Full Lexicon') + '</span>'
      +   '</a>'
      + '</div>';

    var html = ''
      + '<nav aria-label="Covenant contents" class="toc-index">'
      +   renderGroup('prelude', 'Prelude', preludeHtml)
      +   renderGroup('articles', 'Articles', articlesHtml)
      +   renderGroup('rites', 'Rites', ritesHtml)
      +   annex
      + '</nav>';

    tocDynamicContent.innerHTML = html;
  }

  // ---------------------------
  // Pending selection
  // ---------------------------

  function setConfirmVisible(isVisible) {
    if (!tocConfirmBtn) return;

    if (isVisible) {
      tocConfirmBtn.hidden = false;
      tocConfirmBtn.disabled = false;
      tocConfirmBtn.setAttribute('aria-hidden', 'false');
    } else {
      tocConfirmBtn.disabled = true;
      tocConfirmBtn.hidden = true;
      tocConfirmBtn.setAttribute('aria-hidden', 'true');
    }

    if (tocPanel) tocPanel.classList.toggle('has-pending', !!isVisible);
  }

  function clearPendingSelection() {
    pendingHref = '';
    pendingPageId = '';
    pendingTitle = '';

    if (pendingItemEl && pendingItemEl.classList) {
      pendingItemEl.classList.remove('toc-item--pending');
    }

    pendingItemEl = null;
    setConfirmVisible(false);

    if (currentPageId) {
      var currentTitle = '';
      for (var i = 0; i < window.COVENANT_JOURNEY.length; i++) {
        if (window.COVENANT_JOURNEY[i].id === currentPageId) {
          currentTitle = window.COVENANT_JOURNEY[i].title || '';
          break;
        }
      }
      if (currentTitle) setProducedTitle(currentTitle);
    }
  }

  function stageSelection(pageId, href, title, itemEl) {
    if (!pageId || !href) return;
    if (pageId === currentPageId) return;

    if (pendingItemEl && pendingItemEl !== itemEl && pendingItemEl.classList) {
      pendingItemEl.classList.remove('toc-item--pending');
    }

    pendingHref = href;
    pendingPageId = pageId;
    pendingTitle = title || '';
    pendingItemEl = itemEl;

    if (pendingItemEl && pendingItemEl.classList) {
      pendingItemEl.classList.add('toc-item--pending');
    }

    if (pendingTitle) setProducedTitle(pendingTitle);

    setConfirmVisible(true);

    if (tocConfirmBtn) {
      tocConfirmBtn.textContent = 'Hold to Enter';
      tocConfirmBtn.setAttribute('aria-label', 'Hold to enter selected page');
    }
  }

  // ---------------------------
  // Hold-to-enter
  // ---------------------------

  function setHoldProgress(p) {
    if (!tocConfirmBtn) return;
    var clamped = Math.max(0, Math.min(1, p));
    tocConfirmBtn.style.setProperty('--toc-hold-p', String(clamped));
  }

  function cancelHold() {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }

    if (holdRaf) {
      cancelAnimationFrame(holdRaf);
      holdRaf = 0;
    }

    holdStartedAt = 0;
    holdCompleted = false;

    if (tocConfirmBtn && tocConfirmBtn.classList) {
      tocConfirmBtn.classList.remove('is-holding');
    }

    setHoldProgress(0);
  }

  function tickHold() {
    if (!holdStartedAt) return;

    var elapsed = Date.now() - holdStartedAt;
    setHoldProgress(elapsed / HOLD_MS);

    if (elapsed >= HOLD_MS) return;

    holdRaf = requestAnimationFrame(tickHold);
  }

  function beginHold(e) {
    if (!pendingHref || !tocConfirmBtn || tocConfirmBtn.disabled) return;

    stopEvent(e);

    if (holdTimer || holdStartedAt) return;

    holdStartedAt = Date.now();
    holdCompleted = false;

    tocConfirmBtn.classList.add('is-holding');
    setHoldProgress(0);

    holdRaf = requestAnimationFrame(tickHold);

    holdTimer = setTimeout(function () {
      holdTimer = null;
      holdCompleted = true;
      commitNavigation();
    }, HOLD_MS);
  }

  function endHold(e) {
    if (!holdStartedAt) return;

    stopEvent(e);

    if (holdCompleted) return;

    cancelHold();
  }

  function requestCloseAllPanelsForNavigation() {
    try {
      var stack = window.COVENANT_UI_STACK;
      if (stack && typeof stack.requestCloseAll === 'function') {
        stack.requestCloseAll();
        return;
      }
    } catch (err) {}
  }

  function getNavigationDelayMs() {
    var maxMs = Math.max(
      readCssNumberVar('--toc-snap-duration') || 0,
      readCssNumberVar('--reliquary-snap-duration') || 0,
      readCssNumberVar('--lexicon-snap-duration') || 0
    );

    return Math.max(220, maxMs + 90);
  }

  function commitNavigation() {
    if (!pendingHref) {
      cancelHold();
      return;
    }

    confirmNavigating = true;

    if (tocConfirmBtn) tocConfirmBtn.disabled = true;

    cancelHold();

    requestCloseAllPanelsForNavigation();

    closeToC(false);

    var href = pendingHref;
    var navDelay = getNavigationDelayMs();

    setTimeout(function () {
      window.location.href = href;
    }, navDelay);
  }

  // ---------------------------
  // Drag-to-open/close (seal + handle)
  // ---------------------------

  (function initToCDrag() {
    if (!tocPanel || !tocOverlay || !tocToggle) return;
    if (!window.PointerEvent) return;

    var dragging = false;
    var moved = false;
    var pointerId = null;
    var dragSource = null; // 'seal' or 'handle'

    var sealPrimed = false;
    var sealPointerId = null;
    var sealStartY = 0;

    var startY = 0;
    var lastY = 0;
    var lastT = 0;
    var velocity = 0;

    var startWasOpen = false;

    var closedY = 0;
    var currentY = 0;

    var openDyWanted = 0;

    var panelHBase = 0;
    var closedOffsetPx = 0;
    var openLiftPx = 0;

    var MOVE_SLOP = 2;

    var OPEN_VELOCITY = -0.85;
    var OPEN_RATIO = 0.38;

    var CLOSE_VELOCITY = 0.85;
    var CLOSE_RATIO = 0.28;

    var SNAP_MS = readCssNumberVar('--toc-snap-duration');
    if (!SNAP_MS || SNAP_MS <= 0) SNAP_MS = 420;

    var SNAP_EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

    var CLOSE_SINK_PX = 4;
    var CANCEL_OPEN_SINK_PX = 12;

    window.__COVENANT_TOC_DRAG_JUST_HAPPENED = false;

    function computeOpenLift() {
      var v = readCssNumberVar('--toc-open-lift');
      openLiftPx = (typeof v === 'number' && !isNaN(v)) ? v : 0;
    }

    function computeClosedY() {
      if (!tocPanel) return;
      var rect = tocPanel.getBoundingClientRect();
      var panelH = (rect && rect.height) ? rect.height : 1;

      panelHBase = Math.max(1, panelH);
      closedOffsetPx = readCssNumberVar('--toc-closed-offset') || 0;

      closedY = Math.max(1, panelHBase + closedOffsetPx);
    }

    function applyDragFrame(y, draggingNow) {
      if (!tocPanel) return;
      currentY = y;

      tocPanel.style.transform = 'translateX(var(--toc-panel-x, -50%)) translateY(' + y + 'px)';

      var denom = (closedY - openLiftPx);
      if (!denom || denom <= 0) denom = 1;

      var progress = (closedY - y) / denom;
      if (progress < 0) progress = 0;
      if (progress > 1) progress = 1;

      tocPanel.style.opacity = '1';

      if (tocOverlay) tocOverlay.style.opacity = String(progress);

      var dx = tocToggleDx;
      var dy = openDyWanted * progress;

      // While dragging, weld the tab to the panel's live edge (no gradual easing by progress).
      if (draggingNow) {
        dx = 0;
        dy = 0;

        var base = getTocToggleBaseRect();
        if (base && tocPanel && tocPanel.getBoundingClientRect) {
          var r = tocPanel.getBoundingClientRect();
          dx = computeOpenToggleDxFromPanelLeft(r.left, base);
          dy = computeOpenToggleDyFromPanelTop(r.top, base);
        }

        if (!isFinite(dx)) dx = 0;
        if (!isFinite(dy)) dy = 0;

        dx = Math.round(dx);
        dy = Math.round(dy);
      }

      setTocToggleOffset(dx, dy, !!draggingNow);

      // While dragging, keep the cap fully seated (no progress easing).
      updateTocCapShift(draggingNow ? 1 : progress, !!draggingNow, SNAP_MS, SNAP_EASE);
    }

    function computeOpenDyForCurrentDragState(yNow) {
      if (!tocPanel) return 0;

      var base = getTocToggleBaseRect();
      if (!base) return 0;

      var rect = tocPanel.getBoundingClientRect();

      var y = (typeof yNow === 'number' && !isNaN(yNow)) ? yNow : 0;
      var openTop = rect.top - (y - openLiftPx);

      return computeOpenToggleDyFromPanelTop(openTop, base);
    }

    function applyOpenStateFromDrag() {
      if (!tocPanel || !tocOverlay) return;

      if (!tocPanel.classList.contains('is-open')) {
        focusReturnEl = tocToggle;

        tocPanel.classList.remove('is-closing');
        tocPanel.classList.add('is-open');
        tocOverlay.classList.add('is-open');

        tocPanel.setAttribute('aria-hidden', 'false');
        tocOverlay.setAttribute('aria-hidden', 'false');

        if (tocToggle) {
          tocToggle.classList.add('is-open');
          tocToggle.setAttribute('aria-expanded', 'true');
          tocToggle.setAttribute('aria-label', 'Close Contents');
        }

        if (currentPageId) {
          for (var i = 0; i < window.COVENANT_JOURNEY.length; i++) {
            if (window.COVENANT_JOURNEY[i].id === currentPageId) {
              setProducedTitle(window.COVENANT_JOURNEY[i].title || '');
              break;
            }
          }
        }

        clearPendingSelection();
        renderToC();
        enableFocusTrap();

        noteOpenToUIStack();
      }

      root.classList.remove('toc-closing');
      root.classList.remove('toc-dock-settling');
    }

    function settleDockAfterSnapClose() {
      var snapMs = readCssNumberVar('--toc-snap-duration');
      if (!snapMs || snapMs <= 0) snapMs = 420;

      root.classList.add('toc-dock-settling');
      root.classList.remove('toc-closing');

      clearTocToggleOffset();

      setTimeout(function () {
        root.classList.remove('toc-dock-settling');
      }, snapMs + 30);
    }

    function finalizeCloseAfterSnap() {
      if (!tocPanel || !tocOverlay) return;

      disableFocusTrap();
      cancelHold();

      if (!confirmNavigating) clearPendingSelection();

      tocPanel.classList.remove('is-open');
      tocPanel.setAttribute('aria-hidden', 'true');

      tocOverlay.classList.remove('is-open');
      tocOverlay.setAttribute('aria-hidden', 'true');

      tocPanel.style.opacity = '0';
      tocOverlay.style.opacity = '0';

      if (tocToggle) {
        tocToggle.classList.remove('is-open');
        tocToggle.setAttribute('aria-expanded', 'false');
        tocToggle.setAttribute('aria-label', 'Open Contents');
      }

      noteCloseToUIStack();

      settleDockAfterSnapClose();

      var target = (focusReturnEl && document.contains(focusReturnEl)) ? focusReturnEl : tocToggle;
      if (target && target.focus) target.focus();
      focusReturnEl = null;

      tocPanel.style.transition = '';
      tocOverlay.style.transition = '';
    }

    function snapCloseFromOpen() {
      if (!tocPanel) return;

      var done = false;

      root.classList.add('toc-closing');
      root.classList.remove('toc-opening');
      root.classList.remove('toc-dock-settling');

      alignDockWindowToSocket();

      var targetY = closedY + CLOSE_SINK_PX;
      applyDragFrame(targetY, false);

      var onEnd = function (e) {
        if (!e) return;
        if (e.target !== tocPanel) return;
        if (e.propertyName && e.propertyName.indexOf('transform') === -1) return;
        finish();
      };

      function finish() {
        if (done) return;
        done = true;
        if (tocPanel && tocPanel.removeEventListener) tocPanel.removeEventListener('transitionend', onEnd);
        finalizeCloseAfterSnap();
      }

      tocPanel.addEventListener('transitionend', onEnd);
      setTimeout(finish, SNAP_MS + 90);
    }

    function snap() {
      if (!tocPanel) return;

      var shouldOpen = false;
      var baseH = panelHBase || closedY || 1;

      if (startWasOpen) {
        var dragDown = currentY - openLiftPx;
        shouldOpen = !(velocity > CLOSE_VELOCITY || dragDown > baseH * CLOSE_RATIO);
      } else {
        var dragUp = closedY - currentY;
        shouldOpen = (velocity < OPEN_VELOCITY || dragUp > baseH * OPEN_RATIO);
      }

      tocPanel.style.transition = 'transform ' + SNAP_MS + 'ms ' + SNAP_EASE + ', opacity ' + SNAP_MS + 'ms ' + SNAP_EASE;
      if (tocOverlay) tocOverlay.style.transition = 'opacity ' + SNAP_MS + 'ms ' + SNAP_EASE;

      if (shouldOpen) {
        // Compute final seat targets using the predicted OPEN geometry.
        var base = getTocToggleBaseRect();
        var rectNow = tocPanel.getBoundingClientRect();
        var openDeltaY = openLiftPx - currentY;

        var dxFinal = 0;
        var dyFinal = 0;
        var capShiftFinal = 0;

        if (base && rectNow) {
          var openPanelLeft = rectNow.left;
          var openPanelTop = rectNow.top + openDeltaY;

          dxFinal = computeOpenToggleDxFromPanelLeft(openPanelLeft, base);
          dyFinal = computeOpenToggleDyFromPanelTop(openPanelTop, base);

          capShiftFinal = computeCapSeatShiftToPanelTop(openPanelTop, base.top, dyFinal);
        }

        // Snap the sheet to open while the toggle + cap animate into their final seat.
        tocPanel.style.transform = 'translateX(var(--toc-panel-x, -50%)) translateY(' + openLiftPx + 'px)';
        tocPanel.style.opacity = '1';
        if (tocOverlay) tocOverlay.style.opacity = '1';

        applyOpenStateFromDrag();

        setTocToggleOffset(dxFinal, dyFinal, false);
        setTocCapShiftPx(capShiftFinal, false, SNAP_MS, SNAP_EASE);

        setTimeout(function () {
          alignToggleToPanelCornerIfDrift(1);
        }, SNAP_MS + 60);

        setTimeout(function () {
          if (!tocPanel) return;
          var firstBtn = tocPanel.querySelector('.toc-item-btn:not([disabled]), .toc-locked-btn');
          if (firstBtn && firstBtn.focus) firstBtn.focus();
          else if (tocPanel.focus) tocPanel.focus();
        }, 0);
      } else {
        if (!startWasOpen) root.classList.add('toc-opening');

        setTocToggleOffset(0, 0, false);
        setTocCapShiftPx(0, false, SNAP_MS, SNAP_EASE);

        if (startWasOpen) {
          snapCloseFromOpen();
        } else {
          applyDragFrame(closedY + CANCEL_OPEN_SINK_PX, false);
        }
      }

      setTimeout(function () {
        if (!tocPanel) return;

        if (shouldOpen) {
          tocPanel.style.transform = '';
          tocPanel.style.opacity = '';
          tocPanel.style.transition = '';
          if (tocOverlay) {
            tocOverlay.style.opacity = '';
            tocOverlay.style.transition = '';
          }

          root.classList.remove('toc-opening');
        } else if (!startWasOpen) {
          tocPanel.style.opacity = '0';
          if (tocOverlay) tocOverlay.style.opacity = '0';
          tocPanel.style.transition = '';
          if (tocOverlay) tocOverlay.style.transition = '';

          noteCloseToUIStack();

          root.classList.add('toc-dock-settling');

          var raf = window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 0); };
          raf(function () {
            raf(function () {
              root.classList.remove('toc-opening');
            });
          });

          setTimeout(function () {
            root.classList.remove('toc-dock-settling');
            clearTocCapShift();
          }, SNAP_MS + 80);
        }
      }, SNAP_MS + 20);
    }

    function beginDrag(e, source, forcedStartY) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      dragging = true;
      moved = false;
      pointerId = e.pointerId;
      dragSource = source;

      startY = (typeof forcedStartY === 'number') ? forcedStartY : e.clientY;
      lastY = e.clientY;
      lastT = Date.now();
      velocity = 0;

      startWasOpen = tocPanel.classList.contains('is-open');

      positionPanel();

      computeOpenLift();

      tocPanel.classList.add('is-dragging');
      if (tocToggle) tocToggle.classList.add('is-toc-dragging');

      if (startWasOpen) {
        root.classList.add('toc-closing');
        root.classList.remove('toc-opening');
        root.classList.remove('toc-dock-settling');

        alignDockWindowToSocket();
      }

      if (!startWasOpen) {
        root.classList.remove('toc-closing');
        root.classList.add('toc-opening');
        root.classList.remove('toc-dock-settling');
        renderToC();

        alignDockWindowToSocket();

        noteOpenToUIStack();
      }

      computeClosedY();

      currentY = startWasOpen ? openLiftPx : closedY;

      tocPanel.style.transition = 'none';
      if (tocOverlay) tocOverlay.style.transition = 'none';

      tocPanel.style.transform = 'translateX(var(--toc-panel-x, -50%)) translateY(' + currentY + 'px)';

      if (!startWasOpen && isMobileSheet()) {
        var base = getTocToggleBaseRect();
        if (base && tocPanel && tocPanel.getBoundingClientRect) {
          var r = tocPanel.getBoundingClientRect();
          var desiredTop = base.top + base.height;
          var delta = desiredTop - r.top;

          if (delta && Math.abs(delta) > 0.5) {
            var newClosedY = closedY + delta;
            if (newClosedY < openLiftPx) newClosedY = openLiftPx;

            delta = newClosedY - closedY;
            closedY = newClosedY;
            currentY = currentY + delta;

            tocPanel.style.transform = 'translateX(var(--toc-panel-x, -50%)) translateY(' + currentY + 'px)';
          }
        }
      }

      openDyWanted = computeOpenDyForCurrentDragState(currentY);

      applyDragFrame(currentY, true);

      var captureTarget = (source === 'seal') ? tocToggle : tocDragRegion;
      if (captureTarget && captureTarget.setPointerCapture) {
        try { captureTarget.setPointerCapture(e.pointerId); } catch (err) {}
      }

      if (e && e.preventDefault) e.preventDefault();
    }

    function moveDrag(e) {
      if (!dragging || e.pointerId !== pointerId) return;

      var deltaY = e.clientY - startY;
      if (!moved && Math.abs(deltaY) > MOVE_SLOP) {
        moved = true;
        window.__COVENANT_TOC_DRAG_JUST_HAPPENED = true;
      }
      if (!moved) return;

      var now = Date.now();
      var dt = now - lastT;
      if (dt > 0) velocity = (e.clientY - lastY) / dt;

      lastY = e.clientY;
      lastT = now;

      var base = startWasOpen ? openLiftPx : closedY;
      var targetY = base + deltaY;
      if (targetY < openLiftPx) targetY = openLiftPx;
      if (targetY > closedY) targetY = closedY;

      applyDragFrame(targetY, true);
      e.preventDefault();
    }

    function endDrag(e) {
      if (!dragging || (e && e.pointerId !== pointerId)) return;

      dragging = false;
      tocPanel.classList.remove('is-dragging');
      if (tocToggle) tocToggle.classList.remove('is-toc-dragging');

      if (moved) {
        window.__COVENANT_TOC_DRAG_JUST_HAPPENED = true;
        setTimeout(function () { window.__COVENANT_TOC_DRAG_JUST_HAPPENED = false; }, 300);
        snap();
      } else {
        if (startWasOpen) root.classList.remove('toc-closing');
        else root.classList.remove('toc-opening');
      }

      if (e) {
        var captureTarget = (dragSource === 'seal') ? tocToggle : tocDragRegion;
        if (captureTarget && captureTarget.hasPointerCapture && captureTarget.hasPointerCapture(e.pointerId)) {
          try { captureTarget.releasePointerCapture(e.pointerId); } catch (err) {}
        }
      }
    }

    function releaseSealCapture(e) {
      if (!e || !tocToggle) return;
      if (tocToggle && tocToggle.hasPointerCapture && tocToggle.hasPointerCapture(e.pointerId)) {
        try { tocToggle.releasePointerCapture(e.pointerId); } catch (err) {}
      }
    }

    tocToggle.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      sealPrimed = true;
      sealPointerId = e.pointerId;
      sealStartY = e.clientY;

      if (tocToggle && tocToggle.setPointerCapture) {
        try { tocToggle.setPointerCapture(e.pointerId); } catch (err) {}
      }
    });

    tocToggle.addEventListener('pointermove', function (e) {
      if (dragging) {
        moveDrag(e);
        return;
      }

      if (!sealPrimed || e.pointerId !== sealPointerId) return;

      var dy = e.clientY - sealStartY;
      if (Math.abs(dy) <= MOVE_SLOP) return;

      sealPrimed = false;
      beginDrag(e, 'seal', sealStartY);
      moveDrag(e);
    });

    tocToggle.addEventListener('pointerup', function (e) {
      if (sealPrimed) releaseSealCapture(e);
      sealPrimed = false;
      sealPointerId = null;
      endDrag(e);
    });

    tocToggle.addEventListener('pointercancel', function (e) {
      if (sealPrimed) releaseSealCapture(e);
      sealPrimed = false;
      sealPointerId = null;
      endDrag(e);
    });

    tocToggle.addEventListener('lostpointercapture', function (e) {
      sealPrimed = false;
      sealPointerId = null;
      endDrag(e);
    });

    if (tocDragRegion) {
      tocDragRegion.addEventListener('pointerdown', function (e) {
        if (!tocPanel.classList.contains('is-open')) return;
        beginDrag(e, 'handle');
      });

      tocDragRegion.addEventListener('pointermove', function (e) {
        moveDrag(e);
      });

      tocDragRegion.addEventListener('pointerup', function (e) {
        endDrag(e);
      });

      tocDragRegion.addEventListener('pointercancel', function (e) {
        endDrag(e);
      });

      tocDragRegion.addEventListener('lostpointercapture', function (e) {
        endDrag(e);
      });
    }
  })();

  // ---------------------------
  // Bind
  // ---------------------------

  function bindContentClicks() {
    if (!tocDynamicContent) return;

    tocDynamicContent.addEventListener('click', function (e) {
      var lockedBtn = closestSafe(e.target, '.toc-locked-btn');
      if (lockedBtn) {
        stopEvent(e);
        announceLockedAttempt();
        return;
      }

      var itemBtn = closestSafe(e.target, '.toc-item-btn');
      if (!itemBtn) return;

      var itemEl = closestSafe(itemBtn, '.toc-item');
      var pageId = itemEl ? itemEl.getAttribute('data-page-id') : '';

      if (pageId && pageId === currentPageId) {
        stopEvent(e);
        clearPendingSelection();
        return;
      }

      var href = itemBtn.getAttribute('data-href');
      if (!href || !pageId) return;

      stopEvent(e);

      var title = String(itemBtn.textContent || '').trim();
      stageSelection(pageId, href, title, itemEl);
    });
  }

  function openToC() {
    if (!tocPanel || !tocOverlay) return;

    if (tapAnimating) return;

    if (window.__COVENANT_TOC_DRAG_JUST_HAPPENED) {
      window.__COVENANT_TOC_DRAG_JUST_HAPPENED = false;
      return;
    }

    tocPanel.style.transform = '';
    tocPanel.style.opacity = '';
    tocPanel.style.transition = '';
    tocOverlay.style.opacity = '';
    tocOverlay.style.transition = '';

    confirmNavigating = false;
    cancelHold();

    focusReturnEl = tocToggle;

    root.classList.remove('toc-closing');
    root.classList.remove('toc-dock-settling');

    positionPanel();

    tocPanel.classList.remove('is-closing');
    tocPanel.classList.add('is-open');
    tocOverlay.classList.add('is-open');

    tocPanel.setAttribute('aria-hidden', 'false');
    tocOverlay.setAttribute('aria-hidden', 'false');

    if (tocToggle) {
      tocToggle.classList.add('is-open');
      tocToggle.setAttribute('aria-expanded', 'true');
      tocToggle.setAttribute('aria-label', 'Close Contents');
    }

    noteOpenToUIStack();

    if (currentPageId) {
      for (var i = 0; i < window.COVENANT_JOURNEY.length; i++) {
        if (window.COVENANT_JOURNEY[i].id === currentPageId) {
          setProducedTitle(window.COVENANT_JOURNEY[i].title || '');
          break;
        }
      }
    }

    clearPendingSelection();
    renderToC();

    enableFocusTrap();

    (function animateTapOpen() {
      var snapMs = getSnapMs();
      var snapEase = getSnapEase();

      tapAnimating = true;
      root.classList.add('toc-opening');

      alignDockWindowToSocket();

      var openLift = readCssNumberVar('--toc-open-lift') || 0;
      var closedY = computePanelClosedY();

      var dxTarget = 0;
      var dyTarget = 0;
      var capShiftTarget = 0;

      tocPanel.style.transition = 'none';
      tocOverlay.style.transition = 'none';

      tocPanel.style.opacity = '0';
      tocOverlay.style.opacity = '0';

      setPanelTranslateY(openLift);

      try {
        var base = getTocToggleBaseRect();
        var rect = tocPanel.getBoundingClientRect();

        if (base && rect) {
          dxTarget = computeOpenToggleDxFromPanelLeft(rect.left, base);
          dyTarget = computeOpenToggleDyFromPanelTop(rect.top, base);

          capShiftTarget = computeCapSeatShiftToPanelTop(rect.top, base.top, dyTarget);
        }
      } catch (err) {}

      tocPanel.style.opacity = '1';
      setPanelTranslateY(closedY);

      var raf = window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 0); };
      raf(function () {
        setTocToggleOffset(dxTarget, dyTarget, false);
        setTocCapShiftPx(capShiftTarget, false, snapMs, snapEase);

        tocPanel.style.transition = 'transform ' + snapMs + 'ms ' + snapEase + ', opacity ' + snapMs + 'ms ' + snapEase;
        tocOverlay.style.transition = 'opacity ' + snapMs + 'ms ' + snapEase;

        setPanelTranslateY(openLift);
        tocOverlay.style.opacity = '1';

        setTimeout(function () {
          tocPanel.style.transform = '';
          tocPanel.style.opacity = '';
          tocPanel.style.transition = '';
          tocOverlay.style.opacity = '';
          tocOverlay.style.transition = '';

          root.classList.remove('toc-opening');
          tapAnimating = false;

          alignToggleToPanelCornerIfDrift(1);
        }, snapMs + 50);
      });
    })();

    setTimeout(function () {
      var firstBtn = tocPanel.querySelector('.toc-item-btn:not([disabled]), .toc-locked-btn');
      if (firstBtn && firstBtn.focus) firstBtn.focus();
      else if (tocPanel.focus) tocPanel.focus();
    }, 0);
  }

  function closeToC(restoreFocus) {
    if (!tocPanel || !tocOverlay) return;

    if (tapAnimating) return;

    disableFocusTrap();
    cancelHold();

    if (!confirmNavigating) {
      clearPendingSelection();
    }

    root.classList.remove('toc-dock-settling');

    root.classList.add('toc-closing');
    root.classList.remove('toc-opening');

    alignDockWindowToSocket();

    tocPanel.classList.add('is-closing');
    tocPanel.classList.add('is-open');
    tocOverlay.classList.add('is-open');

    if (tocToggle) {
      tocToggle.classList.remove('is-open');
      tocToggle.setAttribute('aria-expanded', 'false');
      tocToggle.setAttribute('aria-label', 'Open Contents');
    }

    var snapMs = getSnapMs();
    var snapEase = getSnapEase();

    tapAnimating = true;

    var openLift = readCssNumberVar('--toc-open-lift') || 0;
    var closedY = computePanelClosedY();

    tocPanel.style.transition = 'none';
    tocOverlay.style.transition = 'none';

    tocPanel.style.opacity = '1';
    tocOverlay.style.opacity = '1';

    setPanelTranslateY(openLift);

    var raf = window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 0); };
    raf(function () {
      setTocToggleOffset(0, 0, false);
      setTocCapShiftPx(0, false, snapMs, snapEase);

      tocPanel.style.transition = 'transform ' + snapMs + 'ms ' + snapEase + ', opacity ' + snapMs + 'ms ' + snapEase;
      tocOverlay.style.transition = 'opacity ' + snapMs + 'ms ' + snapEase;

      setPanelTranslateY(closedY);
      tocOverlay.style.opacity = '0';

      setTimeout(function () {
        tocPanel.style.transition = '';
        tocPanel.style.opacity = '0';
        tocOverlay.style.transition = '';
        tocOverlay.style.opacity = '0';

        tocPanel.classList.remove('is-closing');
        tocPanel.classList.remove('is-open');
        tocPanel.setAttribute('aria-hidden', 'true');

        tocOverlay.classList.remove('is-open');
        tocOverlay.setAttribute('aria-hidden', 'true');

        noteCloseToUIStack();

        root.classList.add('toc-dock-settling');
        root.classList.remove('toc-closing');

        clearTocToggleOffset();

        setTimeout(function () {
          root.classList.remove('toc-dock-settling');
        }, snapMs + 30);

        if (restoreFocus) {
          var target = (focusReturnEl && document.contains(focusReturnEl)) ? focusReturnEl : tocToggle;
          if (target && target.focus) target.focus();
        }

        focusReturnEl = null;

        tocPanel.style.transform = 'translateX(var(--toc-panel-x, -50%)) translateY(' + closedY + 'px)';

        tapAnimating = false;
      }, snapMs + 50);
    });
  }

  function toggleToC() {
    if (tapAnimating) return;

    if (tocPanel && (tocPanel.classList.contains('is-open') || tocPanel.classList.contains('is-closing'))) {
      if (!isTopmost()) {
        bringSelfToFront();
        return;
      }

      closeToC(true);
    } else {
      openToC();
    }
  }

  function wireControls() {
    if (tocToggle) {
      tocToggle.addEventListener('click', function (e) {
        stopEvent(e);
        toggleToC();
      });
    }

    if (tocConfirmBtn) {
      tocConfirmBtn.addEventListener('pointerdown', beginHold);
      tocConfirmBtn.addEventListener('pointerup', endHold);
      tocConfirmBtn.addEventListener('pointercancel', endHold);
      tocConfirmBtn.addEventListener('pointerleave', endHold);

      tocConfirmBtn.addEventListener('keydown', function (e) {
        if (!e) return;
        if (e.key === ' ' || e.key === 'Enter') beginHold(e);
      });
      tocConfirmBtn.addEventListener('keyup', function (e) {
        if (!e) return;
        if (e.key === ' ' || e.key === 'Enter') endHold(e);
      });

      tocConfirmBtn.addEventListener('click', function (e) {
        stopEvent(e);
      });
    }

    if (tocOverlay) {
      tocOverlay.addEventListener('click', function (e) {
        stopEvent(e);
        if (!isTopmost()) return;
        closeToC(true);
      });
    }

    document.addEventListener('keydown', function (e) {
      if (!e || e.key !== 'Escape') return;
      if (!tocPanel || !tocPanel.classList || !tocPanel.classList.contains('is-open')) return;
      if (!isTopmost()) return;
      closeToC(true);
    });

    window.addEventListener('resize', function () {
      if (root && root.classList && (root.classList.contains('toc-opening') || root.classList.contains('toc-closing'))) {
        alignDockWindowToSocket();
      }

      if (tocPanel && tocPanel.classList.contains('is-open')) {
        positionPanel();
        alignToggleToPanelCorner();
      }
    });

    window.addEventListener('orientationchange', function () {
      if (root && root.classList && (root.classList.contains('toc-opening') || root.classList.contains('toc-closing'))) {
        alignDockWindowToSocket();
      }

      if (tocPanel && tocPanel.classList.contains('is-open')) {
        positionPanel();
        alignToggleToPanelCorner();
      }
    });

    window.addEventListener('blur', function () {
      if (tocPanel && tocPanel.classList.contains('is-open') && isTopmost()) closeToC(false);
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && tocPanel && tocPanel.classList.contains('is-open') && isTopmost()) closeToC(false);
    });
  }

  // ---------------------------
  // Init
  // ---------------------------

  loadProgress();
  enforceSoftGate();
  unlockCurrentPage();

  if (!tocPanel || !tocOverlay || !tocToggle) {
    return;
  }

  registerWithUIStack();

  bindContentClicks();
  wireControls();

  // Keep badge fresh even if opened after load.
  startDebugBadgeIfNeeded();
})();
