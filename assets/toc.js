/*! Covenant ToC Basic Dropdown v2.2.3 (Cathedral Index: Single Progress Gate) */
(function () {
  'use strict';

  // Tiny global version marker for compatibility checks.
  window.COVENANT_TOC_VERSION = '2.2.3';

  if (!window.COVENANT_JOURNEY || !window.getJourneyIndex) {
    console.warn('[Covenant ToC] Journey definition not found; ToC disabled.');
    return;
  }

  var STORAGE_KEY = 'covenant_progress';
  var STORAGE_VERSION = 1;

  // Used for native tooltips (desktop) and for the touch-friendly toast (mobile).
  var LOCKED_TOOLTIP = 'In due time. 🚸';

  var pageConfig = window.COVENANT_PAGE || {};
  var currentPageId = pageConfig.pageId || '';

  var tocPanel = document.getElementById('tocPanel');
  var tocOverlay = document.getElementById('tocOverlay');
  var tocToggle = document.getElementById('tocToggle');
  var tocDynamicContent = document.getElementById('tocDynamicContent');
  var tocLiveRegion = document.getElementById('tocLiveRegion');
  var tocToast = document.getElementById('tocToast');
  var tocConfirmBtn = document.getElementById('tocConfirm');

  var root = document.documentElement;
  var scrollLockY = 0;

  var storageAvailable = false;
  var maxIndexUnlocked = -1;
  var inMemoryFallback = -1;

  // Anti-ghost-click window after opening (iOS Safari synthesized click).
  var tocJustOpenedAt = 0;
  var TOC_GHOST_GUARD_MS = 520;

  var focusReturnEl = null;
  var contentClickBound = false;

  var toastTimer = null;

  // Toast timings.
  var TOC_TOAST_VISIBLE_MS = 2600;

  // How much breathing room to keep above the sticky footer.
  var TOC_BOTTOM_GAP_PX = 18;

  // Keep the Lexicon seal behind the cradle during the close transition.
  var sealClosingTimer = null;

  // Allow the panel to complete its roll-up animation before we fully hide it.
  var panelClosingTimer = null;

  // Pending selection (two-step navigation).
  var pendingHref = '';
  var pendingPageId = '';
  var pendingTitle = '';
  var pendingItemEl = null;
  var baseHeaderTitle = '';
  var confirmNavigating = false;

  // ----------------------------------------
  // Helpers
  // ----------------------------------------
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

  function getPanelCloseMs() {
    // Prefer close-only duration so roll-up can be quicker than the reveal.
    var ms = readCssNumberVar('--toc-scroll-close-duration');
    if (ms && ms > 0) return ms;

    // Fallback to the shared duration.
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

    // Keep the cradle layer above the seal just long enough for the snap-back motion,
    // then release it quickly (avoid lingering).
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
    // Prefer the canonical token used throughout the Covenant.
    var total = readCssNumberVar('--footer-total-height');

    // Fallbacks.
    if (!total) {
      total = readCssNumberVar('--footer-height') + readCssNumberVar('--footer-safe');
    }

    // If variables aren't resolvable for some reason, measure the element.
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

    // Mobile/touch-friendly visual feedback.
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

    // Prefer "Key: Title" pattern (e.g., "Article Ⅳ: Of ...").
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

    // Fallback for deployments that omit COVENANT_REFERENCES.
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

    if (pendingTitle) setHeaderTitle(pendingTitle);
    setConfirmVisible(true);
  }

  // ----------------------------------------
  // Storage / progression
  // ----------------------------------------
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

  // ----------------------------------------
  // Title-as-toggle (header/title is the button)
  // ----------------------------------------
  var headerEl = document.querySelector('.section-header');
  var headerTitleEl = headerEl ? headerEl.querySelector('h1') : null;

  function positionTitleToggle() {
    if (!tocToggle) return;
    if (!headerEl || !headerTitleEl) return;
    if (!tocToggle.classList.contains('toc-toggle--title')) return;

    var headerRect = headerEl.getBoundingClientRect();
    var titleRect = headerTitleEl.getBoundingClientRect();

    var top = Math.max(0, Math.round(titleRect.top - headerRect.top));
    var left = Math.max(0, Math.round(titleRect.left - headerRect.left));
    var w = Math.max(10, Math.round(titleRect.width));
    var h = Math.max(10, Math.round(titleRect.height));

    tocToggle.style.top = top + 'px';
    tocToggle.style.left = left + 'px';
    tocToggle.style.width = w + 'px';
    tocToggle.style.height = h + 'px';
  }

  function ensureToggleExists() {
    if (tocToggle) return;
    if (!tocPanel) return;

    var btn = document.createElement('button');
    btn.id = 'tocToggle';
    btn.type = 'button';
    btn.className = 'toc-toggle toc-toggle--title';
    btn.setAttribute('aria-label', 'Open Contents');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'tocPanel');
    btn.innerHTML = '<span class="sr-only">Toggle Contents</span>';

    if (headerEl && headerTitleEl) {
      headerEl.classList.add('has-toc-toggle');
      headerEl.appendChild(btn);
    } else {
      btn.classList.remove('toc-toggle--title');
      btn.classList.add('toc-toggle--floating');
      btn.innerHTML = '<span class="toc-toggle-glyph" aria-hidden="true">☰</span>';
      document.body.appendChild(btn);
    }

    tocToggle = btn;
    positionTitleToggle();

    setTimeout(positionTitleToggle, 0);
    setTimeout(positionTitleToggle, 250);
  }

  // ----------------------------------------
  // Scroll lock (mirrors Lexicon approach)
  // ----------------------------------------
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

  function lockBodyScroll() {
    if (root.classList.contains('toc-scroll-lock')) return;

    scrollLockY = window.scrollY || window.pageYOffset || 0;
    root.classList.add('toc-scroll-lock', 'toc-open');

    if (isIOS) enableIOSTouchScrollLock();

    document.body.classList.add('toc-scroll-lock');
    document.body.style.top = (-scrollLockY) + 'px';
  }

  function unlockBodyScroll() {
    if (!root.classList.contains('toc-scroll-lock')) {
      root.classList.remove('toc-open');
      return;
    }

    root.classList.remove('toc-scroll-lock', 'toc-open');

    if (isIOS) disableIOSTouchScrollLock();

    document.body.classList.remove('toc-scroll-lock');
    document.body.style.top = '';
    window.scrollTo(0, scrollLockY);
  }

  // ----------------------------------------
  // Render: Cathedral Index groups
  // ----------------------------------------
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
        // Current page should remain selectable so it can "reset" a pending selection.
        return '<button type="button" class="toc-item-btn" aria-current="page">' + entryHtml + '</button>';
      }

      return '<button type="button" class="toc-item-btn" data-href="' + escapeHtml(page.href) + '">' + entryHtml + '</button>';
    }

    // Locked (keep it quiet: no extra sigils; rely on gate + tone + disabled behavior).
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

    // One clean divider, once, before the first locked entry overall.
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

  // ----------------------------------------
  // Content click delegation
  // ----------------------------------------
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

      // Reselecting the current page resets ToC state (tactile coherence).
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

  // ----------------------------------------
  // Open / Close
  // ----------------------------------------
  function positionDropdownPanel() {
    if (!tocPanel) return;

    var topPx = 16;
    if (headerEl && headerEl.getBoundingClientRect) {
      topPx = Math.round(headerEl.getBoundingClientRect().bottom);
    }

    var footerReserved = getFooterReservedPx();
    var safeBottomLimit = Math.max(0, window.innerHeight - footerReserved - TOC_BOTTOM_GAP_PX);
    var available = safeBottomLimit - topPx;

    tocPanel.style.top = topPx + 'px';
    tocPanel.style.maxHeight = Math.max(220, Math.floor(available)) + 'px';

    positionTitleToggle();
  }

  function openToC() {
    if (!tocPanel || !tocOverlay) return;

    confirmNavigating = false;

    // Anchor the "true" current title each time the panel is opened.
    if (headerTitleEl) baseHeaderTitle = String(headerTitleEl.textContent || '');
    clearPendingSelection(false);

    clearSealClosingLayer();
    clearPanelClosingTimer();

    tocJustOpenedAt = Date.now();
    focusReturnEl = tocToggle;

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

    setTimeout(function () {
      // With no explicit close button, focus the first entry (or panel).
      var firstBtn = tocPanel.querySelector('.toc-item-btn:not([disabled]), .toc-locked-btn');
      if (firstBtn && firstBtn.focus) firstBtn.focus();
      else if (tocPanel.focus) tocPanel.focus();
    }, 0);
  }

  function closeToC(restoreFocus) {
    if (!tocPanel || !tocOverlay) return;

    if (!confirmNavigating) {
      clearPendingSelection(true);
    }

    armSealClosingLayer();
    clearPanelClosingTimer();

    // Important: release toc-open immediately so the seal can start returning at once,
    // but keep scroll-lock until the panel is fully rolled up.
    if (root) root.classList.remove('toc-open');

    // Begin roll-up (keep aria-hidden=false until animation completes).
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
      // Fully hide panel once the scroll has rolled up.
      tocPanel.classList.remove('is-closing');
      tocPanel.setAttribute('aria-hidden', 'true');
      unlockBodyScroll();

      if (restoreFocus) {
        var target = (focusReturnEl && document.contains(focusReturnEl)) ? focusReturnEl : tocToggle;
        if (target && target.focus) target.focus();
      }

      focusReturnEl = null;
      panelClosingTimer = null;
    }, closeMs + 30);
  }

  function toggleToC() {
    if (tocPanel && (tocPanel.classList.contains('is-open') || tocPanel.classList.contains('is-closing'))) {
      closeToC(true);
    } else {
      openToC();
    }
  }

  // ----------------------------------------
  // Wiring
  // ----------------------------------------
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

  function wireControls() {
    if (tocToggle) {
      tocToggle.addEventListener('mouseenter', function () { setTitleSheen(true); });
      tocToggle.addEventListener('mouseleave', function () { setTitleSheen(false); });
      tocToggle.addEventListener('focus', function () { setTitleSheen(true); });
      tocToggle.addEventListener('blur', function () { setTitleSheen(false); });

      var touchStartX = 0;
      var touchStartY = 0;
      var touchMoved = false;

      if (window.PointerEvent) {
        tocToggle.addEventListener('pointerdown', function (e) {
          if (!e || e.pointerType !== 'touch') return;
          touchMoved = false;
          touchStartX = e.clientX || 0;
          touchStartY = e.clientY || 0;
        }, { passive: true });

        tocToggle.addEventListener('pointermove', function (e) {
          if (!e || e.pointerType !== 'touch') return;
          var dx = Math.abs((e.clientX || 0) - touchStartX);
          var dy = Math.abs((e.clientY || 0) - touchStartY);
          if (dx > 10 || dy > 10) touchMoved = true;
        }, { passive: true });

        tocToggle.addEventListener('pointercancel', function (e) {
          if (!e || e.pointerType !== 'touch') return;
          touchMoved = true;
        }, { passive: true });
      }

      tocToggle.addEventListener('click', function (e) {
        if (touchMoved) return;
        stopEvent(e);
        toggleToC();
      });
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

    window.addEventListener('resize', function () {
      positionTitleToggle();
      if (tocPanel && tocPanel.classList.contains('is-open')) positionDropdownPanel();
    });

    window.addEventListener('orientationchange', function () {
      positionTitleToggle();
      if (tocPanel && tocPanel.classList.contains('is-open')) positionDropdownPanel();
    });

    window.addEventListener('blur', function () {
      if (tocPanel && tocPanel.classList.contains('is-open')) closeToC(false);
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && tocPanel && tocPanel.classList.contains('is-open')) closeToC(false);
    });
  }

  // Initialize
  loadProgress();
  enforceSoftGate();
  unlockCurrentPage();

  ensureToggleExists();
  bindContentClicks();
  wireControls();
})();
