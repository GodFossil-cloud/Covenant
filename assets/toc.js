/*! Covenant ToC v3.3.4 (Staging suppresses current node indicator; commit flash) */
(function () {
  'use strict';

  window.COVENANT_TOC_VERSION = '3.3.4';

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
  var pendingHoldEl = null;
  var pendingHoldTitleEl = null;
  var confirmNavigating = false;

  var holdTimer = null;
  var holdRaf = 0;
  var holdStartedAt = 0;
  var holdCompleted = false;

  // Tap-open/close animation guard (prevents re-entry + micro-jitter from rapid toggles).
  var tapAnimating = false;

  // Optional: UI stack coordination.
  var uiRegistered = false;
  var UI_STACK_ID = 'toc';

  // While closing, keep the tab welded (1px) during descent.
  // NOTE: Do not change the weld mid-transition (it can re-target transform and look like a bounce).
  var CLOSE_WELD_PX = 1;
  var CLOSE_WELD_DROP_MS = 120;
  var closeWeldTimer = null;

  // When a different entry is staged, suppress the "current page" visual node indicator.
  // (We keep aria-current semantics; we only toggle the CSS class that drives the node styling.)
  var suppressedCurrentItemEl = null;

  function setRootWeldNudge(px) {
    try {
      root.style.setProperty('--toc-tab-weld-nudge', String(px) + 'px');
    } catch (err) {}
  }

  function clearRootWeldNudge() {
    try {
      root.style.removeProperty('--toc-tab-weld-nudge');
    } catch (err) {}
  }

  function scheduleCloseWeldDrop(snapMs) {
    if (closeWeldTimer) {
      clearTimeout(closeWeldTimer);
      closeWeldTimer = null;
    }

    var ms = (typeof snapMs === 'number' && isFinite(snapMs)) ? snapMs : 420;
    var t = Math.max(0, ms - CLOSE_WELD_DROP_MS);

    closeWeldTimer = setTimeout(function () {
      closeWeldTimer = null;
      setRootWeldNudge(0);
    }, t);
  }

  function cancelCloseWeldDrop() {
    if (!closeWeldTimer) return;
    clearTimeout(closeWeldTimer);
    closeWeldTimer = null;
  }

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

  function setToCTabDragOffset(px, draggingNow) {
    if (!tocToggle) return;
    tocToggle.style.setProperty('--toc-tab-drag-y', px + 'px');
    tocToggle.classList.toggle('is-toc-dragging', !!draggingNow);
  }

  function clearToCTabDragOffset() {
    if (!tocToggle) return;

    // Pin rather than remove: removing the CSS variable at the end of a close/settle can cause
    // a one-frame compositor re-evaluation that reads as a 1px snap on iOS Safari.
    tocToggle.style.setProperty('--toc-tab-drag-y', '0px');
    tocToggle.classList.remove('is-toc-dragging');
  }

  function isMobileSheet() {
    try {
      return !!(window.matchMedia && window.matchMedia('(max-width: 600px)').matches);
    } catch (err) {
      return false;
    }
  }

  function prefersReducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (err) {
      return false;
    }
  }

  function getCommitFlashTarget() {
    if (pendingHoldEl) return pendingHoldEl;
    if (pendingItemEl && pendingItemEl.querySelector) {
      return pendingItemEl.querySelector('.toc-item-btn');
    }
    return null;
  }

  function playCommitFlash(el) {
    if (!el) return;
    if (prefersReducedMotion()) return;
    if (typeof el.animate !== 'function') return;

    try {
      if (el.__covenantCommitFlash && typeof el.__covenantCommitFlash.cancel === 'function') {
        el.__covenantCommitFlash.cancel();
      }
    } catch (err0) {}

    try {
      el.__covenantCommitFlash = el.animate([
        { transform: 'translateY(0px)', filter: 'brightness(1)', boxShadow: '0 0 0 rgba(201, 169, 97, 0)' },
        { transform: 'translateY(-1px)', filter: 'brightness(1.06)', boxShadow: '0 0 0 1px rgba(201, 169, 97, 0.18), 0 0 18px rgba(201, 169, 97, 0.14)' },
        { transform: 'translateY(0px)', filter: 'brightness(1)', boxShadow: '0 0 0 rgba(201, 169, 97, 0)' }
      ], {
        duration: 320,
        easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
        iterations: 1
      });
    } catch (err1) {}
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

    // Avoid flooring here: visualViewport height can be fractional on mobile Safari, and flooring
    // can leave a 1px top gap that makes the dock tab appear "higher" than the panel.
    var available = viewportH - bottom - topPad;
    if (!isFinite(available)) available = 240;

    var maxH = Math.max(240, available);

    if (mobile) {
      // Anchor with top+bottom so the top edge is truly flush (or safe-area flush) with the viewport.
      // This avoids fractional height rounding leaving a hairline gap at the very top.
      tocPanel.style.top = topPad + 'px';
      tocPanel.style.bottom = bottom + 'px';
      tocPanel.style.height = 'auto';
      tocPanel.style.maxHeight = 'none';
    } else {
      tocPanel.style.bottom = bottom + 'px';
      tocPanel.style.maxHeight = maxH + 'px';
      tocPanel.style.height = '';
      tocPanel.style.removeProperty('top');
    }

    if (tocToggle && mobile) {
      var rect = tocToggle.getBoundingClientRect();
      // Micro-weld: if the tab reads ~1px left of the sheet edge (subpixel rounding / border antialias),
      // bias the sheet left by 1px so the seam disappears.
      var left = Math.max(0, rect.left - 1);
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

  function computePanelClosedY(includeSink) {
    if (!tocPanel || !tocPanel.getBoundingClientRect) return 1;

    var rect = tocPanel.getBoundingClientRect();
    var h = (rect && rect.height) ? rect.height : 1;
    var closedOffsetPx = readCssNumberVar('--toc-closed-offset') || 0;

    var SINK_PX = includeSink ? 4 : 0;

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

    var currentIdx = window.getJourneyIndex(currentPageId);
    if (currentIdx < 0) return;

    // Harden linearity: do not allow a direct-URL visit of a future page to advance unlock state.
    // Only unlock when arriving in order (or revisiting earlier pages).
    if (currentIdx <= maxIndexUnlocked + 1) {
      unlock(currentPageId);
    }
  }

  function enforceSoftGate() {
    if (!currentPageId) return true;
    if (!storageAvailable) return true;

    var currentIdx = window.getJourneyIndex(currentPageId);
    if (currentIdx < 0) return true;

    if (currentIdx <= maxIndexUnlocked + 1) return true;

    console.warn('[Covenant ToC] Access denied to locked page:', currentPageId);
    window.location.href = 'invocation.html';
    return false;
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

  function findCurrentItemElement() {
    if (!currentPageId || !tocDynamicContent || !tocDynamicContent.querySelector) return null;

    try {
      return tocDynamicContent.querySelector('.toc-item[data-page-id="' + CSS.escape(currentPageId) + '"]');
    } catch (err) {
      // CSS.escape not supported? Fall back to current class.
      return tocDynamicContent.querySelector('.toc-item--current');
    }
  }

  function suppressCurrentIndicator() {
    if (!currentPageId) return;

    var el = findCurrentItemElement();
    if (!el || !el.classList) return;

    if (el.classList.contains('toc-item--current')) {
      el.classList.remove('toc-item--current');
      el.classList.add('toc-item--current-suppressed');
      suppressedCurrentItemEl = el;
    }
  }

  function restoreCurrentIndicator() {
    var el = (suppressedCurrentItemEl && suppressedCurrentItemEl.classList) ? suppressedCurrentItemEl : findCurrentItemElement();
    if (!el || !el.classList) {
      suppressedCurrentItemEl = null;
      return;
    }

    if (el.classList.contains('toc-item--current-suppressed')) {
      el.classList.remove('toc-item--current-suppressed');
      el.classList.add('toc-item--current');
    }

    suppressedCurrentItemEl = null;
  }

  function clearPendingSelection() {
    restoreCurrentIndicator();

    pendingHref = '';
    pendingPageId = '';
    pendingTitle = '';

    if (pendingItemEl && pendingItemEl.classList) {
      pendingItemEl.classList.remove('toc-item--pending');
      pendingItemEl.classList.remove('is-holding');
    }

    if (pendingHoldEl && pendingHoldEl.classList) {
      pendingHoldEl.classList.remove('is-holding');
      pendingHoldEl.disabled = false;
      pendingHoldEl.removeAttribute('aria-label');
    }

    if (pendingHoldTitleEl && pendingHoldTitleEl.style) {
      pendingHoldTitleEl.style.removeProperty('--toc-hold-p');
    }

    pendingItemEl = null;
    pendingHoldEl = null;
    pendingHoldTitleEl = null;

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

  function stageSelection(pageId, href, title, itemEl, itemBtnEl) {
    if (!pageId || !href) return;
    if (pageId === currentPageId) return;

    if (pendingItemEl && pendingItemEl !== itemEl && pendingItemEl.classList) {
      pendingItemEl.classList.remove('toc-item--pending');
      pendingItemEl.classList.remove('is-holding');
    }

    pendingHref = href;
    pendingPageId = pageId;
    pendingTitle = title || '';
    pendingItemEl = itemEl;
    pendingHoldEl = itemBtnEl || null;
    pendingHoldTitleEl = null;

    if (pendingHoldEl && pendingHoldEl.querySelector) {
      pendingHoldTitleEl = pendingHoldEl.querySelector('.toc-entry-title');
    }

    if (pendingItemEl && pendingItemEl.classList) {
      pendingItemEl.classList.add('toc-item--pending');
    }

    suppressCurrentIndicator();

    if (pendingTitle) setProducedTitle(pendingTitle);

    // Deliberate confirm lives on the staged entry itself: click again to enter.
    if (pendingHoldEl) {
      pendingHoldEl.setAttribute('aria-label', 'Click again to enter selected page');
      pendingHoldEl.disabled = false;
    }

    if (pendingHoldTitleEl && pendingHoldTitleEl.style) {
      pendingHoldTitleEl.style.setProperty('--toc-hold-p', '0');
    }
  }

  // ---------------------------
  // Hold-to-enter (legacy)
  // ---------------------------

  function setHoldProgress(p) {
    var clamped = Math.max(0, Math.min(1, p));

    if (pendingHoldTitleEl && pendingHoldTitleEl.style) {
      pendingHoldTitleEl.style.setProperty('--toc-hold-p', String(clamped));
      return;
    }

    if (pendingHoldEl && pendingHoldEl.style) {
      pendingHoldEl.style.setProperty('--toc-hold-p', String(clamped));
    }
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

    if (pendingHoldEl && pendingHoldEl.classList) {
      pendingHoldEl.classList.remove('is-holding');
    }

    if (pendingItemEl && pendingItemEl.classList) {
      pendingItemEl.classList.remove('is-holding');
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

  function shouldBeginHoldForEvent(e) {
    if (!e) return false;

    if (pendingHoldEl && e.target && (e.target === pendingHoldEl || (pendingHoldEl.contains && pendingHoldEl.contains(e.target)))) {
      return true;
    }

    // Keyboard path: focused element is the pending hold surface.
    try {
      if ((e.type === 'keydown' || e.type === 'keyup') && pendingHoldEl && document.activeElement === pendingHoldEl) return true;
    } catch (err) {}

    return false;
  }

  function beginHold(e) {
    if (!pendingHref) return;

    var surface = pendingHoldEl;
    if (!surface || surface.disabled) return;

    if (!shouldBeginHoldForEvent(e)) return;

    stopEvent(e);

    if (holdTimer || holdStartedAt) return;

    holdStartedAt = Date.now();
    holdCompleted = false;

    if (surface.classList) surface.classList.add('is-holding');
    if (pendingItemEl && pendingItemEl.classList) pendingItemEl.classList.add('is-holding');

    setHoldProgress(0);

    if (pendingHoldEl && pendingHoldEl.setPointerCapture && e && typeof e.pointerId === 'number') {
      try { pendingHoldEl.setPointerCapture(e.pointerId); } catch (err0) {}
    }

    holdRaf = requestAnimationFrame(tickHold);

    holdTimer = setTimeout(function () {
      holdTimer = null;
      holdCompleted = true;
      commitNavigation();
    }, HOLD_MS);
  }

  function endHold(e) {
    if (!holdStartedAt) return;

    if (pendingHoldEl && pendingHoldEl.releasePointerCapture && e && typeof e.pointerId === 'number') {
      try { pendingHoldEl.releasePointerCapture(e.pointerId); } catch (err0) {}
    }

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

    playCommitFlash(getCommitFlashTarget());

    var surface = pendingHoldEl;
    if (surface) surface.disabled = true;

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

      var tabOffset = (y - closedY);
      if (tabOffset > 0) tabOffset = 0;

      if (draggingNow) {
        var weldPx = readCssNumberVar('--toc-tab-weld-nudge') || 0;
        if (weldPx > 0 && tabOffset > -(weldPx + 0.25)) {
          tabOffset = -weldPx;
        }
      }

      setToCTabDragOffset(tabOffset, !!draggingNow);
    }

    function applyOpenStateFromDrag() {
      if (!tocPanel || !tocOverlay) return;

      cancelCloseWeldDrop();
      clearRootWeldNudge();

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

      root.classList.add('toc-open');
      root.classList.remove('toc-closing');
      root.classList.remove('toc-dock-settling');

      setToCTabDragOffset(openLiftPx - closedY, false);
    }

    function settleDockAfterSnapClose() {
      var snapMs = readCssNumberVar('--toc-snap-duration');
      if (!snapMs || snapMs <= 0) snapMs = 420;

      root.classList.add('toc-dock-settling');
      root.classList.remove('toc-closing');

      setTimeout(function () {
        root.classList.remove('toc-dock-settling');
      }, snapMs + 30);
    }

    function finalizeCloseAfterSnap() {
      if (!tocPanel || !tocOverlay) return;

      setToCTabDragOffset(-CLOSE_WELD_PX, true);

      cancelCloseWeldDrop();
      clearRootWeldNudge();

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

      root.classList.remove('toc-open');

      settleDockAfterSnapClose();

      clearToCTabDragOffset();

      var target = (focusReturnEl && document.contains(focusReturnEl)) ? focusReturnEl : tocToggle;
      if (target && target.focus) target.focus();
      focusReturnEl = null;

      tocPanel.style.transition = '';
      tocOverlay.style.transition = '';
    }

    function snapCloseFromOpen() {
      if (!tocPanel) return;

      var done = false;

      cancelCloseWeldDrop();
      setRootWeldNudge(CLOSE_WELD_PX);

      root.classList.add('toc-closing');
      root.classList.remove('toc-opening');
      root.classList.remove('toc-dock-settling');

      var targetY = closedY;
      applyDragFrame(targetY, false);

      setToCTabDragOffset(-CLOSE_WELD_PX, false);

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
        shouldOpen = !(velocity > CLOSE_VELOCITY || dragDown > baseH * 0.28);
      } else {
        var dragUp = closedY - currentY;
        shouldOpen = (velocity < OPEN_VELOCITY || dragUp > baseH * OPEN_RATIO);
      }

      tocPanel.style.transition = 'transform ' + SNAP_MS + 'ms ' + SNAP_EASE + ', opacity ' + SNAP_MS + 'ms ' + SNAP_EASE;
      if (tocOverlay) tocOverlay.style.transition = 'opacity ' + SNAP_MS + 'ms ' + SNAP_EASE;

      if (shouldOpen) {
        cancelCloseWeldDrop();
        clearRootWeldNudge();

        tocPanel.style.transform = 'translateX(var(--toc-panel-x, -50%)) translateY(' + openLiftPx + 'px)';
        tocPanel.style.opacity = '1';
        if (tocOverlay) tocOverlay.style.opacity = '1';

        applyOpenStateFromDrag();

        setTimeout(function () {
          if (!tocPanel) return;
          var firstBtn = tocPanel.querySelector('.toc-item-btn:not([disabled]), .toc-locked-btn');
          if (firstBtn && firstBtn.focus) firstBtn.focus();
          else if (tocPanel.focus) tocPanel.focus();
        }, 0);
      } else {
        if (!startWasOpen) root.classList.add('toc-opening');

        if (startWasOpen) {
          snapCloseFromOpen();
        } else {
          setRootWeldNudge(0);
          applyDragFrame(closedY + 12, false);
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

          var raf2 = window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 0); };
          raf2(function () {
            raf2(function () {
              root.classList.remove('toc-opening');
              clearRootWeldNudge();
            });
          });

          setTimeout(function () {
            root.classList.remove('toc-dock-settling');
          }, SNAP_MS + 80);

          clearToCTabDragOffset();
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

      cancelCloseWeldDrop();
      if (startWasOpen) setRootWeldNudge(CLOSE_WELD_PX);
      else clearRootWeldNudge();

      if (startWasOpen) {
        root.classList.add('toc-closing');
        root.classList.remove('toc-opening');
        root.classList.remove('toc-dock-settling');
      }

      if (!startWasOpen) {
        root.classList.remove('toc-closing');
        root.classList.add('toc-opening');
        root.classList.remove('toc-dock-settling');
        renderToC();

        noteOpenToUIStack();
      }

      computeClosedY();

      currentY = startWasOpen ? openLiftPx : closedY;

      tocPanel.style.transition = 'none';
      if (tocOverlay) tocOverlay.style.transition = 'none';

      tocPanel.style.transform = 'translateX(var(--toc-panel-x, -50%)) translateY(' + currentY + 'px)';

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
      if (!moved && Math.abs(deltaY) > 2) {
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

      if (moved) {
        window.__COVENANT_TOC_DRAG_JUST_HAPPENED = true;
        setTimeout(function () { window.__COVENANT_TOC_DRAG_JUST_HAPPENED = false; }, 300);
        snap();
      } else {
        if (startWasOpen) root.classList.remove('toc-closing');
        else root.classList.remove('toc-opening');
        clearToCTabDragOffset();
        cancelCloseWeldDrop();
        clearRootWeldNudge();
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
      if (Math.abs(dy) <= 2) return;

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
      if (!itemBtn) {
        // Any click elsewhere inside the ToC clears staging.
        // (Do not interfere with annex link navigation.)
        var annexLink = closestSafe(e.target, '.toc-annex-link');
        if (!annexLink && pendingPageId) clearPendingSelection();
        return;
      }

      var itemEl = closestSafe(itemBtn, '.toc-item');
      var pageId = itemEl ? itemEl.getAttribute('data-page-id') : '';

      if (pageId && pageId === currentPageId) {
        stopEvent(e);
        clearPendingSelection();
        return;
      }

      // Second click on the staged entry commits navigation.
      if (pageId && pendingPageId && pageId === pendingPageId) {
        stopEvent(e);
        commitNavigation();
        return;
      }

      var href = itemBtn.getAttribute('data-href');
      if (!href || !pageId) return;

      stopEvent(e);

      var title = String(itemBtn.textContent || '').trim();
      stageSelection(pageId, href, title, itemEl, itemBtn);
    });
  }

  function openToC() {
    if (!tocPanel || !tocOverlay) return;

    if (tapAnimating) return;

    if (window.__COVENANT_TOC_DRAG_JUST_HAPPENED) {
      window.__COVENANT_TOC_DRAG_JUST_HAPPENED = false;
      return;
    }

    cancelCloseWeldDrop();
    clearRootWeldNudge();

    tocPanel.style.transform = '';
    tocPanel.style.opacity = '';
    tocPanel.style.transition = '';
    tocOverlay.style.opacity = '';
    tocOverlay.style.transition = '';

    confirmNavigating = false;
    cancelHold();

    focusReturnEl = tocToggle;

    root.classList.add('toc-open');
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

      setToCTabDragOffset(0, true);

      root.classList.add('toc-opening');

      var openLift = readCssNumberVar('--toc-open-lift') || 0;
      var closedY = computePanelClosedY(true);
      var closedYForTab = computePanelClosedY(false);

      tocPanel.style.transition = 'none';
      tocOverlay.style.transition = 'none';

      tocPanel.style.opacity = '0';
      tocOverlay.style.opacity = '0';

      setPanelTranslateY(openLift);

      tocPanel.style.opacity = '1';
      setPanelTranslateY(closedY);

      var raf = window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 0); };
      raf(function () {
        setToCTabDragOffset(0, false);

        tocPanel.style.transition = 'transform ' + snapMs + 'ms ' + snapEase + ', opacity ' + snapMs + 'ms ' + snapEase;
        tocOverlay.style.transition = 'opacity ' + snapMs + 'ms ' + snapEase;

        setPanelTranslateY(openLift);
        tocOverlay.style.opacity = '1';

        setToCTabDragOffset(openLift - closedYForTab, false);

        setTimeout(function () {
          tocPanel.style.transform = '';
          tocPanel.style.opacity = '';
          tocPanel.style.transition = '';
          tocOverlay.style.opacity = '';
          tocOverlay.style.transition = '';

          root.classList.remove('toc-opening');
          tapAnimating = false;
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

    cancelCloseWeldDrop();
    setRootWeldNudge(CLOSE_WELD_PX);

    root.classList.add('toc-open');
    root.classList.remove('toc-dock-settling');

    root.classList.add('toc-closing');
    root.classList.remove('toc-opening');

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

    var closedY = computePanelClosedY(false);
    var closedYForTab = closedY;

    tocPanel.style.transition = 'none';
    tocOverlay.style.transition = 'none';

    tocPanel.style.opacity = '1';
    tocOverlay.style.opacity = '1';

    setPanelTranslateY(openLift);

    setToCTabDragOffset(openLift - closedYForTab, true);

    var raf = window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 0); };
    raf(function () {
      setToCTabDragOffset(openLift - closedYForTab, false);

      tocPanel.style.transition = 'transform ' + snapMs + 'ms ' + snapEase + ', opacity ' + snapMs + 'ms ' + snapEase;
      tocOverlay.style.transition = 'opacity ' + snapMs + 'ms ' + snapEase;

      setPanelTranslateY(closedY);
      tocOverlay.style.opacity = '0';

      setToCTabDragOffset(-CLOSE_WELD_PX, false);

      setTimeout(function () {
        cancelCloseWeldDrop();
        clearRootWeldNudge();

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

        root.classList.remove('toc-open');
        root.classList.add('toc-dock-settling');
        root.classList.remove('toc-closing');

        setTimeout(function () {
          root.classList.remove('toc-dock-settling');
        }, snapMs + 30);

        clearToCTabDragOffset();

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

      // ESC clears staging first; ESC again closes.
      if (pendingPageId && !confirmNavigating) {
        stopEvent(e);
        clearPendingSelection();
        return;
      }

      closeToC(true);
    });

    window.addEventListener('resize', function () {
      if (tocPanel && tocPanel.classList.contains('is-open')) {
        positionPanel();
      }
    });

    window.addEventListener('orientationchange', function () {
      if (tocPanel && tocPanel.classList.contains('is-open')) {
        positionPanel();
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
  var allowed = enforceSoftGate();
  if (!allowed) return;
  unlockCurrentPage();

  if (!tocPanel || !tocOverlay || !tocToggle) {
    return;
  }

  registerWithUIStack();

  bindContentClicks();
  wireControls();
})();
