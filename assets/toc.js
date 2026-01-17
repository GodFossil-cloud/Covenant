/*! Covenant ToC v2.5.1 (Divider Clasp + Focus Trap + Mobile Staging) */
(function () {
  'use strict';

  window.COVENANT_TOC_VERSION = '2.5.1';

  if (!window.COVENANT_JOURNEY || !window.getJourneyIndex) {
    console.warn('[Covenant ToC] Journey definition not found; ToC disabled.');
    return;
  }

  var STORAGE_KEY = 'covenant_progress';
  var STORAGE_VERSION = 1;

  var LOCKED_TOOLTIP = 'In due time…';

  var pageConfig = window.COVENANT_PAGE || {};
  var currentPageId = pageConfig.pageId || '';

  var tocPanel = document.getElementById('tocPanel');
  var tocOverlay = document.getElementById('tocOverlay');
  var tocToggle = document.getElementById('tocToggle');
  var tocDynamicContent = document.getElementById('tocDynamicContent');
  var tocLiveRegion = document.getElementById('tocLiveRegion');
  var tocToast = document.getElementById('tocToast');
  var tocConfirmBtn = document.getElementById('tocConfirm');
  var tocProducedTitleEl = document.getElementById('tocProducedTitle');

  var root = document.documentElement;
  var scrollLockY = 0;

  var tocClasp = document.getElementById('tocClasp');
  var containerEl = document.querySelector('.container');

  var storageAvailable = false;
  var maxIndexUnlocked = -1;
  var inMemoryFallback = -1;

  var tocJustOpenedAt = 0;
  var TOC_GHOST_GUARD_MS = 520;

  var focusReturnEl = null;
  var contentClickBound = false;

  var toastTimer = null;
  var TOC_TOAST_VISIBLE_MS = 2600;

  var TOC_BOTTOM_GAP_PX = 0;

  var sealClosingTimer = null;
  var panelClosingTimer = null;

  var pendingHref = '';
  var pendingPageId = '';
  var pendingTitle = '';
  var pendingItemEl = null;
  var baseHeaderTitle = '';
  var confirmNavigating = false;

  var producedRevealRaf1 = 0;
  var producedRevealRaf2 = 0;

  var focusTrapEnabled = false;
  var focusTrapHandler = null;

  var stage1Timer = null;
  var stage2Timer = null;
  var focusTimer = null;

  var claspRaf = 0;

  window.__COVENANT_TOC_DRAG_JUST_HAPPENED = false;

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

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
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

  function setClaspPull(px) {
    if (!root) return;
    root.style.setProperty('--toc-clasp-pull', Math.round(px) + 'px');
  }

  function resetClaspPull() {
    setClaspPull(0);
  }

  function cancelProducedReveal() {
    if (producedRevealRaf1) {
      cancelAnimationFrame(producedRevealRaf1);
      producedRevealRaf1 = 0;
    }
    if (producedRevealRaf2) {
      cancelAnimationFrame(producedRevealRaf2);
      producedRevealRaf2 = 0;
    }
  }

  function setProducedLatent(isLatent) {
    if (!tocPanel || !tocPanel.classList) return;
    tocPanel.classList.toggle('toc-produced-latent', !!isLatent);
  }

  function setBodyLatent(isLatent) {
    if (!tocPanel || !tocPanel.classList) return;
    tocPanel.classList.toggle('toc-body-latent', !!isLatent);
  }

  function clearStageTimers() {
    if (stage1Timer) { clearTimeout(stage1Timer); stage1Timer = null; }
    if (stage2Timer) { clearTimeout(stage2Timer); stage2Timer = null; }
    if (focusTimer) { clearTimeout(focusTimer); focusTimer = null; }
  }

  function scheduleProducedReveal() {
    if (!tocPanel || !tocPanel.classList) return;

    cancelProducedReveal();

    producedRevealRaf1 = requestAnimationFrame(function () {
      producedRevealRaf1 = 0;
      producedRevealRaf2 = requestAnimationFrame(function () {
        producedRevealRaf2 = 0;
        if (!tocPanel || !tocPanel.classList) return;
        tocPanel.classList.remove('toc-produced-latent');
      });
    });
  }

  function scheduleProducedRevealAfter(ms) {
    if (!ms || ms <= 0) {
      scheduleProducedReveal();
      return;
    }

    stage1Timer = setTimeout(function () {
      stage1Timer = null;
      scheduleProducedReveal();
    }, ms);
  }

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

  var headerEl = document.querySelector('.section-header');
  var headerTitleEl = headerEl ? headerEl.querySelector('h1') : null;

  function computeClaspSeatTop() {
    var v = readCssNumberVar('--toc-clasp-seat-top');
    return Math.max(0, Math.round(v || 0));
  }

  function isTopOfPageTitleUsable() {
    if (!headerTitleEl || !headerTitleEl.getBoundingClientRect) return false;
    var seat = computeClaspSeatTop();
    var r = headerTitleEl.getBoundingClientRect();
    return (r.bottom > seat + 14);
  }

  function scheduleClaspPosition() {
    if (!root) return;
    if (claspRaf) return;

    claspRaf = requestAnimationFrame(function () {
      claspRaf = 0;
      positionClasp();

      if (tocPanel && tocPanel.classList.contains('is-open')) {
        positionDropdownPanel();
      }
    });
  }

  function positionClasp() {
    if (!tocClasp) return;

    var seatTop = computeClaspSeatTop();

    // While scroll is locked (ToC open/closing), keep the clasp seated.
    if (root && root.classList.contains('toc-scroll-lock')) {
      tocClasp.style.top = seatTop + 'px';
      root.classList.add('toc-clasp-sticky');
      return;
    }

    if (!containerEl) containerEl = document.querySelector('.container');

    // Width + left match the content container.
    if (containerEl && containerEl.getBoundingClientRect) {
      var c = containerEl.getBoundingClientRect();
      tocClasp.style.left = Math.round(c.left) + 'px';
      tocClasp.style.width = Math.round(c.width) + 'px';
    } else {
      tocClasp.style.left = '0px';
      tocClasp.style.width = '100%';
    }

    // Track the divider line under the journey header.
    var lineY = seatTop;
    if (headerEl && headerEl.getBoundingClientRect) {
      lineY = Math.round(headerEl.getBoundingClientRect().bottom);
    }

    var y = Math.max(seatTop, lineY);
    tocClasp.style.top = y + 'px';

    var isSticky = (lineY <= seatTop + 1);
    root.classList.toggle('toc-clasp-sticky', isSticky);
  }

  function getPanelCloseMs() {
    var ms = readCssNumberVar('--toc-scroll-close-duration');
    if (ms && ms > 0) return ms;
    ms = readCssNumberVar('--toc-scroll-duration');
    if (ms && ms > 0) return ms;
    return 320;
  }

  function armSealClosingLayer() {
    if (!root) return;

    if (sealClosingTimer) {
      clearTimeout(sealClosingTimer);
      sealClosingTimer = null;
    }

    root.classList.add('toc-closing');

    var snapMs = readCssNumberVar('--lexicon-snap-duration') || 420;
    sealClosingTimer = setTimeout(function () {
      root.classList.remove('toc-closing');
      sealClosingTimer = null;
    }, Math.max(160, snapMs + 20));
  }

  function clearSealClosingLayer() {
    if (!root) return;
    if (sealClosingTimer) {
      clearTimeout(sealClosingTimer);
      sealClosingTimer = null;
    }
    root.classList.remove('toc-closing');
  }

  function clearPanelClosingTimer() {
    if (!panelClosingTimer) return;
    clearTimeout(panelClosingTimer);
    panelClosingTimer = null;
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

  function withinGhostGuardWindow() {
    return tocJustOpenedAt && (Date.now() - tocJustOpenedAt < TOC_GHOST_GUARD_MS);
  }

  function announceLockedAttempt() {
    announce(LOCKED_TOOLTIP);
  }

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

  function getJourneyPageTitleById(pageId) {
    if (!pageId) return '';
    for (var i = 0; i < window.COVENANT_JOURNEY.length; i++) {
      var p = window.COVENANT_JOURNEY[i];
      if (p && p.id === pageId) return String(p.title || '').trim();
    }
    return '';
  }

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

  function setHeaderTitle(title) {
    if (!headerTitleEl) return;
    headerTitleEl.textContent = String(title || '');
  }

  function clearPendingSelection(restoreTitle) {
    pendingHref = '';
    pendingPageId = '';
    pendingTitle = '';

    if (pendingItemEl && pendingItemEl.classList) {
      pendingItemEl.classList.remove('toc-item--pending');
    }

    pendingItemEl = null;

    setConfirmVisible(false);

    if (restoreTitle && baseHeaderTitle) {
      setHeaderTitle(baseHeaderTitle);
      setProducedTitle(baseHeaderTitle);
    }
  }

  function stageSelection(pageId, href, title, itemEl) {
    if (!pageId || !href) return;
    if (pageId === currentPageId) return;

    if (!baseHeaderTitle && headerTitleEl) {
      baseHeaderTitle = String(headerTitleEl.textContent || '');
    }

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

    if (pendingTitle) {
      setHeaderTitle(pendingTitle);
      setProducedTitle(pendingTitle);
    }

    setConfirmVisible(true);
  }

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

  function ensureToggleExists() {
    if (tocToggle && tocClasp) return;
    if (!tocPanel) return;

    // Clasp container (tracks the header divider)
    if (!tocClasp) {
      tocClasp = document.createElement('div');
      tocClasp.id = 'tocClasp';
      tocClasp.className = 'toc-clasp';
      document.body.appendChild(tocClasp);
    }

    if (!tocToggle) {
      var btn = document.createElement('button');
      btn.id = 'tocToggle';
      btn.type = 'button';
      btn.className = 'toc-toggle toc-toggle--clasp';
      btn.setAttribute('aria-label', 'Open Contents');
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-controls', 'tocPanel');
      btn.innerHTML = '<span class="toc-toggle-glyph" aria-hidden="true">☰</span><span class="sr-only">Toggle Contents</span>';

      tocClasp.appendChild(btn);
      tocToggle = btn;

      root.classList.add('toc-clasp-under');
      resetClaspPull();

      scheduleClaspPosition();
      setTimeout(scheduleClaspPosition, 0);
      setTimeout(scheduleClaspPosition, 250);
    }
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

    scheduleClaspPosition();
  }

  function unlockBodyScroll() {
    var wasLocked = root.classList.contains('toc-scroll-lock') || document.body.classList.contains('toc-scroll-lock');
    var topPx = getScrollLockTopPx();
    var y = scrollLockY;

    if (!y && topPx) {
      y = Math.abs(topPx);
    }

    root.classList.remove('toc-scroll-lock', 'toc-open');

    if (isIOS) disableIOSTouchScrollLock();

    document.body.classList.remove('toc-scroll-lock');
    document.body.style.top = '';

    if (wasLocked && y) {
      window.scrollTo(0, y);
    }

    scheduleClaspPosition();
  }

  function clearStaleScrollLock() {
    var locked = root.classList.contains('toc-scroll-lock') || document.body.classList.contains('toc-scroll-lock');
    if (!locked) return;

    var panelBusy = tocPanel && (tocPanel.classList.contains('is-open') || tocPanel.classList.contains('is-closing'));
    if (panelBusy) return;

    unlockBodyScroll();
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

  function bindContentClicks() {
    if (contentClickBound) return;
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
        clearPendingSelection(true);
        return;
      }

      var href = itemBtn.getAttribute('data-href');
      if (!href) return;
      if (!pageId) return;

      stopEvent(e);

      var title = getJourneyPageTitleById(pageId) || String(itemBtn.textContent || '').trim();
      stageSelection(pageId, href, title, itemEl);
    });

    contentClickBound = true;
  }

  function positionDropdownPanel() {
    if (!tocPanel) return;

    var seatTop = computeClaspSeatTop();
    var topPx = seatTop;

    if (tocClasp && tocClasp.getBoundingClientRect) {
      var r = tocClasp.getBoundingClientRect();
      topPx = Math.round(r.top) + 2;
      topPx = Math.max(seatTop, topPx);
    } else if (headerEl && headerEl.getBoundingClientRect) {
      topPx = Math.round(headerEl.getBoundingClientRect().bottom);
      topPx = Math.max(seatTop, topPx);
    }

    var footerReserved = getFooterReservedPx();
    var safeBottomLimit = Math.max(0, window.innerHeight - footerReserved - TOC_BOTTOM_GAP_PX);
    var available = safeBottomLimit - topPx;

    // Keep the panel as a scroll (not full-screen): clamp to the CSS intent (70vh).
    var vh = window.innerHeight || 0;
    var maxByVh = vh ? Math.floor(vh * 0.70) : 0;

    var maxH = Math.max(0, Math.floor(available));
    if (maxByVh > 0) maxH = Math.min(maxH, maxByVh);
    maxH = Math.max(220, maxH);

    tocPanel.style.top = topPx + 'px';
    tocPanel.style.maxHeight = maxH + 'px';

    scheduleClaspPosition();
  }

  function openToC() {
    if (!tocPanel || !tocOverlay) return;

    confirmNavigating = false;

    clearStageTimers();
    cancelProducedReveal();

    var topOfPage = isTopOfPageTitleUsable();

    if (headerTitleEl) baseHeaderTitle = String(headerTitleEl.textContent || '');
    if (baseHeaderTitle) setProducedTitle(baseHeaderTitle);

    clearPendingSelection(false);

    clearSealClosingLayer();
    clearPanelClosingTimer();

    tocJustOpenedAt = Date.now();
    focusReturnEl = tocToggle;

    // Flip to the top side of the divider.
    root.classList.remove('toc-clasp-under');
    root.classList.add('toc-clasp-over');

    setProducedLatent(!topOfPage);
    setBodyLatent(!topOfPage);

    lockBodyScroll();
    positionDropdownPanel();

    tocPanel.classList.remove('is-closing');
    tocPanel.classList.add('is-open');
    tocOverlay.classList.add('is-open');

    tocPanel.setAttribute('aria-hidden', 'false');
    tocOverlay.setAttribute('aria-hidden', 'false');

    if (tocToggle) {
      tocToggle.setAttribute('aria-expanded', 'true');
      tocToggle.setAttribute('aria-label', 'Close Contents');
    }

    renderToC();

    if (!topOfPage) {
      var producedMs = 260;
      var revealDelay = 90;

      scheduleProducedRevealAfter(revealDelay);

      var stage1End = Math.max(revealDelay + producedMs, 260) + 30;
      stage2Timer = setTimeout(function () {
        stage2Timer = null;
        setBodyLatent(false);
      }, stage1End);

      focusTimer = setTimeout(function () {
        focusTimer = null;
        enableFocusTrap();
        var firstBtn = tocPanel.querySelector('.toc-item-btn:not([disabled]), .toc-locked-btn');
        if (firstBtn && firstBtn.focus) firstBtn.focus();
        else if (tocPanel.focus) tocPanel.focus();
      }, stage1End + 20);

      return;
    }

    setProducedLatent(false);
    setBodyLatent(false);

    enableFocusTrap();

    setTimeout(function () {
      var firstBtn = tocPanel.querySelector('.toc-item-btn:not([disabled]), .toc-locked-btn');
      if (firstBtn && firstBtn.focus) firstBtn.focus();
      else if (tocPanel.focus) tocPanel.focus();
    }, 0);
  }

  function closeToC(restoreFocus) {
    if (!tocPanel || !tocOverlay) return;

    disableFocusTrap();

    clearStageTimers();
    cancelProducedReveal();
    setProducedLatent(false);

    setBodyLatent(true);

    if (!confirmNavigating) {
      clearPendingSelection(true);
    }

    armSealClosingLayer();
    clearPanelClosingTimer();

    // Return to underside of divider.
    root.classList.remove('toc-clasp-over');
    root.classList.add('toc-clasp-under');

    if (root) root.classList.remove('toc-open');

    tocPanel.classList.remove('is-open');
    tocPanel.classList.add('is-closing');
    tocOverlay.classList.remove('is-open');

    tocOverlay.setAttribute('aria-hidden', 'true');

    if (tocToggle) {
      tocToggle.setAttribute('aria-expanded', 'false');
      tocToggle.setAttribute('aria-label', 'Open Contents');
    }

    var closeMs = Math.max(180, getPanelCloseMs());

    panelClosingTimer = setTimeout(function () {
      tocPanel.classList.remove('is-closing');
      tocPanel.setAttribute('aria-hidden', 'true');
      unlockBodyScroll();

      setBodyLatent(false);

      if (restoreFocus) {
        var target = (focusReturnEl && document.contains(focusReturnEl)) ? focusReturnEl : tocToggle;
        if (target && target.focus) target.focus();
      }

      focusReturnEl = null;
      panelClosingTimer = null;

      scheduleClaspPosition();
    }, closeMs + 30);
  }

  function toggleToC() {
    if (tocPanel && (tocPanel.classList.contains('is-open') || tocPanel.classList.contains('is-closing'))) {
      closeToC(true);
    } else {
      openToC();
    }
  }

  function setTitleSheen(isOn) {
    if (!headerEl) return;
    headerEl.classList.toggle('toc-title-sheen', !!isOn);
  }

  function bindActivate(el, handler) {
    if (!el || !handler) return;

    var lastPointerDownAt = 0;

    if (window.PointerEvent) {
      el.addEventListener('pointerdown', function (e) {
        if (e && e.pointerType === 'mouse' && typeof e.button === 'number' && e.button !== 0) return;
        if (e && e.pointerType === 'touch') {
          lastPointerDownAt = Date.now();
          handler(e);
        }
      });
    }

    el.addEventListener('click', function (e) {
      if (Date.now() - lastPointerDownAt < 700) return;
      handler(e);
    });
  }

  function wireClaspPull() {
    if (!tocToggle) return;
    if (!window.PointerEvent) return;

    var dragging = false;
    var moved = false;
    var pointerId = null;

    var startY = 0;
    var lastY = 0;

    var MOVE_SLOP = 6;
    var PULL_MAX = readCssNumberVar('--toc-clasp-max-pull') || 46;
    var ARM_AT = readCssNumberVar('--toc-clasp-arm-at') || 28;

    function begin(e) {
      if (!e) return;
      if (e.pointerType === 'mouse') return;

      // Pull gesture is for opening only (Phase 1).
      var startWasOpen = !!(tocPanel && tocPanel.classList && tocPanel.classList.contains('is-open'));
      if (startWasOpen) return;

      dragging = true;
      moved = false;
      pointerId = e.pointerId;

      startY = e.clientY || 0;
      lastY = startY;

      root.classList.add('toc-clasp-pulling');
      root.classList.remove('toc-clasp-armed');

      try { tocToggle.setPointerCapture(pointerId); } catch (err) {}
    }

    function move(e) {
      if (!dragging || !e || e.pointerId !== pointerId) return;

      var y = e.clientY || 0;
      var dy = y - startY;

      if (dy < 0) dy = 0;

      if (!moved) {
        if (dy < MOVE_SLOP) return;
        moved = true;
        window.__COVENANT_TOC_DRAG_JUST_HAPPENED = true;
      }

      lastY = y;

      var pull = clamp(dy, 0, PULL_MAX);
      setClaspPull(pull);

      if (pull >= ARM_AT) root.classList.add('toc-clasp-armed');
      else root.classList.remove('toc-clasp-armed');

      if (e.cancelable) e.preventDefault();
    }

    function end(e) {
      if (!dragging || (e && e.pointerId !== pointerId)) return;

      dragging = false;
      root.classList.remove('toc-clasp-pulling');

      var armed = root.classList.contains('toc-clasp-armed');
      root.classList.remove('toc-clasp-armed');

      resetClaspPull();

      if (moved) {
        setTimeout(function () { window.__COVENANT_TOC_DRAG_JUST_HAPPENED = false; }, 320);
      }

      if (armed) {
        openToC();
      }

      if (e && tocToggle.hasPointerCapture && tocToggle.hasPointerCapture(pointerId)) {
        try { tocToggle.releasePointerCapture(pointerId); } catch (err) {}
      }

      pointerId = null;
    }

    tocToggle.addEventListener('pointerdown', begin, { passive: true });
    tocToggle.addEventListener('pointermove', move, { passive: false });
    tocToggle.addEventListener('pointerup', end, { passive: true });
    tocToggle.addEventListener('pointercancel', end, { passive: true });
    tocToggle.addEventListener('lostpointercapture', end, { passive: true });
  }

  function wireControls() {
    if (tocToggle) {
      tocToggle.addEventListener('mouseenter', function () { setTitleSheen(true); });
      tocToggle.addEventListener('mouseleave', function () { setTitleSheen(false); });
      tocToggle.addEventListener('focus', function () { setTitleSheen(true); });
      tocToggle.addEventListener('blur', function () { setTitleSheen(false); });

      tocToggle.addEventListener('click', function (e) {
        if (window.__COVENANT_TOC_DRAG_JUST_HAPPENED) return;
        stopEvent(e);
        toggleToC();
      });

      wireClaspPull();
    }

    if (tocConfirmBtn) {
      tocConfirmBtn.addEventListener('click', function (e) {
        if (!pendingHref) return;
        stopEvent(e);

        confirmNavigating = true;
        if (tocConfirmBtn) tocConfirmBtn.disabled = true;

        closeToC(false);

        var href = pendingHref;
        var navDelay = Math.max(180, getPanelCloseMs());

        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            setTimeout(function () {
              window.location.href = href;
            }, navDelay);
          });
        });
      });
    }

    if (tocOverlay) {
      bindActivate(tocOverlay, function (e) {
        if (withinGhostGuardWindow()) {
          stopEvent(e);
          return;
        }
        stopEvent(e);
        closeToC(true);
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && tocPanel && tocPanel.classList.contains('is-open')) closeToC(true);
    });

    window.addEventListener('scroll', scheduleClaspPosition, { passive: true });

    window.addEventListener('resize', function () {
      scheduleClaspPosition();
      if (tocPanel && tocPanel.classList.contains('is-open')) {
        positionDropdownPanel();
      }
    });

    window.addEventListener('orientationchange', function () {
      scheduleClaspPosition();
      if (tocPanel && tocPanel.classList.contains('is-open')) {
        positionDropdownPanel();
      }
    });

    window.addEventListener('blur', function () {
      if (tocPanel && tocPanel.classList.contains('is-open')) closeToC(false);
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && tocPanel && tocPanel.classList.contains('is-open')) closeToC(false);
    });
  }

  loadProgress();
  enforceSoftGate();
  unlockCurrentPage();

  ensureToggleExists();
  bindContentClicks();

  if (!baseHeaderTitle && headerTitleEl) {
    baseHeaderTitle = String(headerTitleEl.textContent || '');
  }
  if (baseHeaderTitle) setProducedTitle(baseHeaderTitle);

  clearStaleScrollLock();

  scheduleClaspPosition();
  wireControls();
})();
