/*! Covenant Reliquary UI v0.3.30 (Panel-only motion; dock tab parked) */
(function () {
  'use strict';

  window.COVENANT_RELIQUARY_VERSION = '0.3.30';

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

  var raf = window.requestAnimationFrame || function (cb) { return window.setTimeout(function () { cb(Date.now()); }, 16); };

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

  if (!panel || !overlay || !toggle) return;

  // Optional: coordinated UI stack (true surface layering across panels).
  var UI_STACK_ID = 'reliquary';
  var uiRegistered = false;

  function getUIStack() {
    try { return window.COVENANT_UI_STACK; } catch (err) { return null; }
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

  function isTopmostForDismiss() {
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

  function shouldUseLocalScrollLock() {
    var stack = getUIStack();
    return !uiStackReady(stack);
  }

  function registerWithUIStack() {
    if (uiRegistered) return;

    var stack = getUIStack();
    if (!uiStackReady(stack)) return;

    function closeFromStack() {
      if (!panel || !panel.classList || !panel.classList.contains('is-open')) return;

      // Stack-driven closes should be polite (no focus steal), but also robust against mid-animation.
      if (tapAnimating) {
        closeReliquaryImmediately(false);
        return;
      }

      closeReliquaryTap(false);
    }

    try {
      stack.register({
        id: UI_STACK_ID,
        priority: 20,

        // Participate in shared scroll lock.
        useSharedScrollLock: true,
        allowScrollSelector: '#reliquaryPanel .reliquary-panel-body',

        isOpen: function () {
          return !!(panel && panel.classList && panel.classList.contains('is-open'));
        },
        requestClose: closeFromStack,

        setInert: function (isInert) {
          try {
            var asleep = !!isInert;

            if (panel) {
              if ('inert' in panel) panel.inert = asleep;
              panel.style.pointerEvents = asleep ? 'none' : '';
            }

            if (overlay) {
              overlay.style.pointerEvents = asleep ? 'none' : '';
            }
          } catch (err2) {}
        },

        setActive: function (isActive) {
          try {
            if (isActive) enableFocusTrap();
            else disableFocusTrap();
          } catch (err3) {}
        },

        setZIndex: function (baseZ) {
          try {
            if (overlay) overlay.style.zIndex = String(baseZ);
            if (panel) panel.style.zIndex = String(baseZ + 1);
          } catch (err4) {}
        }
      });

      uiRegistered = true;
    } catch (err) {}
  }

  function noteOpen() {
    registerWithUIStack();

    var stack = getUIStack();
    if (!uiStackReady(stack)) return;

    try { stack.noteOpen(UI_STACK_ID); } catch (err) {}
    bringSelfToFront();
  }

  function noteClose() {
    registerWithUIStack();

    var stack = getUIStack();
    if (!uiStackReady(stack)) return;

    try { stack.noteClose(UI_STACK_ID); } catch (err) {}
  }

  registerWithUIStack();

  var focusReturnEl = null;
  var focusTrapEnabled = false;
  var focusTrapHandler = null;

  var scrollLockY = 0;

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
    if (!shouldUseLocalScrollLock()) return;

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
    if (!shouldUseLocalScrollLock()) return;

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
      if (!isTopmostForDismiss()) return;

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

  function getFooterReservedPx() {
    var footer = doc.querySelector('.nav-footer');
    if (footer && footer.getBoundingClientRect) {
      var h = footer.getBoundingClientRect().height || 0;
      if (h > 0) return Math.max(0, Math.round(h));
    }

    var total = readCssNumberVar('--footer-total-height');
    if (!total) {
      total = readCssNumberVar('--footer-height') + readCssNumberVar('--footer-safe');
    }

    return Math.max(0, Math.round(total));
  }

  function positionPanel() {
    if (!panel) return;

    var footerReserved = getFooterReservedPx();
    root.style.setProperty('--reliquary-footer-reserved', footerReserved + 'px');

    var bottom = footerReserved;
    var maxH = Math.max(240, Math.floor(window.innerHeight - bottom));

    panel.style.bottom = bottom + 'px';
    panel.style.maxHeight = maxH + 'px';

    if (isMobileSheet()) {
      panel.style.top = '0px';
      panel.style.setProperty('--reliquary-panel-x', '0px');

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

  function openReliquaryShellForDrag() {
    focusReturnEl = toggle;

    // IMPORTANT: during drag-open we intentionally do NOT set html.reliquary-open yet.
    // That class is reserved for committed-open state so the Lexicon seal can re-enable
    // immediately when a drag-open is cancelled.

    panel.classList.add('is-open');
    overlay.classList.add('is-open');

    panel.setAttribute('aria-hidden', 'false');
    overlay.setAttribute('aria-hidden', 'false');

    toggle.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close Reliquary');

    // During drag-open shell, avoid flipping scroll-lock classes/overflow.
    // On iOS Safari this can manifest as a ~1px fixed dock hop on the first drag frame.
    // We still prevent stray touch scrolling outside the panel body.
    if (isIOS) enableIOSTouchScrollLock();

    noteOpen();
  }

  function openReliquaryImmediately() {
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

    noteOpen();
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

    noteClose();

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

    var snapMs = getSnapMs();
    var snapEase = getSnapEase();
    var openLift = readCssNumberVar('--reliquary-open-lift') || 0;

    tapAnimating = true;
    root.classList.add('reliquary-opening');

    positionPanel();

    var closedY = computePanelClosedY();

    panel.style.transition = 'none';
    overlay.style.transition = 'none';

    panel.style.opacity = '0';
    overlay.style.opacity = '0';

    setPanelTranslateY(openLift);

    panel.style.opacity = '1';
    setPanelTranslateY(closedY);

    raf(function () {
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

    positionPanel();

    var snapMs = getSnapMs();
    var snapEase = getSnapEase();
    var openLift = readCssNumberVar('--reliquary-open-lift') || 0;

    tapAnimating = true;

    var closedY = computePanelClosedY();

    panel.style.transition = 'none';
    overlay.style.transition = 'none';

    panel.style.opacity = '1';
    overlay.style.opacity = '1';

    setPanelTranslateY(openLift);

    raf(function () {
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

        setTimeout(function () {
          root.classList.remove('reliquary-dock-settling');
        }, snapMs + 30);

        toggle.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open Reliquary');

        root.classList.remove('reliquary-open');
        unlockBodyScroll();

        noteClose();

        if (restoreFocus) {
          var target = (focusReturnEl && doc.contains(focusReturnEl)) ? focusReturnEl : toggle;
          if (target && target.focus) target.focus();
        }

        focusReturnEl = null;

        panel.style.transform = 'translateX(var(--reliquary-panel-x, -50%)) translateY(' + closedY + 'px)';

        tapAnimating = false;
      }, snapMs + 50);
    });
  }

  function toggleReliquaryTap() {
    if (tapAnimating) return;

    if (panel && panel.classList.contains('is-open')) {
      if (!isTopmostForDismiss()) {
        bringSelfToFront();
        return;
      }

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

    var panelHBase = 0;
    var openLiftPx = 0;

    var MOVE_SLOP = 2;

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
      var closedOffsetPx = readCssNumberVar('--reliquary-closed-offset') || 0;
      closedY = Math.max(1, panelHBase + closedOffsetPx);
    }

    function applyDragFrame(y, draggingNow) {
      if (draggingNow) y = Math.round(y);

      currentY = y;

      panel.style.transform = 'translateX(var(--reliquary-panel-x, -50%)) translateY(' + y + 'px)';

      var denom = (closedY - openLiftPx);
      if (!denom || denom <= 0) denom = 1;

      var progress = (closedY - y) / denom;
      if (progress < 0) progress = 0;
      if (progress > 1) progress = 1;

      panel.style.opacity = '1';
      overlay.style.opacity = String(progress);

      if (draggingNow) {
        // No tab carry/seat shift: dock tab remains parked.
      }
    }

    function applyOpenStateFromDrag() {
      if (!panel || !overlay) return;

      // Commit full open state (including html.reliquary-open + focus trap).
      openReliquaryImmediately();

      root.classList.remove('reliquary-closing');
      root.classList.remove('reliquary-dock-settling');

      setTimeout(focusIntoPanel, 0);
    }

    function settleDockAfterSnapClose() {
      root.classList.add('reliquary-dock-settling');
      root.classList.remove('reliquary-closing');

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

      noteClose();

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

      positionPanel();

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
      var baseH = panelHBase || closedY || 1;

      if (startWasOpen) {
        var dragDown = currentY - openLiftPx;
        shouldOpen = !(velocity > CLOSE_VELOCITY || dragDown > baseH * CLOSE_RATIO);
      } else {
        var dragUp = closedY - currentY;
        shouldOpen = (velocity < OPEN_VELOCITY || dragUp > baseH * OPEN_RATIO);
      }

      panel.style.transition = 'transform ' + SNAP_MS + 'ms ' + SNAP_EASE + ', opacity ' + SNAP_MS + 'ms ' + SNAP_EASE;
      overlay.style.transition = 'opacity ' + SNAP_MS + 'ms ' + SNAP_EASE;

      if (shouldOpen) {
        applyDragFrame(openLiftPx, false);

        applyOpenStateFromDrag();

        root.classList.remove('reliquary-dragging');
      } else {
        root.classList.remove('reliquary-dragging');

        if (startWasOpen) {
          snapCloseFromOpen();
        } else {
          var cancelTargetY = closedY + CANCEL_OPEN_SINK_PX;
          applyDragFrame(cancelTargetY, false);
        }
      }

      setTimeout(function () {
        if (shouldOpen) {
          panel.style.transform = '';
          panel.style.opacity = '';
          panel.style.transition = '';

          overlay.style.opacity = '';
          overlay.style.transition = '';

          root.classList.remove('reliquary-opening');
        } else if (!startWasOpen) {
          panel.style.opacity = '0';
          overlay.style.opacity = '0';
          panel.style.transition = '';
          overlay.style.transition = '';

          root.classList.add('reliquary-dock-settling');

          raf(function () {
            raf(function () {
              root.classList.remove('reliquary-opening');
            });
          });

          setTimeout(function () {
            root.classList.remove('reliquary-dock-settling');
          }, SNAP_MS + 80);

          closeReliquaryImmediately(false);
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

      root.classList.add('reliquary-dragging');

      if (startWasOpen) {
        root.classList.add('reliquary-closing');
        root.classList.remove('reliquary-opening');
        root.classList.remove('reliquary-dock-settling');
      }

      positionPanel();
      computeOpenLift();

      if (!startWasOpen) {
        root.classList.remove('reliquary-closing');
        root.classList.add('reliquary-opening');
        root.classList.remove('reliquary-dock-settling');

        openReliquaryShellForDrag();
      }

      computeClosedY();

      currentY = startWasOpen ? openLiftPx : closedY;

      panel.classList.add('is-dragging');
      toggle.classList.add('is-reliquary-dragging');

      panel.style.transition = 'none';
      overlay.style.transition = 'none';

      panel.style.transform = 'translateX(var(--reliquary-panel-x, -50%)) translateY(' + currentY + 'px)';

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
      panel.classList.remove('is-dragging');
      toggle.classList.remove('is-reliquary-dragging');

      if (moved) {
        window.__COVENANT_RELIQUARY_DRAG_JUST_HAPPENED = true;
        setTimeout(function () { window.__COVENANT_RELIQUARY_DRAG_JUST_HAPPENED = false; }, 300);
        snap();
      } else {
        root.classList.remove('reliquary-dragging');
        if (startWasOpen) root.classList.remove('reliquary-closing');
        else root.classList.remove('reliquary-opening');
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
    if (!isTopmostForDismiss()) return;
    if (panel.classList.contains('is-open')) closeReliquaryTap(true);
  });

  doc.addEventListener('keydown', function (e) {
    if (!e || e.key !== 'Escape') return;
    if (!isTopmostForDismiss()) return;
    if (panel.classList.contains('is-open')) closeReliquaryTap(true);
  });

  function onViewportChange() {
    if (panel && panel.classList.contains('is-open')) {
      positionPanel();
    }
  }

  window.addEventListener('resize', onViewportChange);
  window.addEventListener('orientationchange', onViewportChange);

  window.addEventListener('blur', function () {
    if (!isTopmostForDismiss()) return;
    if (panel.classList.contains('is-open')) closeReliquaryImmediately(false);
  });

  doc.addEventListener('visibilitychange', function () {
    if (!doc.hidden) return;
    if (!isTopmostForDismiss()) return;
    if (panel.classList.contains('is-open')) closeReliquaryImmediately(false);
  });

})();
