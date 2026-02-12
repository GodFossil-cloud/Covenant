/*! Covenant Panel Coordinator v0.1.1 (Stacking + Shared Scroll Lock + Lexicon Lock Pulse)

   v0.1.1: replace fixed-body scroll lock with overflow-based lock (prevents footer dock notch micro-jump)
*/
(function () {
  'use strict';

  if (window.COVENANT_PANELS) return;

  var doc = document;
  var root = doc.documentElement;

  function byId(id) { return doc.getElementById(id); }

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

  var PANELS = {
    lexicon: {
      id: 'lexicon',
      panel: function () { return byId('lexiconPanel'); },
      overlay: function () { return byId('lexiconOverlay'); },
      toggle: function () { return byId('lexiconToggle'); }
    },
    toc: {
      id: 'toc',
      panel: function () { return byId('tocPanel'); },
      overlay: function () { return byId('tocOverlay'); },
      toggle: function () { return byId('tocToggle'); }
    },
    reliquary: {
      id: 'reliquary',
      panel: function () { return byId('reliquaryPanel'); },
      overlay: function () { return byId('reliquaryOverlay'); },
      toggle: function () { return byId('mirrorToggle'); }
    }
  };

  var open = { lexicon: false, toc: false, reliquary: false };
  var stack = [];

  // ---------------------------
  // Shared scroll lock
  // ---------------------------

  var scrollLockCount = 0;
  var scrollLockY = 0;

  // Preserve prior overflow/padding so we don't clobber page-authored styles.
  var prevHtmlOverflow = '';
  var prevBodyOverflow = '';
  var prevBodyPaddingRight = '';
  var scrollStylesApplied = false;

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

  function enableIOSTouchScrollLock() {
    if (iosTouchMoveBlocker) return;

    iosTouchMoveBlocker = function (e) {
      if (!stack.length) return;
      var topId = stack[stack.length - 1];
      var top = PANELS[topId];
      var topPanel = top ? top.panel() : null;
      if (!topPanel || !topPanel.classList || !topPanel.classList.contains('is-open')) return;

      // Allow scrolling inside any panel body; covered panels are inert anyway.
      if (closestSafe(e.target, '.toc-panel-body, .reliquary-panel-body, .lexicon-panel-body')) return;

      if (e && e.cancelable) e.preventDefault();
    };

    doc.addEventListener('touchmove', iosTouchMoveBlocker, IOS_TOUCHMOVE_OPTS);
  }

  function disableIOSTouchScrollLock() {
    if (!iosTouchMoveBlocker) return;
    doc.removeEventListener('touchmove', iosTouchMoveBlocker, IOS_TOUCHMOVE_OPTS);
    iosTouchMoveBlocker = null;
  }

  function computeScrollbarWidth() {
    try {
      var docEl = doc.documentElement;
      if (!docEl) return 0;
      var w = (window.innerWidth || 0) - (docEl.clientWidth || 0);
      if (!w || w < 0) return 0;
      return Math.round(w);
    } catch (err) {
      return 0;
    }
  }

  function uiStackAlreadyLocked() {
    try {
      return !!(root && root.classList && root.classList.contains('ui-stack-scroll-lock'));
    } catch (err) {
      return false;
    }
  }

  function applyOverflowLockStyles() {
    if (scrollStylesApplied) return;

    try {
      prevHtmlOverflow = root ? (root.style.overflow || '') : '';
      prevBodyOverflow = doc.body ? (doc.body.style.overflow || '') : '';
      prevBodyPaddingRight = doc.body ? (doc.body.style.paddingRight || '') : '';
    } catch (err0) {
      prevHtmlOverflow = '';
      prevBodyOverflow = '';
      prevBodyPaddingRight = '';
    }

    try {
      if (root) root.style.overflow = 'hidden';
      if (doc.body) doc.body.style.overflow = 'hidden';

      // Preserve layout width when hiding the scrollbar (desktop).
      var sw = computeScrollbarWidth();
      if (sw && doc.body) {
        doc.body.style.paddingRight = sw + 'px';
      }
    } catch (err1) {}

    scrollStylesApplied = true;
  }

  function restoreOverflowLockStyles() {
    if (!scrollStylesApplied) return;

    try {
      if (root) root.style.overflow = prevHtmlOverflow || '';
      if (doc.body) {
        doc.body.style.overflow = prevBodyOverflow || '';
        doc.body.style.paddingRight = prevBodyPaddingRight || '';
      }
    } catch (err1) {}

    prevHtmlOverflow = '';
    prevBodyOverflow = '';
    prevBodyPaddingRight = '';
    scrollStylesApplied = false;
  }

  function lockScroll() {
    if (scrollLockCount === 0) {
      // Round to avoid fractional scrollY being fed back into layout (micro-jump risk).
      scrollLockY = Math.round(window.scrollY || window.pageYOffset || 0);
      root.classList.add('covenant-scroll-lock');

      // If ui-stack is already handling scroll lock, do not touch overflow/padding.
      if (!uiStackAlreadyLocked()) {
        applyOverflowLockStyles();
      }

      // iOS needs the touchmove blocker even when overflow is hidden.
      if (isIOS) enableIOSTouchScrollLock();
    }

    scrollLockCount += 1;
  }

  function unlockScroll() {
    if (scrollLockCount <= 0) return;
    scrollLockCount -= 1;
    if (scrollLockCount > 0) return;

    root.classList.remove('covenant-scroll-lock');

    if (isIOS) {
      disableIOSTouchScrollLock();
    }

    // Only restore styles if we applied them.
    // If ui-stack owns the lock, it will restore when the last surface closes.
    restoreOverflowLockStyles();

    try {
      // Maintain the pre-lock scroll position (harmless if nothing moved).
      window.scrollTo(0, scrollLockY);
    } catch (err3) {}
  }

  // ---------------------------
  // Stack + layering
  // ---------------------------

  function removeFromStack(id) {
    for (var i = stack.length - 1; i >= 0; i--) {
      if (stack[i] === id) {
        stack.splice(i, 1);
        break;
      }
    }
  }

  function setCovered(id, covered) {
    var p = PANELS[id];
    if (!p) return;

    var panelEl = p.panel();
    var overlayEl = p.overlay();

    if (panelEl) {
      panelEl.setAttribute('data-covenant-covered', covered ? 'true' : 'false');
      if (covered) panelEl.setAttribute('aria-hidden', 'true');
      else if (open[id]) panelEl.setAttribute('aria-hidden', 'false');
    }

    if (overlayEl) {
      overlayEl.setAttribute('data-covenant-covered', covered ? 'true' : 'false');
      if (covered) overlayEl.setAttribute('aria-hidden', 'true');
      else if (open[id]) overlayEl.setAttribute('aria-hidden', 'false');
    }
  }

  function applyZ() {
    // Keep below dock (which lifts to ~1600) but above baseline page.
    var base = 1400;
    var step = 20;

    // Clear first.
    var ids = ['lexicon', 'toc', 'reliquary'];
    for (var j = 0; j < ids.length; j++) {
      var item = PANELS[ids[j]];
      if (!item) continue;
      var pe = item.panel();
      var oe = item.overlay();
      if (pe) pe.style.zIndex = '';
      if (oe) oe.style.zIndex = '';
    }

    for (var i = 0; i < stack.length; i++) {
      var id = stack[i];
      var p = PANELS[id];
      if (!p) continue;

      var panelEl = p.panel();
      var overlayEl = p.overlay();

      var z = base + (i * step);
      if (overlayEl) overlayEl.style.zIndex = String(z);
      if (panelEl) panelEl.style.zIndex = String(z + 1);
    }
  }

  function updateCoverage() {
    var top = stack.length ? stack[stack.length - 1] : null;

    if (open.lexicon) setCovered('lexicon', top && top !== 'lexicon');
    if (open.toc) setCovered('toc', top && top !== 'toc');
    if (open.reliquary) setCovered('reliquary', top && top !== 'reliquary');

    applyZ();
  }

  function isTop(id) {
    return !!(stack.length && stack[stack.length - 1] === id);
  }

  function requestOpen(id) {
    // Lexicon cannot open if either ToC or Reliquary is already open while Lexicon is closed.
    if (id === 'lexicon' && !open.lexicon && (open.toc || open.reliquary)) return false;
    return true;
  }

  function notifyOpen(id) {
    if (!id || !PANELS[id]) return;
    open[id] = true;
    removeFromStack(id);
    stack.push(id);
    updateCoverage();
  }

  function notifyClose(id) {
    if (!id || !PANELS[id]) return;
    open[id] = false;
    removeFromStack(id);
    updateCoverage();
  }

  // ---------------------------
  // Lexicon locked pulse
  // ---------------------------

  function pulseLexiconLock() {
    var t = PANELS.lexicon.toggle();
    if (!t || !t.classList) return;

    t.classList.remove('is-lexicon-locked-pulse');
    // force reflow to restart animation
    void t.offsetWidth;
    t.classList.add('is-lexicon-locked-pulse');

    // Cleanup in case animationend doesn't fire.
    window.setTimeout(function () {
      if (t && t.classList) t.classList.remove('is-lexicon-locked-pulse');
    }, 700);
  }

  // Capture-phase guard: block lexicon open attempt when locked.
  doc.addEventListener('click', function (e) {
    var lexBtn = closestSafe(e.target, '#lexiconToggle');
    if (!lexBtn) return;

    if (!requestOpen('lexicon')) {
      stopEvent(e);
      pulseLexiconLock();
    }
  }, true);

  // Expose API.
  window.COVENANT_PANELS = {
    isTop: isTop,
    requestOpen: requestOpen,
    notifyOpen: notifyOpen,
    notifyClose: notifyClose,
    lockScroll: lockScroll,
    unlockScroll: unlockScroll,
    pulseLexiconLock: pulseLexiconLock
  };
})();
