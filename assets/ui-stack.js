/*! Covenant UI Stack v0.3.2 */
(function () {
  'use strict';

  // A tiny coordination layer for modal/veil surfaces.
  // This file should remain safe to load even when no panels register with it.

  if (window.COVENANT_UI_STACK) return;

  window.COVENANT_UI_STACK_VERSION = '0.3.2';

  var registry = Object.create(null);
  var order = [];

  // True LIFO open-stack ("topmost" is last).
  // Maintained by noteOpen/noteClose (and bringToFront).
  var openStack = [];

  // Shared scroll lock (stack-derived) — enabled only for entries that opt in.
  var scrollLocked = false;
  var scrollLockY = 0;

  // Lexicon gating: Lexicon may open only if it is opened first.
  // If Lexicon is closed and ToC or Reliquary is open, the Lexicon toggle is "locked":
  // interactions trigger a single subtle "breath" animation and do not open Lexicon.
  var lexiconLocked = false;
  var lexiconBreathAnimating = false;
  var lexiconBreathAnim = null;
  var lastLexiconBreathAt = 0;

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

  function now() { return Date.now ? Date.now() : +new Date(); }

  function toId(value) {
    return String(value == null ? '' : value).trim();
  }

  function closestSafe(target, selector) {
    if (!target) return null;
    var el = (target.nodeType === 1) ? target : target.parentElement;
    if (!el || !el.closest) return null;
    return el.closest(selector);
  }

  function indexOfId(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i] === id) return i;
    }
    return -1;
  }

  function removeId(list, id) {
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i] === id) list.splice(i, 1);
    }
  }

  function pushToTop(list, id) {
    removeId(list, id);
    list.push(id);
  }

  function sortOpenEntries(list) {
    list.sort(function (a, b) {
      // Higher priority first.
      var pa = (a && typeof a.priority === 'number') ? a.priority : 0;
      var pb = (b && typeof b.priority === 'number') ? b.priority : 0;
      if (pa !== pb) return pb - pa;

      // Older opens first (stable).
      var ta = (a && typeof a.openedAt === 'number') ? a.openedAt : 0;
      var tb = (b && typeof b.openedAt === 'number') ? b.openedAt : 0;
      return ta - tb;
    });
    return list;
  }

  function isEntryOpen(entry) {
    try {
      if (!entry) return false;
      if (typeof entry.isOpen === 'function') return !!entry.isOpen();
      return !!entry.open;
    } catch (err) {
      return false;
    }
  }

  function getEntry(id) {
    id = toId(id);
    return id ? registry[id] : null;
  }

  function getOpenEntries() {
    var open = [];
    for (var i = 0; i < order.length; i++) {
      var id = order[i];
      var entry = registry[id];
      if (!entry) continue;
      if (isEntryOpen(entry)) open.push(entry);
    }
    return sortOpenEntries(open);
  }

  function cleanOpenStack() {
    for (var i = openStack.length - 1; i >= 0; i--) {
      var id = openStack[i];
      var entry = registry[id];
      if (!entry || !isEntryOpen(entry)) openStack.splice(i, 1);
    }
  }

  function syncOpenStackForMissingOpenEntries() {
    // Best-effort: if something is open but never called noteOpen (or loaded before ui-stack),
    // append it in openedAt order so stack operations still behave predictably.
    var open = getOpenEntries();
    for (var i = 0; i < open.length; i++) {
      var id = open[i].id;
      if (indexOfId(openStack, id) === -1) openStack.push(id);
    }
  }

  function getOpenIds() {
    cleanOpenStack();
    syncOpenStackForMissingOpenEntries();
    return openStack.slice();
  }

  function getTopOpenId() {
    var ids = getOpenIds();
    return ids.length ? ids[ids.length - 1] : '';
  }

  function entryAllowsScroll(entry, target) {
    try {
      if (!entry) return false;
      if (entry.allowScrollEl && entry.allowScrollEl.contains && entry.allowScrollEl.contains(target)) return true;
      if (entry.allowScrollSelector) return !!closestSafe(target, entry.allowScrollSelector);
    } catch (err) {}
    return false;
  }

  function enableIOSTouchScrollLock() {
    if (iosTouchMoveBlocker) return;

    iosTouchMoveBlocker = function (e) {
      if (!scrollLocked) return;

      var stackIds = getOpenIds();
      var topId = stackIds.length ? stackIds[stackIds.length - 1] : '';
      var entry = topId ? registry[topId] : null;

      if (entryAllowsScroll(entry, e && e.target)) return;

      if (e && e.cancelable) e.preventDefault();
    };

    document.addEventListener('touchmove', iosTouchMoveBlocker, IOS_TOUCHMOVE_OPTS);
  }

  function disableIOSTouchScrollLock() {
    if (!iosTouchMoveBlocker) return;
    document.removeEventListener('touchmove', iosTouchMoveBlocker, IOS_TOUCHMOVE_OPTS);
    iosTouchMoveBlocker = null;
  }

  function lockBodyScroll() {
    if (scrollLocked) return;

    scrollLocked = true;
    scrollLockY = window.scrollY || window.pageYOffset || 0;

    try { document.documentElement.classList.add('ui-stack-scroll-lock'); } catch (err1) {}
    try {
      document.body.classList.add('ui-stack-scroll-lock');
      document.body.style.position = 'fixed';
      document.body.style.top = (-scrollLockY) + 'px';
      document.body.style.width = '100%';
    } catch (err2) {}

    if (isIOS) enableIOSTouchScrollLock();
  }

  function unlockBodyScroll() {
    if (!scrollLocked) return;

    scrollLocked = false;

    try { document.documentElement.classList.remove('ui-stack-scroll-lock'); } catch (err1) {}

    try {
      document.body.classList.remove('ui-stack-scroll-lock');
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
    } catch (err2) {}

    if (isIOS) disableIOSTouchScrollLock();

    try { window.scrollTo(0, scrollLockY); } catch (err3) {}
    scrollLockY = 0;
  }

  function shouldUseSharedScrollLock(ids) {
    if (!ids || !ids.length) return false;

    for (var i = 0; i < ids.length; i++) {
      var entry = registry[ids[i]];
      if (!entry) continue;
      if (entry.useSharedScrollLock) return true;
    }

    return false;
  }

  function syncScrollLockFromIds(ids) {
    // If no open surface opts in, the shared lock should be off.
    if (ids && ids.length && shouldUseSharedScrollLock(ids)) {
      lockBodyScroll();
    } else {
      unlockBodyScroll();
    }
  }

  function isPanelOpenByDomId(panelId) {
    var el = document.getElementById(panelId);
    return !!(el && el.classList && el.classList.contains('is-open'));
  }

  function computeLexiconLocked() {
    var lexOpen = isPanelOpenByDomId('lexiconPanel');
    if (lexOpen) return false;

    // Lexicon is locked if it is closed and either ToC or Reliquary is currently open.
    var tocOpen = isPanelOpenByDomId('tocPanel');
    var relOpen = isPanelOpenByDomId('reliquaryPanel');

    return !!(tocOpen || relOpen);
  }

  function applyLexiconGateState() {
    var toggle = document.getElementById('lexiconToggle');
    if (!toggle) return;

    var locked = computeLexiconLocked();

    if (locked === lexiconLocked) return;
    lexiconLocked = locked;

    toggle.setAttribute('data-lexicon-locked', locked ? 'true' : 'false');
    // Keep it focusable/clickable, but signal "locked" to AT.
    toggle.setAttribute('aria-disabled', locked ? 'true' : 'false');

    if (toggle.classList && toggle.classList.toggle) {
      toggle.classList.toggle('is-lexicon-locked', locked);
    }
  }

  function triggerLexiconLockedBreath(toggle) {
    if (!toggle) return;

    // Ensure it feels like a single breath (ignore spam).
    var t = now();
    if (lexiconBreathAnimating && (t - lastLexiconBreathAt) < 700) return;
    lastLexiconBreathAt = t;

    try {
      if (lexiconBreathAnim && lexiconBreathAnim.cancel) {
        lexiconBreathAnim.cancel();
      }

      if (toggle.animate) {
        lexiconBreathAnimating = true;

        var GOLD = 'rgba(218, 184, 86, 0.34)';
        var GOLD_SOFT = 'rgba(218, 184, 86, 0.00)';

        lexiconBreathAnim = toggle.animate([
          {
            opacity: 1,
            transform: 'translateY(0px) scale(1)',
            boxShadow: '0 0 0 0 ' + GOLD_SOFT,
            filter: 'drop-shadow(0 0 0 ' + GOLD_SOFT + ')'
          },
          {
            opacity: 1,
            transform: 'translateY(-1px) scale(1.03)',
            boxShadow: '0 0 14px 3px ' + GOLD,
            filter: 'drop-shadow(0 0 8px ' + GOLD + ')'
          },
          {
            opacity: 1,
            transform: 'translateY(0px) scale(1)',
            boxShadow: '0 0 0 0 ' + GOLD_SOFT,
            filter: 'drop-shadow(0 0 0 ' + GOLD_SOFT + ')'
          }
        ], {
          duration: 680,
          easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)'
        });

        lexiconBreathAnim.onfinish = function () {
          lexiconBreathAnimating = false;
          lexiconBreathAnim = null;
        };

        lexiconBreathAnim.oncancel = function () {
          lexiconBreathAnimating = false;
          lexiconBreathAnim = null;
        };

        return;
      }
    } catch (err) {
      lexiconBreathAnimating = false;
      lexiconBreathAnim = null;
    }

    // Fallback (no WAAPI): quick inline nudge (still visual-only).
    try {
      lexiconBreathAnimating = true;
      toggle.style.opacity = '1';
      toggle.style.transform = 'translateY(-1px) scale(1.02)';
      toggle.style.boxShadow = '0 0 12px 2px rgba(218, 184, 86, 0.28)';
      setTimeout(function () {
        toggle.style.opacity = '';
        toggle.style.transform = '';
        toggle.style.boxShadow = '';
        lexiconBreathAnimating = false;
      }, 420);
    } catch (err2) {
      lexiconBreathAnimating = false;
    }
  }

  function isPlainPrimaryPointerUp(e) {
    if (!e) return false;
    if (e.defaultPrevented) return false;
    if (e.pointerType === 'mouse' && typeof e.button === 'number' && e.button !== 0) return false;
    return true;
  }

  function isPlainPrimaryPointerDown(e) {
    if (!e) return false;
    if (e.defaultPrevented) return false;
    if (e.pointerType === 'mouse' && typeof e.button === 'number' && e.button !== 0) return false;
    return true;
  }

  (function wireLexiconGateInterceptors() {
    function isLexiconToggleTarget(t) {
      var toggle = document.getElementById('lexiconToggle');
      if (!toggle) return false;
      if (t === toggle) return true;
      if (t && t.closest) return !!t.closest('#lexiconToggle');
      return false;
    }

    function intercept(e) {
      if (!lexiconLocked) return;
      if (!isLexiconToggleTarget(e && e.target)) return;

      // Must not open Lexicon, and must not affect the current topmost stack.
      try {
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      } catch (err) {}

      triggerLexiconLockedBreath(document.getElementById('lexiconToggle'));
    }

    // Critical: block drag-to-open on mobile by intercepting pointerdown before lexicon.js begins seal-drag.
    document.addEventListener('pointerdown', function (e) {
      if (!isPlainPrimaryPointerDown(e)) return;
      intercept(e);
    }, true);

    document.addEventListener('pointerup', function (e) {
      if (!isPlainPrimaryPointerUp(e)) return;
      intercept(e);
    }, true);

    document.addEventListener('click', function (e) {
      intercept(e);
    }, true);

    document.addEventListener('keydown', function (e) {
      if (!lexiconLocked) return;
      if (!isLexiconToggleTarget(e && e.target)) return;

      var k = e && e.key;
      if (k !== 'Enter' && k !== ' ') return;

      intercept(e);
    }, true);
  })();

  function applyStackState() {
    // No-op unless surfaces opt into inert hooks.
    var ids = getOpenIds();
    var topId = ids.length ? ids[ids.length - 1] : '';

    // Assign explicit z-index in true LIFO order (lowest open = back, highest open = front).
    // Entries opt in via setZIndex(zBase).
    // IMPORTANT: keep the UI stack below the footer dock (the dock lifts to ~1600 during veil motion/open).
    // The dock must remain sovereign; panels/scrims should never overlay it.
    var Z_BASE = 1500;
    var Z_STEP = 10;

    for (var zi = 0; zi < ids.length; zi++) {
      var zid = ids[zi];
      var zEntry = registry[zid];
      if (!zEntry) continue;

      try {
        if (typeof zEntry.setZIndex === 'function') {
          zEntry.setZIndex(Z_BASE + (zi * Z_STEP));
        }
      } catch (errZ) {}
    }

    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var entry = registry[id];
      if (!entry) continue;

      var isTop = (id === topId);
      try {
        if (typeof entry.setInert === 'function') entry.setInert(!isTop);
      } catch (err1) {}

      try {
        if (typeof entry.setActive === 'function') entry.setActive(!!isTop);
      } catch (err2) {}
    }

    applyLexiconGateState();
    syncScrollLockFromIds(ids);
  }

  function requestClose(entry) {
    if (!entry) return false;

    try {
      if (typeof entry.requestClose === 'function') {
        entry.requestClose();
        return true;
      }

      if (typeof entry.close === 'function') {
        entry.close();
        return true;
      }
    } catch (err) {}

    // Back-compat escape hatch: allow wiring via a click() on a known toggle.
    try {
      if (entry.toggle && typeof entry.toggle.click === 'function') {
        entry.toggle.click();
        return true;
      }
    } catch (err2) {}

    return false;
  }

  function bringToFront(id) {
    id = toId(id);
    if (!id) return;

    var entry = getEntry(id);
    if (!entry) return;
    if (!isEntryOpen(entry)) return;

    entry.openedAt = now();
    entry.open = true;

    pushToTop(openStack, id);
    applyStackState();
  }

  // ---------------------------
  // Navigation close-all helper
  // ---------------------------

  function readCssNumberVar(varName, fallback) {
    try {
      var raw = getComputedStyle(document.documentElement).getPropertyValue(varName);
      var v = parseFloat(String(raw || '').trim());
      return isNaN(v) ? fallback : v;
    } catch (err) {
      return fallback;
    }
  }

  function isPanelOpenByDom() {
    var tocPanel = document.getElementById('tocPanel');
    var lexPanel = document.getElementById('lexiconPanel');
    var relPanel = document.getElementById('reliquaryPanel');

    if (tocPanel && tocPanel.classList && tocPanel.classList.contains('is-open')) return true;
    if (lexPanel && lexPanel.classList && lexPanel.classList.contains('is-open')) return true;
    if (relPanel && relPanel.classList && relPanel.classList.contains('is-open')) return true;

    return false;
  }

  function requestCloseAllByDom() {
    var tocPanel = document.getElementById('tocPanel');
    var lexPanel = document.getElementById('lexiconPanel');
    var relPanel = document.getElementById('reliquaryPanel');

    var tocToggle = document.getElementById('tocToggle');
    var lexToggle = document.getElementById('lexiconToggle');
    var relToggle = document.getElementById('mirrorToggle');

    try {
      if (tocPanel && tocPanel.classList && tocPanel.classList.contains('is-open') && tocToggle && tocToggle.click) tocToggle.click();
    } catch (err1) {}

    try {
      if (relPanel && relPanel.classList && relPanel.classList.contains('is-open') && relToggle && relToggle.click) relToggle.click();
    } catch (err2) {}

    try {
      if (lexPanel && lexPanel.classList && lexPanel.classList.contains('is-open') && lexToggle && lexToggle.click) lexToggle.click();
    } catch (err3) {}
  }

  function requestCloseAllRegistered() {
    var open = getOpenEntries();
    for (var i = 0; i < open.length; i++) {
      requestClose(open[i]);
    }
  }

  function requestCloseAll() {
    // Best effort: if nothing is registered, still close known panels.
    requestCloseAllRegistered();
    requestCloseAllByDom();
  }

  function getCloseAllDelayMs() {
    var toc = readCssNumberVar('--toc-snap-duration', 420);
    var rel = readCssNumberVar('--reliquary-snap-duration', 420);
    var lex = readCssNumberVar('--lexicon-snap-duration', 420);

    var m = Math.max(toc || 0, rel || 0, lex || 0);
    return Math.max(220, m + 90);
  }

  function isPlainLeftClick(e) {
    if (!e) return false;
    if (e.defaultPrevented) return false;
    if (typeof e.button === 'number' && e.button !== 0) return false;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
    return true;
  }

  (function wireDockNavCloseAll() {
    document.addEventListener('click', function (e) {
      if (!isPlainLeftClick(e)) return;

      var t = e.target;
      if (!t) return;

      // Support click on inner spans/icons.
      var link = (t.closest && t.closest('a.nav-prev, a.nav-next')) ? t.closest('a.nav-prev, a.nav-next') : null;
      if (!link) return;

      var href = link.getAttribute('href');
      if (!href) return;

      if (!isPanelOpenByDom()) return;

      e.preventDefault();
      e.stopPropagation();

      requestCloseAll();

      setTimeout(function () {
        window.location.href = href;
      }, getCloseAllDelayMs());

    }, true);
  })();

  // ---------------------------
  // Public API
  // ---------------------------

  window.COVENANT_UI_STACK = {
    register: function (id, opts) {
      // Back-compat: allow register({ id, ... }) as well as register(id, opts).
      if (id && typeof id === 'object') {
        opts = id;
        id = opts ? opts.id : '';
      }

      id = toId(id);
      if (!id) return;

      var existing = registry[id];
      if (existing) {
        // Shallow update.
        for (var k in opts) existing[k] = opts[k];
        applyStackState();
        return;
      }

      var entry = opts && typeof opts === 'object' ? opts : {};
      entry.id = id;
      if (typeof entry.priority !== 'number') entry.priority = 0;
      if (typeof entry.openedAt !== 'number') entry.openedAt = 0;

      registry[id] = entry;
      order.push(id);

      // If the surface is already open (late load), fold it into the stack.
      try {
        if (isEntryOpen(entry)) {
          if (entry.openedAt) {
            openStack.push(id);
            cleanOpenStack();
          } else {
            entry.openedAt = now();
            entry.open = true;
            pushToTop(openStack, id);
          }
        }
      } catch (err) {}

      applyStackState();
    },

    unregister: function (id) {
      id = toId(id);
      if (!id || !registry[id]) return;

      delete registry[id];

      for (var i = order.length - 1; i >= 0; i--) {
        if (order[i] === id) order.splice(i, 1);
      }

      removeId(openStack, id);
      applyStackState();
    },

    noteOpened: function (id) {
      var entry = getEntry(id);
      if (!entry) return;
      entry.openedAt = now();
      entry.open = true;

      pushToTop(openStack, entry.id);
      applyStackState();
    },

    noteClosed: function (id) {
      var entry = getEntry(id);
      if (!entry) return;
      entry.open = false;

      removeId(openStack, entry.id);
      applyStackState();
    },

    // Aliases expected by newer callers.
    noteOpen: function (id) {
      window.COVENANT_UI_STACK.noteOpened(id);
    },

    noteClose: function (id) {
      window.COVENANT_UI_STACK.noteClosed(id);
    },

    bringToFront: function (id) {
      bringToFront(id);
    },

    isOpen: function (id) {
      var entry = getEntry(id);
      return !!(entry && isEntryOpen(entry));
    },

    getOpenIds: function () {
      return getOpenIds();
    },

    getTopOpenId: function () {
      return getTopOpenId();
    },

    // Back-compat: retain the legacy view (priority-sorted list).
    getOpen: function () {
      return getOpenEntries().slice();
    },

    // Updated: "top" is the most recently opened/foregrounded surface.
    getTopOpen: function () {
      var id = getTopOpenId();
      return id ? getEntry(id) : null;
    },

    requestExclusive: function (id) {
      // Legacy behavior: close all other open entries.
      id = toId(id);
      if (!id) return;

      var open = getOpenEntries();
      for (var i = 0; i < open.length; i++) {
        if (open[i].id === id) continue;
        requestClose(open[i]);
      }
    },

    requestCloseAll: function () {
      requestCloseAll();
    }
  };
})();
