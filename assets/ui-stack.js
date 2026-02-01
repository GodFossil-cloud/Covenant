/*! Covenant UI Stack v0.2.0 */
(function () {
  'use strict';

  // A tiny coordination layer for modal/veil surfaces.
  // This file should remain safe to load even when no panels register with it.

  if (window.COVENANT_UI_STACK) return;

  window.COVENANT_UI_STACK_VERSION = '0.2.0';

  var registry = Object.create(null);
  var order = [];

  // True LIFO open-stack ("topmost" is last).
  // Maintained by noteOpen/noteClose (and bringToFront for migrated callers).
  var openStack = [];

  function now() { return Date.now ? Date.now() : +new Date(); }

  function toId(value) {
    return String(value == null ? '' : value).trim();
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

  function applyStackState() {
    // No-op unless surfaces opt into inert hooks.
    var ids = getOpenIds();
    var topId = ids.length ? ids[ids.length - 1] : '';

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
    var root = document.documentElement;

    var tocPanel = document.getElementById('tocPanel');
    var lexPanel = document.getElementById('lexiconPanel');
    var relPanel = document.getElementById('reliquaryPanel');

    if (tocPanel && tocPanel.classList && tocPanel.classList.contains('is-open')) return true;
    if (lexPanel && lexPanel.classList && lexPanel.classList.contains('is-open')) return true;
    if (relPanel && relPanel.classList && relPanel.classList.contains('is-open')) return true;

    // Fallbacks: scroll-lock/open state classes.
    if (root && root.classList) {
      if (root.classList.contains('toc-open') || root.classList.contains('toc-scroll-lock')) return true;
      if (root.classList.contains('lexicon-scroll-lock')) return true;
      if (root.classList.contains('reliquary-open') || root.classList.contains('reliquary-scroll-lock')) return true;
    }

    return false;
  }

  function requestCloseAllByDom() {
    var root = document.documentElement;

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
      if ((lexPanel && lexPanel.classList && lexPanel.classList.contains('is-open')) || (root && root.classList && root.classList.contains('lexicon-scroll-lock'))) {
        if (lexToggle && lexToggle.click) lexToggle.click();
      }
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

    // New primitives (used by the panel stacking migration).
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
