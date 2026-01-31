/*! Covenant UI Stack v0.1.0 */
(function () {
  'use strict';

  // A tiny coordination layer for modal/veil surfaces.
  // This commit is intentionally non-invasive: nothing calls into this yet.

  if (window.COVENANT_UI_STACK) return;

  window.COVENANT_UI_STACK_VERSION = '0.1.0';

  var registry = Object.create(null);
  var order = [];

  function now() { return Date.now ? Date.now() : +new Date(); }

  function toId(value) {
    return String(value == null ? '' : value).trim();
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

  function requestClose(entry) {
    if (!entry) return false;

    try {
      if (typeof entry.requestClose === 'function') {
        entry.requestClose();
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

  window.COVENANT_UI_STACK = {
    register: function (id, opts) {
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
    },

    unregister: function (id) {
      id = toId(id);
      if (!id || !registry[id]) return;

      delete registry[id];

      for (var i = order.length - 1; i >= 0; i--) {
        if (order[i] === id) order.splice(i, 1);
      }
    },

    noteOpened: function (id) {
      var entry = getEntry(id);
      if (!entry) return;
      entry.openedAt = now();
      entry.open = true;
    },

    noteClosed: function (id) {
      var entry = getEntry(id);
      if (!entry) return;
      entry.open = false;
    },

    getOpen: function () {
      return getOpenEntries().slice();
    },

    getTopOpen: function () {
      var open = getOpenEntries();
      return open.length ? open[open.length - 1] : null;
    },

    requestExclusive: function (id) {
      id = toId(id);
      if (!id) return;

      var open = getOpenEntries();
      for (var i = 0; i < open.length; i++) {
        if (open[i].id === id) continue;
        requestClose(open[i]);
      }
    }
  };
})();
