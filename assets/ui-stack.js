/*! Covenant UI Stack v0.3.15 */
(function () {
  'use strict';

  // A tiny coordination layer for modal/veil surfaces.
  // This file should remain safe to load even when no panels register with it.

  if (window.COVENANT_UI_STACK) return;

  window.COVENANT_UI_STACK_VERSION = '0.3.15';

  var registry = Object.create(null);
  var order = [];

  // True LIFO open-stack ("topmost" is last).
  // Maintained by noteOpen/noteClose (and bringToFront).
  var openStack = [];

  // Shared scroll lock (stack-derived) — enabled only for entries that opt in.
  var scrollLocked = false;

  // Preserve prior overflow/padding so we don't clobber page-authored styles.
  var prevHtmlOverflow = '';
  var prevBodyOverflow = '';
  var prevBodyPaddingRight = '';

  // Lexicon gating: Lexicon may open only if it is opened first.
  // If Lexicon is closed and ToC or Reliquary is open, the Lexicon toggle is "locked":
  // interactions trigger a single subtle "breath" animation and do not open Lexicon.
  var lexiconLocked = false;
  var lexiconStyleLocked = false;
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

  // -------------------------------------------------
  // Hash-gated dock/footer debug badge (iPhone Safari)
  // Enabled only when URL hash contains "debug-dock".
  // -------------------------------------------------

  var dockDebugEnabled = false;
  try {
    dockDebugEnabled = String(window.location.hash || '').indexOf('debug-dock') !== -1;
  } catch (err0) {
    dockDebugEnabled = false;
  }

  var dockDebugBadge = null;
  var dockDebugTimer = null;
  var dockDebugStartedAt = 0;
  var dockDebugBaselineTop = null;

  function dbgStr(x) {
    try { return (x == null) ? '' : String(x); } catch (err) { return ''; }
  }

  function ensureDockDebugBadge() {
    if (!dockDebugEnabled || dockDebugBadge) return;

    try {
      var el = document.createElement('pre');
      el.setAttribute('data-covenant-dock-debug', '1');
      el.style.position = 'fixed';
      el.style.left = '8px';
      el.style.bottom = '8px';
      el.style.zIndex = '2147483647';
      el.style.maxWidth = 'min(92vw, 560px)';
      el.style.maxHeight = 'min(44vh, 360px)';
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
      el.style.contain = 'content';

      (document.body || document.documentElement).appendChild(el);
      dockDebugBadge = el;
    } catch (err1) {
      dockDebugBadge = null;
    }
  }

  function readFooterRect() {
    try {
      var footer = document.querySelector('.nav-footer');
      if (!footer || !footer.getBoundingClientRect) return null;
      var r = footer.getBoundingClientRect();
      if (!r) return null;
      return {
        top: r.top,
        bottom: r.bottom,
        height: r.height,
        left: r.left,
        width: r.width
      };
    } catch (err) {
      return null;
    }
  }

  function readVisualViewport() {
    try {
      if (!window.visualViewport) return null;
      return {
        height: window.visualViewport.height,
        width: window.visualViewport.width,
        offsetTop: window.visualViewport.offsetTop,
        offsetLeft: window.visualViewport.offsetLeft,
        pageTop: window.visualViewport.pageTop,
        pageLeft: window.visualViewport.pageLeft,
        scale: window.visualViewport.scale
      };
    } catch (err) {
      return null;
    }
  }

  function readOverflowState() {
    var out = { html: '', body: '', padR: '' };
    try {
      out.html = document.documentElement ? (document.documentElement.style.overflow || '') : '';
      out.body = document.body ? (document.body.style.overflow || '') : '';
      out.padR = document.body ? (document.body.style.paddingRight || '') : '';
    } catch (err) {}
    return out;
  }

  function updateDockDebugBadge() {
    if (!dockDebugEnabled || !dockDebugBadge) return;

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

      lines.push('Dock debug (' + dbgStr(window.COVENANT_UI_STACK_VERSION) + ')');
      if (path) lines.push('Page: ' + path);

      var root = document.documentElement;
      var rootClass = (root && root.className) ? dbgStr(root.className) : '';
      if (rootClass) lines.push('html: ' + rootClass);

      lines.push('isIOS: ' + (isIOS ? 'true' : 'false') + ' scrollLocked: ' + (scrollLocked ? 'true' : 'false'));

      var ids = [];
      try { ids = (typeof getOpenIds === 'function') ? getOpenIds() : []; } catch (errIds) { ids = []; }
      if (ids && ids.length) lines.push('openStack: ' + ids.join(' > '));

      var footerRect = readFooterRect();
      if (footerRect) {
        if (dockDebugBaselineTop == null) dockDebugBaselineTop = footerRect.top;
        var dTop = (footerRect.top - dockDebugBaselineTop);
        lines.push('footer rect: top=' + footerRect.top.toFixed(2) + ' (Δ' + dTop.toFixed(2) + ') h=' + footerRect.height.toFixed(2) + ' bottom=' + footerRect.bottom.toFixed(2));
      } else {
        lines.push('footer rect: (missing)');
      }

      var vv = readVisualViewport();
      if (vv) {
        lines.push('visualViewport: h=' + dbgStr(vv.height) + ' offTop=' + dbgStr(vv.offsetTop) + ' pageTop=' + dbgStr(vv.pageTop) + ' scale=' + dbgStr(vv.scale));
      } else {
        lines.push('visualViewport: (n/a)');
      }

      lines.push('innerHeight=' + dbgStr(window.innerHeight) + ' docEl.clientHeight=' + dbgStr(document.documentElement ? document.documentElement.clientHeight : ''));

      var overflow = readOverflowState();
      if (overflow) {
        lines.push('overflow: html=' + dbgStr(overflow.html) + ' body=' + dbgStr(overflow.body) + ' padR=' + dbgStr(overflow.padR));
      }

      var since = dockDebugStartedAt ? (now() - dockDebugStartedAt) : 0;
      lines.push('t=' + since + 'ms');

      dockDebugBadge.textContent = lines.join('\n');
    } catch (err3) {}
  }

  function startDockDebugBadgeIfNeeded() {
    if (!dockDebugEnabled) return;

    ensureDockDebugBadge();

    if (!dockDebugStartedAt) dockDebugStartedAt = now();
    updateDockDebugBadge();

    if (dockDebugTimer) return;

    try {
      dockDebugTimer = setInterval(updateDockDebugBadge, 120);
    } catch (err) {
      dockDebugTimer = null;
    }

    // Also refresh on viewport changes.
    try {
      if (window.visualViewport && window.visualViewport.addEventListener) {
        window.visualViewport.addEventListener('resize', updateDockDebugBadge);
        window.visualViewport.addEventListener('scroll', updateDockDebugBadge);
      }
    } catch (err2) {}
  }

  if (dockDebugEnabled) {
    if (document && document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startDockDebugBadgeIfNeeded);
    } else {
      startDockDebugBadgeIfNeeded();
    }
  }

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

  // -------------------------------------------------
  // iOS dock gesture guard (rubber-band leak fix)
  // Blocks page scroll initiation during dock drag gestures and ToC/Reliquary motion shells.
  // Allows normal scrolling inside the panel bodies.
  // -------------------------------------------------

  (function wireIOSDockGestureGuard() {
    if (!isIOS) return;

    var root = document.documentElement;

    // Track a "finger is down on a dock drag handle" session.
    // IMPORTANT: do NOT preventDefault touchstart (it can suppress the click).
    var dockTouchActive = false;
    var dockTouchId = null;

    function beginDockTouchSession(e) {
      try {
        if (!e || !e.changedTouches || !e.changedTouches.length) return;
        var t = e.changedTouches[0];
        if (!t) return;
        dockTouchActive = true;
        dockTouchId = t.identifier;
      } catch (err) {
        dockTouchActive = true;
        dockTouchId = null;
      }
    }

    function endDockTouchSession(e) {
      if (!dockTouchActive) return;

      try {
        if (!e || !e.changedTouches || dockTouchId == null) {
          dockTouchActive = false;
          dockTouchId = null;
          return;
        }

        for (var i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i] && e.changedTouches[i].identifier === dockTouchId) {
            dockTouchActive = false;
            dockTouchId = null;
            return;
          }
        }
      } catch (err) {
        dockTouchActive = false;
        dockTouchId = null;
      }
    }

    function isActive() {
      try {
        if (dockTouchActive) return true;

        if (root && root.classList) {
          if (root.classList.contains('toc-opening')) return true;
          if (root.classList.contains('toc-closing')) return true;
          if (root.classList.contains('toc-open')) return true;
          if (root.classList.contains('reliquary-opening')) return true;
          if (root.classList.contains('reliquary-closing')) return true;
          if (root.classList.contains('reliquary-open')) return true;
          if (root.classList.contains('reliquary-dragging')) return true;
        }

        var tocPanel = document.getElementById('tocPanel');
        var reliquaryPanel = document.getElementById('reliquaryPanel');

        if (tocPanel && tocPanel.classList) {
          if (tocPanel.classList.contains('is-dragging')) return true;
          if (tocPanel.classList.contains('is-open')) return true;
          if (tocPanel.classList.contains('is-closing')) return true;
        }

        if (reliquaryPanel && reliquaryPanel.classList) {
          if (reliquaryPanel.classList.contains('is-dragging')) return true;
          if (reliquaryPanel.classList.contains('is-open')) return true;
        }

        return false;
      } catch (err) {
        return false;
      }
    }

    var blocker = function (e) {
      if (!isActive()) return;

      // Allow scrolling inside the panel bodies.
      if (closestSafe(e && e.target, '#tocPanel .toc-panel-body')) return;
      if (closestSafe(e && e.target, '#reliquaryPanel .reliquary-panel-body')) return;

      if (e && e.cancelable) e.preventDefault();
    };

    // Install immediately (low cost; only blocks when active states are present).
    document.addEventListener('touchmove', blocker, { capture: true, passive: false });

    function wireOnElements() {
      var tocToggle = document.getElementById('tocToggle');
      var mirrorToggle = document.getElementById('mirrorToggle');

      // Tell the browser: do not treat these as panning surfaces.
      try { if (tocToggle) tocToggle.style.touchAction = 'none'; } catch (err1) {}
      try { if (mirrorToggle) mirrorToggle.style.touchAction = 'none'; } catch (err2) {}

      try {
        if (tocToggle) {
          tocToggle.addEventListener('touchstart', beginDockTouchSession, { capture: true, passive: true });
          tocToggle.addEventListener('touchend', endDockTouchSession, { capture: true, passive: true });
          tocToggle.addEventListener('touchcancel', endDockTouchSession, { capture: true, passive: true });
        }

        if (mirrorToggle) {
          mirrorToggle.addEventListener('touchstart', beginDockTouchSession, { capture: true, passive: true });
          mirrorToggle.addEventListener('touchend', endDockTouchSession, { capture: true, passive: true });
          mirrorToggle.addEventListener('touchcancel', endDockTouchSession, { capture: true, passive: true });
        }

        // Safety net: if the touch ends elsewhere, stop the session.
        document.addEventListener('touchend', endDockTouchSession, { capture: true, passive: true });
        document.addEventListener('touchcancel', endDockTouchSession, { capture: true, passive: true });
      } catch (err3) {}
    }

    // ui-stack loads with defer; elements should exist, but keep it safe.
    if (document && document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wireOnElements);
    } else {
      wireOnElements();
    }

  })();

  function computeScrollbarWidth() {
    try {
      var docEl = document.documentElement;
      if (!docEl) return 0;
      var w = (window.innerWidth || 0) - (docEl.clientWidth || 0);
      if (!w || w < 0) return 0;
      return Math.round(w);
    } catch (err) {
      return 0;
    }
  }

  function lockBodyScroll() {
    if (scrollLocked) return;

    scrollLocked = true;

    // iOS Safari: do NOT toggle overflow hidden (it can nudge visualViewport and tick fixed docks by ~1px).
    // Instead, use only a touchmove blocker (and allow-scroll selectors) to keep the page sovereign.
    try {
      prevHtmlOverflow = document.documentElement ? (document.documentElement.style.overflow || '') : '';
      prevBodyOverflow = document.body ? (document.body.style.overflow || '') : '';
      prevBodyPaddingRight = document.body ? (document.body.style.paddingRight || '') : '';
    } catch (err0) {
      prevHtmlOverflow = '';
      prevBodyOverflow = '';
      prevBodyPaddingRight = '';
    }

    try { document.documentElement.classList.add('ui-stack-scroll-lock'); } catch (err1) {}

    if (isIOS) {
      enableIOSTouchScrollLock();
      return;
    }

    // Non-iOS: overflow lock + scrollbar width compensation.
    try {
      if (document.documentElement) document.documentElement.style.overflow = 'hidden';
      if (document.body) document.body.style.overflow = 'hidden';

      var sw = computeScrollbarWidth();
      if (sw && document.body) {
        document.body.style.paddingRight = sw + 'px';
      }
    } catch (err2) {}
  }

  function unlockBodyScroll() {
    if (!scrollLocked) return;

    scrollLocked = false;

    try { document.documentElement.classList.remove('ui-stack-scroll-lock'); } catch (err1) {}

    // Always remove iOS touch lock if present.
    if (isIOS) {
      disableIOSTouchScrollLock();

      prevHtmlOverflow = '';
      prevBodyOverflow = '';
      prevBodyPaddingRight = '';
      return;
    }

    try {
      if (document.documentElement) document.documentElement.style.overflow = prevHtmlOverflow || '';
      if (document.body) {
        document.body.style.overflow = prevBodyOverflow || '';
        document.body.style.paddingRight = prevBodyPaddingRight || '';
      }
    } catch (err2) {}

    prevHtmlOverflow = '';
    prevBodyOverflow = '';
    prevBodyPaddingRight = '';
  }

  function isCommittedOpenForSharedScrollLock(entry) {
    // IMPORTANT: We only want to engage the shared lock for *committed open*
    // states, not for drag-open shells.

    if (!entry || !entry.id) return true;

    var id = String(entry.id);

    try {
      if (id === 'toc') {
        var root = document.documentElement;
        var toc = document.getElementById('tocPanel');

        if (!toc || !toc.classList) return false;

        // Must be fully open.
        if (!toc.classList.contains('is-open')) return false;

        // Not committed while dragging/closing.
        if (toc.classList.contains('is-dragging') || toc.classList.contains('is-closing')) return false;

        // Not committed while root motion classes are in-flight.
        // (Support older cached builds that used "toc-dock-setting".)
        if (root && root.classList) {
          if (
            root.classList.contains('toc-opening')
            || root.classList.contains('toc-closing')
            || root.classList.contains('toc-dock-settling')
            || root.classList.contains('toc-dock-setting')
          ) return false;
        }

        // iOS/Safari: avoid engaging scroll lock in the micro-window immediately after noteOpen
        // (before motion classes apply). This prevents a one-frame visual viewport shift.
        var openedAt = (entry && typeof entry.openedAt === 'number') ? entry.openedAt : 0;
        if (openedAt) {
          var age = now() - openedAt;
          if (age >= 0 && age < 180) return false;
        }

        return true;
      }

      if (id === 'reliquary') {
        var rootR = document.documentElement;
        if (!rootR || !rootR.classList || !rootR.classList.contains('reliquary-open')) return false;

        // Drag-open shells may briefly mark .reliquary-open early; avoid scroll-lock while opening/dragging.
        if (rootR.classList.contains('reliquary-opening') || rootR.classList.contains('reliquary-closing')) return false;

        var rel = document.getElementById('reliquaryPanel');
        if (rel && rel.classList && rel.classList.contains('is-dragging')) return false;

        // Cancel-open signature: Reliquary can look open for a frame but overlay is already at 0.
        var ov = document.getElementById('reliquaryOverlay');
        var op = (ov && ov.style) ? parseFloat(ov.style.opacity) : NaN;
        if (op === 0) return false;

        return true;
      }

      if (id === 'lexicon') {
        var lex = document.getElementById('lexiconPanel');
        return !!(lex && lex.classList && lex.classList.contains('is-open'));
      }
    } catch (err0) {}

    return true;
  }

  function shouldUseSharedScrollLock(ids) {
    if (!ids || !ids.length) return false;

    for (var i = 0; i < ids.length; i++) {
      var entry = registry[ids[i]];
      if (!entry) continue;
      if (!entry.useSharedScrollLock) continue;
      if (!isCommittedOpenForSharedScrollLock(entry)) continue;
      return true;
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
    if (!el || !el.classList) return false;

    // Cancel-open signature (drag released early): Reliquary marks itself open immediately on drag start,
    // but on cancel it snaps back down and sets overlay opacity to 0 right away.
    if (panelId === 'reliquaryPanel') {
      try {
        var root = document.documentElement;
        var opening = !!(root && root.classList && root.classList.contains('reliquary-opening'));
        var closing = !!(root && root.classList && root.classList.contains('reliquary-closing'));
        if (opening && !closing && !el.classList.contains('is-dragging')) {
          var ov = document.getElementById('reliquaryOverlay');
          var op = (ov && ov.style) ? parseFloat(ov.style.opacity) : NaN;
          if (op === 0) return false;
        }
      } catch (errR) {}
    }

    if (el.classList.contains('is-open')) return true;

    // Lexicon gating should engage as soon as ToC/Reliquary begin drag-open.
    if (panelId === 'tocPanel') {
      if (el.classList.contains('is-dragging') || el.classList.contains('is-closing')) return true;
    }

    if (panelId === 'reliquaryPanel') {
      if (el.classList.contains('is-dragging')) return true;
    }

    return false;
  }

  function isToCCommittedOpen() {
    var toc = document.getElementById('tocPanel');
    return !!(toc && toc.classList && toc.classList.contains('is-open'));
  }

  function isReliquaryCommittedOpen() {
    try {
      var root = document.documentElement;
      if (!root || !root.classList || !root.classList.contains('reliquary-open')) return false;

      if (root.classList.contains('reliquary-opening') || root.classList.contains('reliquary-closing')) return false;

      var el = document.getElementById('reliquaryPanel');
      if (el && el.classList && el.classList.contains('is-dragging')) return false;

      var ov = document.getElementById('reliquaryOverlay');
      var op = (ov && ov.style) ? parseFloat(ov.style.opacity) : NaN;
      if (op === 0) return false;

      return true;
    } catch (err) {
      return false;
    }
  }

  function computeLexiconLockedForInterception() {
    var lexOpen = isPanelOpenByDomId('lexiconPanel');
    if (lexOpen) return false;

    // Interception is allowed to engage during drag shells.
    var tocOpen = isPanelOpenByDomId('tocPanel');
    var relOpen = isPanelOpenByDomId('reliquaryPanel');

    return !!(tocOpen || relOpen);
  }

  function computeLexiconLockedForStyle() {
    var lexOpen = isPanelOpenByDomId('lexiconPanel');
    if (lexOpen) return false;

    // Styling must not cause a footer reflow during drag shells on iOS Safari,
    // so only apply the "locked" visual state when the other surface is *committed open*.
    return !!(isToCCommittedOpen() || isReliquaryCommittedOpen());
  }

  function applyLexiconGateState() {
    var toggle = document.getElementById('lexiconToggle');
    if (!toggle) return;

    var interceptLocked = computeLexiconLockedForInterception();
    var styleLocked = computeLexiconLockedForStyle();

    // Keep interaction lock accurate (so interceptors work), but defer DOM "locked" visuals
    // until committed-open to avoid a 1px footer hop on iOS Safari during drag-open.
    if (interceptLocked === lexiconLocked && styleLocked === lexiconStyleLocked) return;

    lexiconLocked = interceptLocked;
    lexiconStyleLocked = styleLocked;

    toggle.setAttribute('data-lexicon-locked', styleLocked ? 'true' : 'false');
    // Keep it focusable/clickable, but signal "locked" to AT (when style lock is active).
    toggle.setAttribute('aria-disabled', styleLocked ? 'true' : 'false');

    if (toggle.classList && toggle.classList.toggle) {
      toggle.classList.toggle('is-lexicon-locked', styleLocked);
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

  // Keep Lexicon gate in sync with DOM state even when no stack event fires
  // (e.g., edge cases where ToC closes but ui-stack doesn't get a corresponding noteClose).
  (function wireLexiconGateAutoSync() {
    var pending = false;

    function schedule() {
      if (pending) return;
      pending = true;

      var raf = window.requestAnimationFrame || function (cb) { return setTimeout(cb, 0); };

      raf(function () {
        pending = false;
        try { applyLexiconGateState(); } catch (err) {}
      });
    }

    function bindObserver() {
      if (!window.MutationObserver) {
        schedule();
        return;
      }

      try {
        var targets = [];
        targets.push(document.documentElement);

        var tocPanel = document.getElementById('tocPanel');
        var relPanel = document.getElementById('reliquaryPanel');
        var lexPanel = document.getElementById('lexiconPanel');

        if (tocPanel) targets.push(tocPanel);
        if (relPanel) targets.push(relPanel);
        if (lexPanel) targets.push(lexPanel);

        var observer = new MutationObserver(function () { schedule(); });

        for (var i = 0; i < targets.length; i++) {
          observer.observe(targets[i], { attributes: true, attributeFilter: ['class', 'style'] });
        }
      } catch (err2) {}

      schedule();
    }

    if (document && document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindObserver);
    } else {
      bindObserver();
    }

    // Also resync on bfcache restore.
    try {
      window.addEventListener('pageshow', schedule);
    } catch (err3) {}
  })();

  // Keep shared scroll lock in sync with DOM motion classes even when no stack event fires.
  // (Critical for ToC open/close animations where noteOpen/noteClose are not aligned to motion class timing.)
  (function wireSharedScrollLockAutoSync() {
    var pending = false;
    var lastRunAt = 0;

    function schedule() {
      if (pending) return;
      pending = true;

      var raf = window.requestAnimationFrame || function (cb) { return setTimeout(cb, 0); };

      raf(function () {
        pending = false;

        // Guard against tight mutation loops.
        var t = now();
        if (lastRunAt && (t - lastRunAt) < 12) return;
        lastRunAt = t;

        try { syncScrollLockFromIds(getOpenIds()); } catch (err) {}
      });
    }

    function bindObserver() {
      if (!window.MutationObserver) {
        schedule();
        return;
      }

      try {
        var targets = [];
        targets.push(document.documentElement);

        var tocPanel = document.getElementById('tocPanel');
        var relPanel = document.getElementById('reliquaryPanel');
        var lexPanel = document.getElementById('lexiconPanel');

        if (tocPanel) targets.push(tocPanel);
        if (relPanel) targets.push(relPanel);
        if (lexPanel) targets.push(lexPanel);

        var observer = new MutationObserver(function () { schedule(); });

        for (var i = 0; i < targets.length; i++) {
          observer.observe(targets[i], { attributes: true, attributeFilter: ['class'] });
        }
      } catch (err2) {}

      schedule();
    }

    if (document && document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindObserver);
    } else {
      bindObserver();
    }

    // Also resync on bfcache restore.
    try {
      window.addEventListener('pageshow', schedule);
    } catch (err3) {}
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

    // Dock tabs: if ToC and Reliquary are both open, hide the background tab so it cannot
    // visually "cut through" the topmost veil. (The dock remains sovereign; we do not
    // attempt to overlay the dock with panel z-index.)
    try {
      var tocToggle = document.getElementById('tocToggle');
      var mirrorToggle = document.getElementById('mirrorToggle');

      var tocOpen = isPanelOpenByDomId('tocPanel');
      var relOpen = isPanelOpenByDomId('reliquaryPanel');
      var bothOpen = !!(tocOpen && relOpen);

      var coverToc = bothOpen && (topId === 'reliquary');
      var coverMirror = bothOpen && (topId === 'toc');

      if (tocToggle && tocToggle.classList) {
        tocToggle.classList.toggle('is-ui-stack-covered', !!coverToc);
        if (coverToc) tocToggle.setAttribute('aria-hidden', 'true');
        else tocToggle.removeAttribute('aria-hidden');
      }

      if (mirrorToggle && mirrorToggle.classList) {
        mirrorToggle.classList.toggle('is-ui-stack-covered', !!coverMirror);
        if (coverMirror) mirrorToggle.setAttribute('aria-hidden', 'true');
        else mirrorToggle.removeAttribute('aria-hidden');
      }
    } catch (errTabs) {}
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
    var armed = null;

    function clearArmed() {
      if (!armed) return;
      try { if (armed.classList) armed.classList.remove('is-armed'); } catch (err1) {}
      armed = null;
    }

    function getNavLinkFromTarget(t) {
      try {
        return (t && t.closest) ? t.closest('a.nav-prev, a.nav-next') : null;
      } catch (err) {
        return null;
      }
    }

    // Any touch/click elsewhere disarms.
    document.addEventListener('pointerdown', function (e) {
      if (!armed) return;
      var t = e && e.target;
      if (!t) return;
      try {
        if (armed.contains && armed.contains(t)) return;
      } catch (err2) {}
      clearArmed();
    }, true);

    // bfcache restore: never keep a stale armed glow.
    try {
      window.addEventListener('pageshow', clearArmed);
    } catch (err3) {}

    document.addEventListener('click', function (e) {
      if (!isPlainLeftClick(e)) return;

      var t = e.target;
      if (!t) {
        clearArmed();
        return;
      }

      // Support click on inner spans/icons.
      var link = getNavLinkFromTarget(t);

      // Click outside nav links: disarm.
      if (!link) {
        clearArmed();
        return;
      }

      var href = link.getAttribute('href');
      if (!href) return;

      // First click arms. Second click commits.
      if (armed !== link) {
        e.preventDefault();
        e.stopPropagation();

        clearArmed();
        armed = link;
        try { if (armed.classList) armed.classList.add('is-armed'); } catch (err4) {}
        return;
      }

      // Second click: navigate (close panels first if needed).
      e.preventDefault();
      e.stopPropagation();

      clearArmed();

      if (!isPanelOpenByDom()) {
        window.location.href = href;
        return;
      }

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
