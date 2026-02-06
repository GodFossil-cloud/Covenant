/*! Covenant ToC v3.2.12 (Seat cap against final geometry + dock window guard fix) */
(function () {
  'use strict';

  window.COVENANT_TOC_VERSION = '3.2.12';

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
      .replace(/\"/g, '&quot;')
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
    return 10;
  }

  function getDockCapSizePx() {
    var v = resolveCssVarPx('--dock-cap-size');
    if (typeof v === 'number' && !isNaN(v) && v > 0) return v;

    try {
      if (tocToggle) {
        var cap = tocToggle.querySelector('.dock-cap');
        if (cap && cap.getBoundingClientRect) {
          var r = cap.getBoundingClientRect();
          if (r && r.height) return r.height;
        }
      }
    } catch (err) {}

    return 46;
  }

  function computeCapSeatShiftToHeaderCenter(headerCenterY, baseToggleTop, dyFinal) {
    var lift = getDockCapLiftPx();
    var capSize = getDockCapSizePx();
    var capHalf = (capSize && capSize > 0) ? (capSize / 2) : 0;

    var dy = (typeof dyFinal === 'number' && !isNaN(dyFinal)) ? dyFinal : 0;
    var capCenterAtShift0 = baseToggleTop + dy + (-1 * lift) + capHalf;

    return headerCenterY - capCenterAtShift0;
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

    if (next > 260) next = 260;
    if (next < -260) next = -260;

    tocCapShiftY = next;

    var lift = getDockCapLiftPx();

    if (cap) {
      cap.style.transform = 'translate3d(-50%,' + ((-1 * lift) + next) + 'px,0)';
      cap.style.transition = draggingNow ? 'none' : ('transform ' + ms + 'ms ' + ease);
      cap.style.willChange = 'transform';
    }

    if (glyph) {
      glyph.style.transform = 'translate3d(-50%,-50%,0) translateY(' + (-0.5 + next) + 'px)';
      glyph.style.transition = draggingNow ? 'none' : ('transform ' + ms + 'ms ' + ease);
      glyph.style.willChange = 'transform';
    }
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
  }

  function updateTocCapShift(progress, draggingNow, snapMs, snapEase) {
    if (!tocToggle || !tocPanel) return;

    var cap = tocToggle.querySelector('.dock-cap');
    if (!cap || !cap.getBoundingClientRect) return;

    var header = tocPanel.querySelector('.toc-panel-header');
    if (!header || !header.getBoundingClientRect) return;

    var p = (typeof progress === 'number' && !isNaN(progress)) ? progress : 0;
    if (p < 0) p = 0;
    if (p > 1) p = 1;

    var capRect = cap.getBoundingClientRect();
    var headerRect = header.getBoundingClientRect();

    var capCenterY = capRect.top + (capRect.height / 2);
    var baseCenterY = capCenterY - tocCapShiftY;

    var targetY = headerRect.top + (headerRect.height / 2);

    var shift = (targetY - baseCenterY) * p;

    setTocCapShiftPx(shift, !!draggingNow, snapMs, snapEase);
  }

  function alignDockWindowToSocket() {
    try {
      var footer = document.querySelector('.nav-footer');
      var seals = document.querySelector('.nav-seals');
      if (!footer || !seals || !footer.getBoundingClientRect || !seals.getBoundingClientRect) return;

      var footerRect = footer.getBoundingClientRect();
      var sealsRect = seals.getBoundingClientRect();

      var tabW = readCssNumberVar('--toc-tab-width');
      if (!tabW || tabW <= 0) {
        if (tocToggle && tocToggle.getBoundingClientRect) {
          tabW = tocToggle.getBoundingClientRect().width || 0;
        }
      }
      if (!tabW || tabW <= 0) return;

      var w = readCssNumberVar('--dock-window-w');
      var h = readCssNumberVar('--dock-window-h');

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

      var centerX = sealsRect.left + (tabW / 2);
      var centerY = sealsRect.top + (sealsRect.height / 2) + socketRaise + 1;

      var left = Math.round(centerX - footerRect.left - (w / 2));
      var top = Math.round(centerY - footerRect.top - (h / 2)) - 2;

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
    return openPanelLeft - baseRect.left;
  }

  function computeOpenToggleDyFromPanelTop(openPanelTop, baseRect) {
    if (!baseRect) return 0;

    var notchH = getTocNotchH();
    var seatDy = getTocSeatDy();
    var overlapPx = getTocSeatOverlapPx();

    if (notchH && notchH > 0) {
      var targetTop = openPanelTop + notchH - baseRect.height;
      targetTop = targetTop + seatDy + overlapPx;
      return targetTop - baseRect.top;
    }

    var legacyTop = openPanelTop;

    if (isMobileSheet()) {
      legacyTop = openPanelTop - baseRect.height;
    }

    legacyTop = legacyTop + seatDy + overlapPx;

    return legacyTop - baseRect.top;
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

  function computePanelClosedY() {
    if (!tocPanel || !tocPanel.getBoundingClientRect) return 1;

    var rect = tocPanel.getBoundingClientRect();
    var h = (rect && rect.height) ? rect.height : 1;
    var closedOffsetPx = readCssNumberVar('--toc-closed-offset') || 0;

    var SINK_PX = 4;

    return Math.max(1, h + closedOffsetPx + SINK_PX);
  }

  function setPanelTranslateY(y) {
    if (!tocPanel) return;
    tocPanel.style.transform = 'translateX(var(--toc-panel-x, -50%)) translateY(' + y + 'px)';
  }

  // NOTE: Remainder of file unchanged from v3.2.11 aside from version + guard fix.

})();
