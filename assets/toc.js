/*! Covenant ToC v3.1.16 (Modal Veil + Footer Seal + Hold-to-Enter + Drag-to-Open/Close) */
(function () {
  'use strict';

  window.COVENANT_TOC_VERSION = '3.1.16';

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

  var scrollLockY = 0;
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
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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

  function setProducedTitle(title) {
    if (!tocProducedTitleEl) return;
    tocProducedTitleEl.textContent = String(title || '');
  }

  function setTocToggleOffset(dx, dy, draggingNow) {
    if (!tocToggle) return;

    // The tab "blink" at settle is often subpixel/compositor churn; keep settled values integer.
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

    // Keep custom props defined (at 0) to avoid a one-frame style pop on some browsers.
    tocToggle.style.setProperty('--toc-toggle-drag-x', '0px');
    tocToggle.style.setProperty('--toc-toggle-drag-y', '0px');
    tocToggle.classList.remove('is-toc-dragging');
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

  function computeOpenToggleDyFromPanelTop(openPanelTop, baseRect) {
    if (!baseRect) return 0;

    // Requirement: tab top edge flush with sheet top edge.
    var targetTop = openPanelTop;

    return targetTop - baseRect.top;
  }

  function getFooterReservedPx() {
    var total = readCssNumberVar('--footer-total-height');

    if (!total) {
      total = readCssNumberVar('--footer-height') + readCssNumberVar('--footer-safe');
    }

    if (!total) {
      var footer = document.querySelector('.nav-footer');
      if (footer && footer.getBoundingClientRect) {
        total = footer.getBoundingClientRect().height || 0;
      }
    }

    return Math.max(0, Math.round(total));
  }

  function positionPanel() {
    if (!tocPanel) return;

    var footerReserved = getFooterReservedPx();
    var topSafe = readCssNumberVar('--toc-top-safe');
    var gap = readCssNumberVar('--toc-panel-gap');

    var bottom = footerReserved + (gap || 0);
    var maxH = Math.max(240, Math.floor(window.innerHeight - bottom - (topSafe || 12)));

    tocPanel.style.bottom = bottom + 'px';
    tocPanel.style.maxHeight = maxH + 'px';

    // Mobile-only: anchor the sheet from the ToC tab's left edge to the viewport right edge.
    if (tocToggle && isMobileSheet()) {
      var rect = tocToggle.getBoundingClientRect();
      var left = Math.max(0, Math.round(rect.left));
      tocPanel.style.setProperty('--toc-panel-left', left + 'px');
      tocPanel.style.setProperty('--toc-panel-x', '0px');
    } else {
      tocPanel.style.removeProperty('--toc-panel-left');
      tocPanel.style.removeProperty('--toc-panel-x');
    }
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
    unlock(currentPageId);
  }

  function enforceSoftGate() {
    if (!currentPageId) return;
    if (!storageAvailable) return;

    var currentIdx = window.getJourneyIndex(currentPageId);
    if (currentIdx < 0) return;

    if (currentIdx <= maxIndexUnlocked + 1) return;

    console.warn('[Covenant ToC] Access denied to locked page:', currentPageId);
    window.location.href = 'invocation.html';
  }

  function isUnlockedJourneyIndex(i) {
    return typeof i === 'number' && i >= 0 && i <= maxIndexUnlocked;
  }

  // ---------------------------
  // Modal open/close + focus
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
      if (!tocPanel || !tocPanel.classList.contains('is-open')) return;
      if (closestSafe(e.target, '#tocPanel .toc-panel-body')) return;
      if (e && e.cancelable) e.preventDefault();
    };

    document.addEventListener('touchmove', iosTouchMoveBlocker, IOS_TOUCHMOVE_OPTS);
  }

  function disableIOSTouchScrollLock() {
    if (!iosTouchMoveBlocker) return;
    document.removeEventListener('touchmove', iosTouchMoveBlocker, IOS_TOUCHMOVE_OPTS);
    iosTouchMoveBlocker = null;
  }

  function getScrollLockTopPx() {
    try {
      var raw = document.body ? document.body.style.top : '';
      if (!raw) return 0;
      var n = parseInt(raw, 10);
      return isNaN(n) ? 0 : n;
    } catch (err) {
      return 0;
    }
  }

  function lockBodyScroll() {
    if (root.classList.contains('toc-scroll-lock') || document.body.classList.contains('toc-scroll-lock')) return;

    scrollLockY = window.scrollY || window.pageYOffset || 0;
    root.classList.add('toc-scroll-lock', 'toc-open');

    if (isIOS) enableIOSTouchScrollLock();

    document.body.classList.add('toc-scroll-lock');
    document.body.style.top = (-scrollLockY) + 'px';
  }

  function unlockBodyScroll() {
    var wasLocked = root.classList.contains('toc-scroll-lock') || document.body.classList.contains('toc-scroll-lock');
    var topPx = getScrollLockTopPx();
    var y = scrollLockY;

    if (!y && topPx) y = Math.abs(topPx);

    root.classList.remove('toc-scroll-lock', 'toc-open');

    if (isIOS) disableIOSTouchScrollLock();

    document.body.classList.remove('toc-scroll-lock');
    document.body.style.top = '';

    if (wasLocked && y) window.scrollTo(0, y);
  }

  function getPanelCloseMs() {
    var ms = readCssNumberVar('--toc-scroll-close-duration');
    if (ms && ms > 0) return ms;
    ms = readCssNumberVar('--toc-scroll-duration');
    if (ms && ms > 0) return ms;
    return 320;
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

  function setConfirmVisible(isVisible) {
    if (!tocConfirmBtn) return;

    if (isVisible) {
      tocConfirmBtn.hidden = false;
      tocConfirmBtn.disabled = false;
      tocConfirmBtn.setAttribute('aria-hidden', 'false');
    } else {
      tocConfirmBtn.disabled = true;
      tocConfirmBtn.hidden = true;
      tocConfirmBtn.setAttribute('aria-hidden', 'true');
    }

    if (tocPanel) tocPanel.classList.toggle('has-pending', !!isVisible);
  }

  function clearPendingSelection() {
    pendingHref = '';
    pendingPageId = '';
    pendingTitle = '';

    if (pendingItemEl && pendingItemEl.classList) {
      pendingItemEl.classList.remove('toc-item--pending');
    }

    pendingItemEl = null;
    setConfirmVisible(false);

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

  function stageSelection(pageId, href, title, itemEl) {
    if (!pageId || !href) return;
    if (pageId === currentPageId) return;

    if (pendingItemEl && pendingItemEl !== itemEl && pendingItemEl.classList) {
      pendingItemEl.classList.remove('toc-item--pending');
    }

    pendingHref = href;
    pendingPageId = pageId;
    pendingTitle = title || '';
    pendingItemEl = itemEl;

    if (pendingItemEl && pendingItemEl.classList) {
      pendingItemEl.classList.add('toc-item--pending');
    }

    if (pendingTitle) setProducedTitle(pendingTitle);

    setConfirmVisible(true);

    if (tocConfirmBtn) {
      tocConfirmBtn.textContent = 'Hold to Enter';
      tocConfirmBtn.setAttribute('aria-label', 'Hold to enter selected page');
    }
  }

  // ---------------------------
  // Hold-to-enter
  // ---------------------------

  function setHoldProgress(p) {
    if (!tocConfirmBtn) return;
    var clamped = Math.max(0, Math.min(1, p));
    tocConfirmBtn.style.setProperty('--toc-hold-p', String(clamped));
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

    if (tocConfirmBtn && tocConfirmBtn.classList) {
      tocConfirmBtn.classList.remove('is-holding');
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

  function beginHold(e) {
    if (!pendingHref || !tocConfirmBtn || tocConfirmBtn.disabled) return;

    stopEvent(e);

    if (holdTimer || holdStartedAt) return;

    holdStartedAt = Date.now();
    holdCompleted = false;

    tocConfirmBtn.classList.add('is-holding');
    setHoldProgress(0);

    holdRaf = requestAnimationFrame(tickHold);

    holdTimer = setTimeout(function () {
      holdTimer = null;
      holdCompleted = true;
      commitNavigation();
    }, HOLD_MS);
  }

  function endHold(e) {
    if (!holdStartedAt) return;

    stopEvent(e);

    if (holdCompleted) return;

    cancelHold();
  }

  function commitNavigation() {
    if (!pendingHref) {
      cancelHold();
      return;
    }

    confirmNavigating = true;

    if (tocConfirmBtn) tocConfirmBtn.disabled = true;

    closeToC(false);

    var href = pendingHref;
    var navDelay = Math.max(180, getPanelCloseMs());

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

    // Allow tap-to-open on iOS Safari by only initiating drag after MOVE_SLOP.
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

    var openDyWanted = 0;

    var panelHBase = 0;
    var closedOffsetPx = 0;
    var openLiftPx = 0;

    var MOVE_SLOP = 6;

    var OPEN_VELOCITY = -0.85;
    var OPEN_RATIO = 0.38;

    var CLOSE_VELOCITY = 0.85;
    var CLOSE_RATIO = 0.28;

    var SNAP_MS = readCssNumberVar('--toc-snap-duration');
    if (!SNAP_MS || SNAP_MS <= 0) SNAP_MS = 420;

    var SNAP_EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

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

      // Requirement: sheet stays opaque during drag-open AND drag-close.
      tocPanel.style.opacity = '1';

      if (tocOverlay) tocOverlay.style.opacity = String(progress);

      setTocToggleOffset(0, openDyWanted * progress, !!draggingNow);
    }

    function computeOpenDyForCurrentDragState(yNow) {
      if (!tocPanel) return 0;

      var base = getTocToggleBaseRect();
      if (!base) return 0;

      var rect = tocPanel.getBoundingClientRect();

      // Important: tab alignment is computed against the sheet's unlifted top,
      // so a fully-open lift applies to the sheet only (relative to the carried tab).
      var openTop = rect.top - (yNow || 0);

      return computeOpenToggleDyFromPanelTop(openTop, base);
    }

    function applyOpenStateFromDrag() {
      if (!tocPanel || !tocOverlay) return;

      if (!tocPanel.classList.contains('is-open')) {
        focusReturnEl = tocToggle;
        lockBodyScroll();

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
      }

      // Drag-open state is complete once the panel is open.
      root.classList.remove('toc-opening');
      root.classList.remove('toc-closing');
      root.classList.remove('toc-dock-settling');
    }

    function applyClosedStateFromDrag() {
      if (!tocPanel || !tocOverlay) return;

      if (tocPanel.classList.contains('is-open')) {
        disableFocusTrap();
        cancelHold();

        if (!confirmNavigating) clearPendingSelection();

        // Keep the footer sovereign until the close animation is finished.
        root.classList.add('toc-closing');

        tocPanel.classList.remove('is-open');
        tocPanel.classList.add('is-closing');
        tocOverlay.classList.remove('is-open');
        tocOverlay.setAttribute('aria-hidden', 'true');

        if (tocToggle) {
          tocToggle.classList.remove('is-open');
          tocToggle.setAttribute('aria-expanded', 'false');
          tocToggle.setAttribute('aria-label', 'Open Contents');
        }

        // iOS Safari: keep close cleanup aligned with the snap transform duration to avoid one-frame flicker.
        var closeMs = Math.max(180, getPanelCloseMs(), SNAP_MS);
        setTimeout(function () {
          if (!tocPanel) return;

          tocPanel.classList.remove('is-closing');
          tocPanel.setAttribute('aria-hidden', 'true');

          // Clear drag/snap inline styles only after is-closing is gone (prevents a 1-frame jump).
          tocPanel.style.transform = '';
          tocPanel.style.opacity = '';
          tocPanel.style.transition = '';
          if (tocOverlay) {
            tocOverlay.style.opacity = '';
            tocOverlay.style.transition = '';
          }

          unlockBodyScroll();

          // Drag-close already has the tab at dy=0, but keep layering stable for a beat anyway.
          var snapMs = readCssNumberVar('--toc-snap-duration');
          if (!snapMs || snapMs <= 0) snapMs = 420;
          root.classList.add('toc-dock-settling');

          root.classList.remove('toc-closing');

          setTimeout(function () {
            root.classList.remove('toc-dock-settling');
          }, snapMs + 30);

          var target = (focusReturnEl && document.contains(focusReturnEl)) ? focusReturnEl : tocToggle;
          if (target && target.focus) target.focus();
          focusReturnEl = null;
        }, closeMs + 30);
      }
    }

    function snap() {
      if (!tocPanel) return;

      var shouldOpen = false;
      var baseH = panelHBase || closedY || 1;

      if (startWasOpen) {
        var dragDown = currentY - openLiftPx;
        shouldOpen = !(velocity > CLOSE_VELOCITY || dragDown > baseH * CLOSE_RATIO);
      } else {
        var dragUp = closedY - currentY;
        shouldOpen = (velocity < OPEN_VELOCITY || dragUp > baseH * OPEN_RATIO);
      }

      tocPanel.style.transition = 'transform ' + SNAP_MS + 'ms ' + SNAP_EASE + ', opacity ' + SNAP_MS + 'ms ' + SNAP_EASE;
      if (tocOverlay) tocOverlay.style.transition = 'opacity ' + SNAP_MS + 'ms ' + SNAP_EASE;

      if (shouldOpen) {
        applyDragFrame(openLiftPx, false);
        applyOpenStateFromDrag();

        setTimeout(function () {
          if (!tocPanel) return;
          var firstBtn = tocPanel.querySelector('.toc-item-btn:not([disabled]), .toc-locked-btn');
          if (firstBtn && firstBtn.focus) firstBtn.focus();
          else if (tocPanel.focus) tocPanel.focus();
        }, 0);
      } else {
        // Ensure the dock stays above the sheet for the full snap-down (even if not "open").
        if (!startWasOpen) root.classList.add('toc-opening');

        setTocToggleOffset(0, 0, false);
        applyDragFrame(closedY, false);
        applyClosedStateFromDrag();
      }

      setTimeout(function () {
        if (!tocPanel) return;

        // For drag-close, inline styles are cleared by the close cleanup (after is-closing is removed).
        if (shouldOpen || !startWasOpen) {
          tocPanel.style.transform = '';
          tocPanel.style.opacity = '';
          tocPanel.style.transition = '';
          if (tocOverlay) {
            tocOverlay.style.opacity = '';
            tocOverlay.style.transition = '';
          }
        }

        // If we snapped shut from a closed-start drag, we are done "opening" now.
        if (!shouldOpen && !startWasOpen) root.classList.remove('toc-opening');
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

      // Ensure layout constraints are applied before we measure height.
      positionPanel();

      computeOpenLift();

      // If we are starting from closed, we are "opening" (even before fully open).
      if (!startWasOpen) {
        root.classList.remove('toc-closing');
        root.classList.add('toc-opening');
        root.classList.remove('toc-dock-settling');
        renderToC();
      }

      computeClosedY();

      currentY = startWasOpen ? openLiftPx : closedY;

      tocPanel.classList.add('is-dragging');
      if (tocToggle) tocToggle.classList.add('is-toc-dragging');

      tocPanel.style.transition = 'none';
      if (tocOverlay) tocOverlay.style.transition = 'none';

      // Make sure the panel is at the expected start transform before measuring open-top.
      tocPanel.style.transform = 'translateX(var(--toc-panel-x, -50%)) translateY(' + currentY + 'px)';

      // Precompute the tab's open offset once, so move frames stay cheap and "vertical only".
      openDyWanted = computeOpenDyForCurrentDragState(currentY);

      applyDragFrame(currentY, true);

      var captureTarget = (source === 'seal') ? tocToggle : tocDragRegion;
      if (captureTarget && captureTarget.setPointerCapture) {
        try { captureTarget.setPointerCapture(e.pointerId); } catch (err) {}
      }

      // Only prevent default once drag has actually begun.
      if (e && e.preventDefault) e.preventDefault();
    }

    function moveDrag(e) {
      if (!dragging || e.pointerId !== pointerId) return;

      var deltaY = e.clientY - startY;
      if (!moved && Math.abs(deltaY) > MOVE_SLOP) {
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
      if (tocToggle) tocToggle.classList.remove('is-toc-dragging');

      if (moved) {
        window.__COVENANT_TOC_DRAG_JUST_HAPPENED = true;
        setTimeout(function () { window.__COVENANT_TOC_DRAG_JUST_HAPPENED = false; }, 300);
        snap();
      } else {
        // No drag gesture actually happened (likely a click); clear transient state.
        root.classList.remove('toc-opening');
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

      // Prime a possible drag, but do not preventDefault so a tap can still produce a click.
      // Still capture the pointer so iOS doesn't drop pointermove events mid-gesture.
      sealPrimed = true;
      sealPointerId = e.pointerId;
      sealStartY = e.clientY;

      if (tocToggle && tocToggle.setPointerCapture) {
        try { tocToggle.setPointerCapture(e.pointerId); } catch (err) {}
      }
    });

    tocToggle.addEventListener('pointermove', function (e) {
      // If drag is already active, keep moving.
      if (dragging) {
        moveDrag(e);
        return;
      }

      if (!sealPrimed || e.pointerId !== sealPointerId) return;

      var dy = e.clientY - sealStartY;
      if (Math.abs(dy) <= MOVE_SLOP) return;

      // Promote to an actual drag.
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
      if (!itemBtn) return;

      var itemEl = closestSafe(itemBtn, '.toc-item');
      var pageId = itemEl ? itemEl.getAttribute('data-page-id') : '';

      if (pageId && pageId === currentPageId) {
        stopEvent(e);
        clearPendingSelection();
        return;
      }

      var href = itemBtn.getAttribute('data-href');
      if (!href || !pageId) return;

      stopEvent(e);

      var title = String(itemBtn.textContent || '').trim();
      stageSelection(pageId, href, title, itemEl);
    });
  }

  function openToC() {
    if (!tocPanel || !tocOverlay) return;

    if (window.__COVENANT_TOC_DRAG_JUST_HAPPENED) {
      window.__COVENANT_TOC_DRAG_JUST_HAPPENED = false;
      return;
    }

    confirmNavigating = false;
    cancelHold();

    focusReturnEl = tocToggle;

    root.classList.remove('toc-closing');
    root.classList.remove('toc-dock-settling');

    lockBodyScroll();
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

    // Carry the tab up into its attached position (vertical-only alignment with dock column).
    var raf = window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 0); };
    raf(function () {
      var base = getTocToggleBaseRect();
      if (!base || !tocPanel || !tocPanel.getBoundingClientRect) return;
      var rect = tocPanel.getBoundingClientRect();

      // Align tab to the sheet's unlifted top so the open lift applies to the sheet only.
      var openLift = readCssNumberVar('--toc-open-lift');
      var targetTop = rect.top - (openLift || 0);

      var dy = computeOpenToggleDyFromPanelTop(targetTop, base);
      setTocToggleOffset(0, dy, false);
    });

    setTimeout(function () {
      var firstBtn = tocPanel.querySelector('.toc-item-btn:not([disabled]), .toc-locked-btn');
      if (firstBtn && firstBtn.focus) firstBtn.focus();
      else if (tocPanel.focus) tocPanel.focus();
    }, 0);
  }

  function closeToC(restoreFocus) {
    if (!tocPanel || !tocOverlay) return;

    disableFocusTrap();
    cancelHold();

    if (!confirmNavigating) {
      clearPendingSelection();
    }

    // Clear any previous "settle" phase.
    root.classList.remove('toc-dock-settling');

    // Keep footer above sheet until close fully completes.
    root.classList.add('toc-closing');
    root.classList.remove('toc-opening');

    tocPanel.classList.remove('is-open');
    tocPanel.classList.add('is-closing');
    tocOverlay.classList.remove('is-open');

    tocOverlay.setAttribute('aria-hidden', 'true');

    if (tocToggle) {
      tocToggle.classList.remove('is-open');
      tocToggle.setAttribute('aria-expanded', 'false');
      tocToggle.setAttribute('aria-label', 'Open Contents');
    }

    var closeMs = Math.max(180, getPanelCloseMs());

    setTimeout(function () {
      tocPanel.classList.remove('is-closing');
      tocPanel.setAttribute('aria-hidden', 'true');
      unlockBodyScroll();

      // Keep a tiny "settling" window so z-layer + hover state do not flip mid tab-transition.
      var snapMs = readCssNumberVar('--toc-snap-duration');
      if (!snapMs || snapMs <= 0) snapMs = 420;
      root.classList.add('toc-dock-settling');

      root.classList.remove('toc-closing');

      // Return the tab to the dock once the sheet is gone.
      clearTocToggleOffset();

      setTimeout(function () {
        root.classList.remove('toc-dock-settling');
      }, snapMs + 30);

      if (restoreFocus) {
        var target = (focusReturnEl && document.contains(focusReturnEl)) ? focusReturnEl : tocToggle;
        if (target && target.focus) target.focus();
      }

      focusReturnEl = null;
    }, closeMs + 30);
  }

  function toggleToC() {
    if (tocPanel && (tocPanel.classList.contains('is-open') || tocPanel.classList.contains('is-closing'))) {
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

    if (tocConfirmBtn) {
      tocConfirmBtn.addEventListener('pointerdown', beginHold);
      tocConfirmBtn.addEventListener('pointerup', endHold);
      tocConfirmBtn.addEventListener('pointercancel', endHold);
      tocConfirmBtn.addEventListener('pointerleave', endHold);

      tocConfirmBtn.addEventListener('keydown', function (e) {
        if (!e) return;
        if (e.key === ' ' || e.key === 'Enter') beginHold(e);
      });
      tocConfirmBtn.addEventListener('keyup', function (e) {
        if (!e) return;
        if (e.key === ' ' || e.key === 'Enter') endHold(e);
      });

      tocConfirmBtn.addEventListener('click', function (e) {
        stopEvent(e);
      });
    }

    if (tocOverlay) {
      tocOverlay.addEventListener('click', function (e) {
        stopEvent(e);
        closeToC(true);
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && tocPanel && tocPanel.classList.contains('is-open')) closeToC(true);
    });

    function recomputeOpenTabOffset() {
      if (!tocPanel || !tocPanel.classList.contains('is-open')) return;

      var raf = window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 0); };
      raf(function () {
        var base = getTocToggleBaseRect();
        if (!base || !tocPanel || !tocPanel.getBoundingClientRect) return;
        var rect = tocPanel.getBoundingClientRect();

        // Align tab to the sheet's unlifted top so the open lift applies to the sheet only.
        var openLift = readCssNumberVar('--toc-open-lift');
        var targetTop = rect.top - (openLift || 0);

        var dy = computeOpenToggleDyFromPanelTop(targetTop, base);
        setTocToggleOffset(0, dy, false);
      });
    }

    window.addEventListener('resize', function () {
      if (tocPanel && tocPanel.classList.contains('is-open')) {
        positionPanel();
        recomputeOpenTabOffset();
      }
    });

    window.addEventListener('orientationchange', function () {
      if (tocPanel && tocPanel.classList.contains('is-open')) {
        positionPanel();
        recomputeOpenTabOffset();
      }
    });

    window.addEventListener('blur', function () {
      if (tocPanel && tocPanel.classList.contains('is-open')) closeToC(false);
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && tocPanel && tocPanel.classList.contains('is-open')) closeToC(false);
    });
  }

  // ---------------------------
  // Init
  // ---------------------------

  loadProgress();
  enforceSoftGate();
  unlockCurrentPage();

  if (!tocPanel || !tocOverlay || !tocToggle) {
    return;
  }

  bindContentClicks();
  wireControls();
})();
