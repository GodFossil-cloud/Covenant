/*! Covenant Reliquary UI v0.2.5 (Sheet Carry + Drag-to-Open/Close) */
(function () {
  'use strict';

  window.COVENANT_RELIQUARY_VERSION = '0.2.5';

  var doc = document;
  var root = doc.documentElement;

  function byId(id) { return doc.getElementById(id); }

  function stopEvent(e) {
    if (!e) return;
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  }

  function closestSafe(target, selector) {
    if (!target) return null;
    var el = (target.nodeType === 1) ? target : target.parentElement;
    if (!el || !el.closest) return null;
    return el.closest(selector);
  }

  function readCssVarString(varName) {
    try {
      var raw = getComputedStyle(root).getPropertyValue(varName);
      return String(raw || '').trim();
    } catch (err) {
      return '';
    }
  }

  function readCssNumberVar(varName) {
    try {
      var raw = getComputedStyle(root).getPropertyValue(varName);
      if (!raw) return 0;
      var v = parseFloat(String(raw).trim());
      return isNaN(v) ? 0 : v;
    } catch (err) {
      return 0;
    }
  }

  function getSnapMs() {
    var ms = readCssNumberVar('--reliquary-snap-duration');
    if (ms && ms > 0) return ms;
    return 420;
  }

  function getSnapEase() {
    var s = readCssVarString('--reliquary-snap-ease');
    return s || 'cubic-bezier(0.22, 0.61, 0.36, 1)';
  }

  function isMobileSheet() {
    try {
      return !!(window.matchMedia && window.matchMedia('(max-width: 600px)').matches);
    } catch (err) {
      return false;
    }
  }

  var panel = byId('reliquaryPanel');
  var overlay = byId('reliquaryOverlay');
  var toggle = byId('mirrorToggle');
  var dragRegion = byId('reliquaryDragRegion');

  // Optional: gracefully close ToC first (without touching ToC internals).
  var tocPanel = byId('tocPanel');
  var tocToggle = byId('tocToggle');

  if (!panel || !overlay || !toggle) return;

  var focusReturnEl = null;
  var focusTrapEnabled = false;
  var focusTrapHandler = null;

  var scrollLockY = 0;

  // Mirror tab "carry" offsets.
  var reliquaryToggleDx = 0;
  var reliquaryToggleDy = 0;

  // Tap-open/close animation guard.
  var tapAnimating = false;

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

  var iosTouchMoveBlocker = null;
  var IOS_TOUCHMOVE_OPTS = { capture: true, passive: false };

  window.__COVENANT_RELIQUARY_DRAG_JUST_HAPPENED = false;

  function enableIOSTouchScrollLock() {
    if (iosTouchMoveBlocker) return;

    iosTouchMoveBlocker = function (e) {
      if (!panel || !panel.classList.contains('is-open')) return;
      if (closestSafe(e.target, '#reliquaryPanel .reliquary-panel-body')) return;
      if (e && e.cancelable) e.preventDefault();
    };

    doc.addEventListener('touchmove', iosTouchMoveBlocker, IOS_TOUCHMOVE_OPTS);
  }

  function disableIOSTouchScrollLock() {
    if (!iosTouchMoveBlocker) return;
    doc.removeEventListener('touchmove', iosTouchMoveBlocker, IOS_TOUCHMOVE_OPTS);
    iosTouchMoveBlocker = null;
  }

  function lockBodyScroll() {
    if (root.classList.contains('reliquary-scroll-lock') || doc.body.classList.contains('reliquary-scroll-lock')) return;

    scrollLockY = window.scrollY || window.pageYOffset || 0;
    root.classList.add('reliquary-scroll-lock');

    if (isIOS) {
      doc.body.style.overflow = 'hidden';
      enableIOSTouchScrollLock();
      return;
    }

    doc.body.classList.add('reliquary-scroll-lock');
    doc.body.style.top = (-scrollLockY) + 'px';
  }

  function unlockBodyScroll() {
    var wasLocked = root.classList.contains('reliquary-scroll-lock') || doc.body.classList.contains('reliquary-scroll-lock');

    root.classList.remove('reliquary-scroll-lock');

    if (isIOS) {
      disableIOSTouchScrollLock();
      doc.body.style.overflow = '';
      if (wasLocked) window.scrollTo(0, scrollLockY);
      return;
    }

    doc.body.classList.remove('reliquary-scroll-lock');
    doc.body.style.top = '';

    if (wasLocked) window.scrollTo(0, scrollLockY);
  }

  function getFocusableInPanel() {
    if (!panel || !panel.querySelectorAll) return [];

    var nodes = panel.querySelectorAll('button:not([disabled]), a[href], textarea, input, select, [tabindex]:not([tabindex="-1"])');
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
    if (!panel || !panel.addEventListener) return;

    focusTrapHandler = function (e) {
      if (!e || e.key !== 'Tab') return;
      if (!panel.classList.contains('is-open')) return;

      var focusables = getFocusableInPanel();
      if (!focusables.length) return;

      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      var active = doc.activeElement;

      if (e.shiftKey) {
        if (active === first || active === panel) {
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

    panel.addEventListener('keydown', focusTrapHandler);
    focusTrapEnabled = true;
  }

  function disableFocusTrap() {
    if (!focusTrapEnabled) return;
    if (panel && panel.removeEventListener && focusTrapHandler) {
      panel.removeEventListener('keydown', focusTrapHandler);
    }
    focusTrapEnabled = false;
    focusTrapHandler = null;
  }

  function focusIntoPanel() {
    var target = (panel ? panel.querySelector('button:not([disabled]), a[href], textarea, input, select, [tabindex]:not([tabindex="-1"])') : null);
    if (target && target.focus) target.focus();
    else if (panel && panel.focus) panel.focus();
  }

  function closeToCIfOpen() {
    if (!tocPanel || !tocToggle) return;
    if (tocPanel.classList && tocPanel.classList.contains('is-open')) {
      try { tocToggle.click(); } catch (err) {}
    }
  }

  function setReliquaryToggleOffset(dx, dy, draggingNow) {
    if (!toggle) return;

    if (!draggingNow) {
      dx = Math.round(dx || 0);
      dy = Math.round(dy || 0);
    }

    reliquaryToggleDx = dx;
    reliquaryToggleDy = dy;

    toggle.style.setProperty('--reliquary-toggle-drag-x', dx + 'px');
    toggle.style.setProperty('--reliquary-toggle-drag-y', dy + 'px');
  }

  function clearReliquaryToggleOffset() {
    if (!toggle) return;

    reliquaryToggleDx = 0;
    reliquaryToggleDy = 0;

    toggle.style.setProperty('--reliquary-toggle-drag-x', '0px');
    toggle.style.setProperty('--reliquary-toggle-drag-y', '0px');
    toggle.classList.remove('is-reliquary-dragging');
  }

  function getToggleBaseRect() {
    if (!toggle || !toggle.getBoundingClientRect) return null;

    var r = toggle.getBoundingClientRect();
    return {
      left: r.left - reliquaryToggleDx,
      top: r.top - reliquaryToggleDy,
      width: r.width,
      height: r.height,
      right: r.right - reliquaryToggleDx,
      bottom: r.bottom - reliquaryToggleDy
    };
  }

  function computeOpenToggleDxFromPanelRight(openPanelRight, baseRect) {
    if (!baseRect) return 0;
    return openPanelRight - baseRect.right;
  }

  function computeOpenToggleDyFromPanelTop(openPanelTop, baseRect) {
    if (!baseRect) return 0;

    // Weld rule (all viewports): tab bottom edge flush with sheet top edge.
    var targetTop = openPanelTop - baseRect.height;

    return targetTop - baseRect.top;
  }

  function alignToggleToPanelCornerIfDrift(thresholdPx) {
    if (!panel || !panel.getBoundingClientRect || !toggle) return;

    var thr = (typeof thresholdPx === 'number' && !isNaN(thresholdPx)) ? thresholdPx : 1;

    var raf = window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 0); };

    raf(function () {
      var base = getToggleBaseRect();
      if (!base) return;

      var rect = panel.getBoundingClientRect();
      var openLift = readCssNumberVar('--reliquary-open-lift') || 0;
      var targetTop = rect.top - openLift;

      var dx = Math.round(computeOpenToggleDxFromPanelRight(rect.right, base) || 0);
      var dy = Math.round(computeOpenToggleDyFromPanelTop(targetTop, base) || 0);

      if (Math.abs(dx - reliquaryToggleDx) <= thr && Math.abs(dy - reliquaryToggleDy) <= thr) return;
      setReliquaryToggleOffset(dx, dy, false);
    });
  }

  function alignToggleToPanelCorner() {
    if (!panel || !panel.getBoundingClientRect || !toggle) return;

    var raf = window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 0); };

    raf(function () {
      var base = getToggleBaseRect();
      if (!base) return;

      var rect = panel.getBoundingClientRect();
      var openLift = readCssNumberVar('--reliquary-open-lift') || 0;
      var targetTop = rect.top - openLift;

      var dx = computeOpenToggleDxFromPanelRight(rect.right, base);
      var dy = computeOpenToggleDyFromPanelTop(targetTop, base);

      setReliquaryToggleOffset(dx, dy, false);
    });
  }

  function getFooterReservedPx() {
    var total = readCssNumberVar('--footer-total-height');
    if (!total) {
      total = readCssNumberVar('--footer-height') + readCssNumberVar('--footer-safe');
    }

    if (!total) {
      var footer = doc.querySelector('.nav-footer');
      if (footer && footer.getBoundingClientRect) {
        total = footer.getBoundingClientRect().height || 0;
      }
    }

    return Math.max(0, Math.round(total));
  }

  function positionPanel() {
    if (!panel) return;

    var footerReserved = getFooterReservedPx();
    var bottom = footerReserved;
    var maxH = Math.max(240, Math.floor(window.innerHeight - bottom));

    panel.style.bottom = bottom + 'px';
    panel.style.maxHeight = maxH + 'px';

    if (isMobileSheet()) {
      panel.style.top = '0px';
      panel.style.setProperty('--reliquary-panel-x', '0px');

      // Mirror the ToC anchoring logic:
      // Reliquary panel spans from viewport LEFT edge to the Mirror tab's RIGHT edge.
      var rect = toggle.getBoundingClientRect();
      var rightInset = Math.max(0, Math.round(window.innerWidth - rect.right));
      panel.style.setProperty('--reliquary-panel-right', rightInset + 'px');
    } else {
      panel.style.top = '';
      panel.style.setProperty('--reliquary-panel-x', '-50%');
      panel.style.removeProperty('--reliquary-panel-right');
    }
  }

  function setPanelTranslateY(y) {
    if (!panel) return;
    panel.style.transform = 'translateX(var(--reliquary-panel-x, -50%)) translateY(' + y + 'px)';
  }

  function computePanelClosedY() {
    if (!panel || !panel.getBoundingClientRect) return 1;

    var rect = panel.getBoundingClientRect();
    var h = (rect && rect.height) ? rect.height : 1;
    var closedOffsetPx = readCssNumberVar('--reliquary-closed-offset') || 0;

    var SINK_PX = 4;

    return Math.max(1, h + closedOffsetPx + SINK_PX);
  }

  function openReliquaryImmediately() {
    closeToCIfOpen();

    focusReturnEl = toggle;

    root.classList.add('reliquary-open');

    panel.classList.add('is-open');
    overlay.classList.add('is-open');

    panel.setAttribute('aria-hidden', 'false');
    overlay.setAttribute('aria-hidden', 'false');

    toggle.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close Reliquary');

    lockBodyScroll();
    enableFocusTrap();
  }

  function closeReliquaryImmediately(restoreFocus) {
    disableFocusTrap();

    root.classList.remove('reliquary-open');

    panel.classList.remove('is-open');
    overlay.classList.remove('is-open');

    panel.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('aria-hidden', 'true');

    toggle.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open Reliquary');

    unlockBodyScroll();

    if (restoreFocus) {
      var target = (focusReturnEl && doc.contains(focusReturnEl)) ? focusReturnEl : toggle;
      if (target && target.focus) target.focus();
    }

    focusReturnEl = null;
  }

  function openReliquaryTap() {
    if (tapAnimating) return;

    if (window.__COVENANT_RELIQUARY_DRAG_JUST_HAPPENED) {
      window.__COVENANT_RELIQUARY_DRAG_JUST_HAPPENED = false;
      return;
    }

    // Clear any residual inline snap styles.
    panel.style.transform = '';
    panel.style.opacity = '';
    panel.style.transition = '';
    overlay.style.opacity = '';
    overlay.style.transition = '';

    openReliquaryImmediately();
    positionPanel();

    var snapMs = getSnapMs();
    var snapEase = getSnapEase();
    var openLift = readCssNumberVar('--reliquary-open-lift') || 0;

    tapAnimating = true;
    root.classList.add('reliquary-opening');

    // Start from fully-closed geometry.
    var closedY = computePanelClosedY();

    // IMPORTANT: do not add .is-dragging here (it forces transition:none !important in CSS).
    panel.style.transition = 'none';
    overlay.style.transition = 'none';

    panel.style.opacity = '1';
    overlay.style.opacity = '0';

    setPanelTranslateY(closedY);

    var raf = window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 0); };
    raf(function () {
      // Predict where the open top will be, even though we are currently translated down.
      var base = getToggleBaseRect();
      if (base && panel && panel.getBoundingClientRect) {
        var rect = panel.getBoundingClientRect();
        var predictedOpenTop = rect.top - (closedY - openLift);

        var dx = computeOpenToggleDxFromPanelRight(rect.right, base);
        var dy = computeOpenToggleDyFromPanelTop(predictedOpenTop, base);

        setReliquaryToggleOffset(dx, dy, false);
      }

      panel.style.transition = 'transform ' + snapMs + 'ms ' + snapEase + ', opacity ' + snapMs + 'ms ' + snapEase;
      overlay.style.transition = 'opacity ' + snapMs + 'ms ' + snapEase;

      setPanelTranslateY(openLift);
      overlay.style.opacity = '1';

      setTimeout(function () {
        panel.style.transform = '';
        panel.style.opacity = '';
        panel.style.transition = '';

        overlay.style.opacity = '';
        overlay.style.transition = '';

        root.classList.remove('reliquary-opening');
        tapAnimating = false;

        alignToggleToPanelCornerIfDrift(1);
        setTimeout(focusIntoPanel, 0);
      }, snapMs + 50);
    });
  }

  function closeReliquaryTap(restoreFocus) {
    if (tapAnimating) return;

    disableFocusTrap();

    root.classList.remove('reliquary-opening');
    root.classList.add('reliquary-closing');
    root.classList.remove('reliquary-dock-settling');

    var snapMs = getSnapMs();
    var snapEase = getSnapEase();
    var openLift = readCssNumberVar('--reliquary-open-lift') || 0;

    tapAnimating = true;

    var closedY = computePanelClosedY();

    // IMPORTANT: do not add .is-dragging here (it forces transition:none !important in CSS).
    panel.style.transition = 'none';
    overlay.style.transition = 'none';

    panel.style.opacity = '1';
    overlay.style.opacity = '1';

    setPanelTranslateY(openLift);

    var raf = window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 0); };
    raf(function () {
      setReliquaryToggleOffset(0, 0, false);

      panel.style.transition = 'transform ' + snapMs + 'ms ' + snapEase + ', opacity ' + snapMs + 'ms ' + snapEase;
      overlay.style.transition = 'opacity ' + snapMs + 'ms ' + snapEase;

      setPanelTranslateY(closedY);
      overlay.style.opacity = '0';

      setTimeout(function () {
        panel.style.transition = '';
        panel.style.opacity = '0';

        overlay.style.transition = '';
        overlay.style.opacity = '0';

        panel.classList.remove('is-open');
        overlay.classList.remove('is-open');

        panel.setAttribute('aria-hidden', 'true');
        overlay.setAttribute('aria-hidden', 'true');

        root.classList.remove('reliquary-closing');
        root.classList.add('reliquary-dock-settling');

        clearReliquaryToggleOffset();

        setTimeout(function () {
          root.classList.remove('reliquary-dock-settling');
        }, snapMs + 30);

        toggle.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open Reliquary');

        root.classList.remove('reliquary-open');
        unlockBodyScroll();

        if (restoreFocus) {
          var target = (focusReturnEl && doc.contains(focusReturnEl)) ? focusReturnEl : toggle;
          if (target && target.focus) target.focus();
        }

        focusReturnEl = null;

        // Leave the panel translated down until next open clears styles.
        panel.style.transform = 'translateX(var(--reliquary-panel-x, -50%)) translateY(' + closedY + 'px)';

        tapAnimating = false;
      }, snapMs + 50);
    });
  }

  function toggleReliquaryTap() {
    if (tapAnimating) return;

    if (panel && panel.classList.contains('is-open')) {
      closeReliquaryTap(true);
    } else {
      openReliquaryTap();
    }
  }

  // ---------------------------
  // Drag-to-open/close (seal + handle)
  // ---------------------------

  (function initReliquaryDrag() {
    if (!panel || !overlay || !toggle) return;
    if (!window.PointerEvent) return;

    var dragging = false;
    var moved = false;
    var pointerId = null;
    var dragSource = null; // 'seal' or 'handle'

    // iOS tap compatibility: promote to drag only after MOVE_SLOP.
    var sealPrimed = false;
    var sealPointerId = null;
    var sealStartY = 0;

    var startY = 0;
    var lastY = 0;
    var lastT = 0;
    var velocity = 0;

    var startWasOpen = false;

    // "Hidden" fully-offscreen Y (below dock).
    var closedY = 0;
    // "Dock seam" Y where the sheet top kisses the tab bottom.
    var seamY = 0;
    var currentY = 0;

    // Cached geometry for true weld (avoid per-frame layout reads).
    var toggleBase = null;
    var panelBaseTop = 0;
    var panelStartTop = 0;
    var panelStartY = 0;

    var panelHBase = 0;
    var closedOffsetPx = 0;
    var openLiftPx = 0;

    var MOVE_SLOP = 6;

    var OPEN_VELOCITY = -0.85;
    var OPEN_RATIO = 0.38;

    var CLOSE_VELOCITY = 0.85;
    var CLOSE_RATIO = 0.28;

    var SNAP_MS = getSnapMs();
    var SNAP_EASE = getSnapEase();

    var CLOSE_SINK_PX = 4;
    var CANCEL_OPEN_SINK_PX = 12;

    function computeOpenLift() {
      var v = readCssNumberVar('--reliquary-open-lift');
      openLiftPx = (typeof v === 'number' && !isNaN(v)) ? v : 0;
    }

    function computeClosedY() {
      if (!panel) return;
      var rect = panel.getBoundingClientRect();
      var panelH = (rect && rect.height) ? rect.height : 1;

      panelHBase = Math.max(1, panelH);
      closedOffsetPx = readCssNumberVar('--reliquary-closed-offset') || 0;
      closedY = Math.max(1, panelHBase + closedOffsetPx);
    }

    function computeSeamY() {
      if (!panel) return;

      toggleBase = getToggleBaseRect();
      if (!toggleBase) {
        seamY = closedY;
        return;
      }

      // Measure panel base-top from a known translated position.
      panel.style.transform = 'translateX(var(--reliquary-panel-x, -50%)) translateY(' + closedY + 'px)';
      var rect = panel.getBoundingClientRect();
      panelBaseTop = rect.top - closedY;

      var tabBottom = toggleBase.top + toggleBase.height;
      seamY = tabBottom - panelBaseTop;

      // Clamp seam between fully-open and fully-hidden.
      if (seamY < openLiftPx) seamY = openLiftPx;
      if (seamY > closedY) seamY = closedY;
    }

    function applyDragFrame(y, draggingNow) {
      currentY = y;

      panel.style.transform = 'translateX(var(--reliquary-panel-x, -50%)) translateY(' + y + 'px)';

      var denom = (seamY - openLiftPx);
      if (!denom || denom <= 0) denom = 1;

      var yForProgress = y;
      if (yForProgress > seamY) yForProgress = seamY;

      var progress = (seamY - yForProgress) / denom;
      if (progress < 0) progress = 0;
      if (progress > 1) progress = 1;

      panel.style.opacity = '1';
      overlay.style.opacity = String(progress);

      // True weld: tab bottom edge stays flush with the sheet top edge for the full drag travel.
      var dy = 0;
      if (toggleBase && y <= seamY) {
        var panelTop = panelStartTop + (y - panelStartY);
        dy = computeOpenToggleDyFromPanelTop(panelTop, toggleBase);
      }

      setReliquaryToggleOffset(0, dy, !!draggingNow);
    }

    function applyOpenStateFromDrag() {
      if (!panel || !overlay) return;

      if (!panel.classList.contains('is-open')) {
        openReliquaryImmediately();
      }

      root.classList.remove('reliquary-opening');
      root.classList.remove('reliquary-closing');
      root.classList.remove('reliquary-dock-settling');

      alignToggleToPanelCorner();
      setTimeout(focusIntoPanel, 0);
    }

    function settleDockAfterSnapClose() {
      root.classList.add('reliquary-dock-settling');
      root.classList.remove('reliquary-closing');

      clearReliquaryToggleOffset();

      setTimeout(function () {
        root.classList.remove('reliquary-dock-settling');
      }, SNAP_MS + 30);
    }

    function finalizeCloseAfterSnap(restoreFocus) {
      disableFocusTrap();

      panel.classList.remove('is-open');
      overlay.classList.remove('is-open');

      panel.setAttribute('aria-hidden', 'true');
      overlay.setAttribute('aria-hidden', 'true');

      panel.style.opacity = '0';
      overlay.style.opacity = '0';

      toggle.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open Reliquary');

      root.classList.remove('reliquary-open');

      unlockBodyScroll();

      settleDockAfterSnapClose();

      if (restoreFocus) {
        var target = (focusReturnEl && doc.contains(focusReturnEl)) ? focusReturnEl : toggle;
        if (target && target.focus) target.focus();
      }
      focusReturnEl = null;

      panel.style.transition = '';
      overlay.style.transition = '';
    }

    function snapCloseFromOpen() {
      root.classList.add('reliquary-closing');
      root.classList.remove('reliquary-opening');
      root.classList.remove('reliquary-dock-settling');

      var targetY = closedY + CLOSE_SINK_PX;
      applyDragFrame(targetY, false);

      var done = false;

      var onEnd = function (e) {
        if (!e) return;
        if (e.target !== panel) return;
        if (e.propertyName && e.propertyName.indexOf('transform') === -1) return;
        finish();
      };

      function finish() {
        if (done) return;
        done = true;
        if (panel && panel.removeEventListener) panel.removeEventListener('transitionend', onEnd);
        finalizeCloseAfterSnap(true);
      }

      panel.addEventListener('transitionend', onEnd);
      setTimeout(finish, SNAP_MS + 90);
    }

    function snap() {
      var shouldOpen = false;
      var travelH = (seamY - openLiftPx) || 1;

      if (startWasOpen) {
        var dragDown = currentY - openLiftPx;
        shouldOpen = !(velocity > CLOSE_VELOCITY || dragDown > travelH * CLOSE_RATIO);
      } else {
        var dragUp = seamY - currentY;
        shouldOpen = (velocity < OPEN_VELOCITY || dragUp > travelH * OPEN_RATIO);
      }

      panel.style.transition = 'transform ' + SNAP_MS + 'ms ' + SNAP_EASE + ', opacity ' + SNAP_MS + 'ms ' + SNAP_EASE;
      overlay.style.transition = 'opacity ' + SNAP_MS + 'ms ' + SNAP_EASE;

      if (shouldOpen) {
        applyDragFrame(openLiftPx, false);
        applyOpenStateFromDrag();
      } else {
        setReliquaryToggleOffset(0, 0, false);

        if (startWasOpen) {
          snapCloseFromOpen();
        } else {
          applyDragFrame(closedY + CANCEL_OPEN_SINK_PX, false);
        }
      }

      setTimeout(function () {
        if (shouldOpen) {
          panel.style.transform = '';
          panel.style.opacity = '';
          panel.style.transition = '';
          overlay.style.opacity = '';
          overlay.style.transition = '';
        } else if (!startWasOpen) {
          panel.style.opacity = '0';
          overlay.style.opacity = '0';
          panel.style.transition = '';
          overlay.style.transition = '';

          root.classList.add('reliquary-dock-settling');

          var raf = window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 0); };
          raf(function () {
            raf(function () {
              root.classList.remove('reliquary-opening');
            });
          });

          setTimeout(function () {
            root.classList.remove('reliquary-dock-settling');
          }, SNAP_MS + 80);

          closeReliquaryImmediately(false);
          clearReliquaryToggleOffset();
        }
      }, SNAP_MS + 20);
    }

    function beginDrag(e, source, forcedStartY) {
      if (tapAnimating) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      dragging = true;
      moved = false;
      pointerId = e.pointerId;
      dragSource = source;

      startY = (typeof forcedStartY === 'number') ? forcedStartY : e.clientY;
      lastY = e.clientY;
      lastT = Date.now();
      velocity = 0;

      startWasOpen = panel.classList.contains('is-open');

      positionPanel();
      computeOpenLift();

      if (!startWasOpen) {
        root.classList.remove('reliquary-closing');
        root.classList.add('reliquary-opening');
        root.classList.remove('reliquary-dock-settling');

        openReliquaryImmediately();
      }

      computeClosedY();
      computeSeamY();

      panelStartY = startWasOpen ? openLiftPx : seamY;
      currentY = panelStartY;

      panel.classList.add('is-dragging');
      toggle.classList.add('is-reliquary-dragging');

      panel.style.transition = 'none';
      overlay.style.transition = 'none';

      panel.style.transform = 'translateX(var(--reliquary-panel-x, -50%)) translateY(' + currentY + 'px)';
      panelStartTop = panelBaseTop + panelStartY;

      applyDragFrame(currentY, true);

      var captureTarget = (source === 'seal') ? toggle : dragRegion;
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
        window.__COVENANT_RELIQUARY_DRAG_JUST_HAPPENED = true;
      }
      if (!moved) return;

      var now = Date.now();
      var dt = now - lastT;
      if (dt > 0) velocity = (e.clientY - lastY) / dt;

      lastY = e.clientY;
      lastT = now;

      var base = startWasOpen ? openLiftPx : seamY;
      var targetY = base + deltaY;
      if (targetY < openLiftPx) targetY = openLiftPx;
      if (targetY > closedY) targetY = closedY;

      applyDragFrame(targetY, true);
      e.preventDefault();
    }

    function endDrag(e) {
      if (!dragging || (e && e.pointerId !== pointerId)) return;

      dragging = false;
      panel.classList.remove('is-dragging');
      toggle.classList.remove('is-reliquary-dragging');

      if (moved) {
        window.__COVENANT_RELIQUARY_DRAG_JUST_HAPPENED = true;
        setTimeout(function () { window.__COVENANT_RELIQUARY_DRAG_JUST_HAPPENED = false; }, 300);
        snap();
      } else {
        root.classList.remove('reliquary-opening');
      }

      if (e) {
        var captureTarget = (dragSource === 'seal') ? toggle : dragRegion;
        if (captureTarget && captureTarget.hasPointerCapture && captureTarget.hasPointerCapture(e.pointerId)) {
          try { captureTarget.releasePointerCapture(e.pointerId); } catch (err) {}
        }
      }
    }

    function releaseSealCapture(e) {
      if (!e || !toggle) return;
      if (toggle && toggle.hasPointerCapture && toggle.hasPointerCapture(e.pointerId)) {
        try { toggle.releasePointerCapture(e.pointerId); } catch (err) {}
      }
    }

    toggle.addEventListener('pointerdown', function (e) {
      if (tapAnimating) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      sealPrimed = true;
      sealPointerId = e.pointerId;
      sealStartY = e.clientY;

      if (toggle && toggle.setPointerCapture) {
        try { toggle.setPointerCapture(e.pointerId); } catch (err) {}
      }
    });

    toggle.addEventListener('pointermove', function (e) {
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

    toggle.addEventListener('pointerup', function (e) {
      if (sealPrimed) releaseSealCapture(e);
      sealPrimed = false;
      sealPointerId = null;
      endDrag(e);
    });

    toggle.addEventListener('pointercancel', function (e) {
      if (sealPrimed) releaseSealCapture(e);
      sealPrimed = false;
      sealPointerId = null;
      endDrag(e);
    });

    toggle.addEventListener('lostpointercapture', function (e) {
      sealPrimed = false;
      sealPointerId = null;
      endDrag(e);
    });

    if (dragRegion) {
      dragRegion.addEventListener('pointerdown', function (e) {
        if (!panel.classList.contains('is-open')) return;
        beginDrag(e, 'handle');
      });

      dragRegion.addEventListener('pointermove', function (e) {
        moveDrag(e);
      });

      dragRegion.addEventListener('pointerup', function (e) {
        endDrag(e);
      });

      dragRegion.addEventListener('pointercancel', function (e) {
        endDrag(e);
      });

      dragRegion.addEventListener('lostpointercapture', function (e) {
        endDrag(e);
      });
    }
  })();

  // ---------------------------
  // Wiring
  // ---------------------------

  toggle.addEventListener('click', function (e) {
    stopEvent(e);
    toggleReliquaryTap();
  });

  overlay.addEventListener('click', function (e) {
    stopEvent(e);
    if (panel.classList.contains('is-open')) closeReliquaryTap(true);
  });

  doc.addEventListener('keydown', function (e) {
    if (!e || e.key !== 'Escape') return;
    if (panel.classList.contains('is-open')) closeReliquaryTap(true);
  });

  window.addEventListener('resize', function () {
    if (panel && panel.classList.contains('is-open')) {
      positionPanel();
      alignToggleToPanelCorner();
    }
  });

  window.addEventListener('orientationchange', function () {
    if (panel && panel.classList.contains('is-open')) {
      positionPanel();
      alignToggleToPanelCorner();
    }
  });

  // Safety net: avoid stuck scroll lock.
  window.addEventListener('blur', function () {
    if (panel.classList.contains('is-open')) closeReliquaryImmediately(false);
  });

  doc.addEventListener('visibilitychange', function () {
    if (doc.hidden && panel.classList.contains('is-open')) closeReliquaryImmediately(false);
  });

})();
