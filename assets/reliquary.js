/*! Covenant Reliquary UI v0.3.39 (dock tab tap flash: is-tap-opening / is-tap-closing) */
(function () {
  'use strict';

  window.COVENANT_RELIQUARY_VERSION = '0.3.39';

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

  // Dock tab tap flash (glyph aura).
  var mirrorTapClassTimer = null;
  var MIRROR_TAP_OPEN_MS = 280;
  var MIRROR_TAP_CLOSE_MS = 240;

  function clearMirrorTapClasses() {
    if (!toggle || !toggle.classList) return;
    toggle.classList.remove('is-tap-opening', 'is-tap-closing');
  }

  function scheduleMirrorTapClassClear(ms) {
    if (mirrorTapClassTimer) {
      clearTimeout(mirrorTapClassTimer);
      mirrorTapClassTimer = null;
    }

    mirrorTapClassTimer = setTimeout(function () {
      mirrorTapClassTimer = null;
      clearMirrorTapClasses();
    }, Math.max(0, ms || 0) + 80);
  }

  function markMirrorTapOpening() {
    if (!toggle || !toggle.classList) return;
    clearMirrorTapClasses();
    toggle.classList.add('is-tap-opening');
    scheduleMirrorTapClassClear(MIRROR_TAP_OPEN_MS);
  }

  function markMirrorTapClosing() {
    if (!toggle || !toggle.classList) return;
    clearMirrorTapClasses();
    toggle.classList.add('is-tap-closing');
    scheduleMirrorTapClassClear(MIRROR_TAP_CLOSE_MS);
  }

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

  function setMirrorTabDragOffset(px) {
    if (!toggle) return;
    toggle.style.setProperty('--mirror-tab-drag-y', px + 'px');
  }

  function clearMirrorTabDragOffset() {
    if (!toggle) return;

    // Pin carry to 0px (do not remove). Removing the property can cause a last-frame
    // compositor re-evaluation where the tab briefly re-targets its transform.
    toggle.style.setProperty('--mirror-tab-drag-y', '0px');
  }

  // ... (unchanged code omitted for brevity in this patch) ...

  function openReliquaryTap() {
    if (tapAnimating) return;

    if (window.__COVENANT_RELIQUARY_DRAG_JUST_HAPPENED) {
      window.__COVENANT_RELIQUARY_DRAG_JUST_HAPPENED = false;
      return;
    }

    markMirrorTapOpening();

    // Clear any residual inline snap styles.
    panel.style.transform = '';
    panel.style.opacity = '';
    panel.style.transition = '';
    overlay.style.opacity = '';
    overlay.style.transition = '';

    // Defensive cleanup: if a pointer-cancel left the drag class behind, it can suppress transitions.
    try { toggle.classList.remove('is-reliquary-dragging'); } catch (err0) {}

    openReliquaryImmediately();

    var snapMs = getSnapMs();
    var snapEase = getSnapEase();
    var openLift = readCssNumberVar('--reliquary-open-lift') || 0;

    tapAnimating = true;
    root.classList.add('reliquary-opening');

    positionPanel();

    // (rest unchanged)

    // Tap-open can start from a slightly sunk closed position for the sheet, but the dock tab should
    // remain seated and never carry below its true rest position.
    var closedY = computePanelClosedY(true);
    var closedYForTab = computePanelClosedY(false);

    panel.style.transition = 'none';
    overlay.style.transition = 'none';

    panel.style.opacity = '0';
    overlay.style.opacity = '0';

    setPanelTranslateY(openLift);

    panel.style.opacity = '1';
    setPanelTranslateY(closedY);

    // Seed tab at closed, then weld it upward with the same snap timing.
    setMirrorTabDragOffset(0);

    raf(function () {
      panel.style.transition = 'transform ' + snapMs + 'ms ' + snapEase + ', opacity ' + snapMs + 'ms ' + snapEase;
      overlay.style.transition = 'opacity ' + snapMs + 'ms ' + snapEase;

      setPanelTranslateY(openLift);
      overlay.style.opacity = '1';

      setMirrorTabDragOffset(openLift - closedYForTab);

      setTimeout(function () {
        panel.style.transform = '';
        panel.style.opacity = '';
        panel.style.transition = '';

        overlay.style.opacity = '';
        overlay.style.transition = '';

        root.classList.remove('reliquary-opening');
        tapAnimating = false;

        clearMirrorTabTransitionOverride();

        setTimeout(focusIntoPanel, 0);
      }, snapMs + 50);
    });
  }

  function closeReliquaryTap(restoreFocus) {
    if (tapAnimating) return;

    markMirrorTapClosing();

    disableFocusTrap();

    root.classList.remove('reliquary-opening');
    root.classList.add('reliquary-closing');
    root.classList.remove('reliquary-dock-settling');

    positionPanel();

    var snapMs = getSnapMs();
    var snapEase = getSnapEase();
    var openLift = readCssNumberVar('--reliquary-open-lift') || 0;

    tapAnimating = true;

    // Tap-close should return to the true seated closed position (no sink below dock).
    var closedY = computePanelClosedY(false);
    var closedYForTab = closedY;

    panel.style.transition = 'none';
    overlay.style.transition = 'none';

    panel.style.opacity = '1';
    overlay.style.opacity = '1';

    setPanelTranslateY(openLift);

    // Ensure the tab begins in its open welded position.
    setMirrorTabDragOffset(openLift - closedYForTab);

    raf(function () {
      panel.style.transition = 'transform ' + snapMs + 'ms ' + snapEase + ', opacity ' + snapMs + 'ms ' + snapEase;
      overlay.style.transition = 'opacity ' + snapMs + 'ms ' + snapEase;

      setPanelTranslateY(closedY);
      overlay.style.opacity = '0';

      // Tab returns to its dock seat.
      setMirrorTabDragOffset(0);

      setTimeout(function () {
        // (rest unchanged)
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

  doc.addEventListener('visibilitychange', function (e) {
    if (!doc.hidden) return;
    if (!isTopmostForDismiss()) return;
    if (panel.classList.contains('is-open')) closeReliquaryImmediately(false);
  });

})();
