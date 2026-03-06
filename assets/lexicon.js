/*! Covenant Lexicon UI v0.3.18 (mobile bottom-sheet supports 3 snap stops: closed, tap-rest mid, fully open; iOS mid-rest stays welded during URL-bar shifts and bottom rubber-band overscroll) */
(function () {
  'use strict';

  // Exposed for quick verification during future page migrations.
  window.COVENANT_LEXICON_VERSION = '0.3.18';

  var doc = document;
  var root = doc.documentElement;

  function byId(id) { return doc.getElementById(id); }
  function qs(sel, scope) { return (scope || doc).querySelector(sel); }
  function qsa(sel, scope) { return (scope || doc).querySelectorAll(sel); }

  function closestSafe(target, selector) {
    if (!target) return null;
    var el = (target.nodeType === 1) ? target : target.parentElement;
    if (!el || !el.closest) return null;
    return el.closest(selector);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeWhitespace(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function stopEvent(e) {
    if (!e) return;
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
  }

  function getCssVar(name) {
    try {
      return (window.getComputedStyle(root).getPropertyValue(name) || '').trim();
    } catch (err) {
      return '';
    }
  }

  function getCssVarNumber(name, fallback) {
    var v = getCssVar(name);
    var n = parseFloat(v);
    return isFinite(n) ? n : fallback;
  }

  function getCssVarString(name, fallback) {
    var v = getCssVar(name);
    return v ? v : fallback;
  }

  function resolveCssVarPx(name, fallback) {
    var probe = null;
    var px = NaN;

    try {
      probe = doc.createElement('div');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      probe.style.pointerEvents = 'none';
      probe.style.height = '0';
      probe.style.overflow = 'hidden';
      probe.style.marginTop = 'var(' + name + ')';
      (doc.body || root).appendChild(probe);
      px = parseFloat(window.getComputedStyle(probe).marginTop || '');
    } catch (err) {
      px = NaN;
    } finally {
      if (probe && probe.parentNode) probe.parentNode.removeChild(probe);
    }

    return isFinite(px) ? px : fallback;
  }

  var pageConfig = window.COVENANT_PAGE || {};
  var pageId = pageConfig.pageId || '';
  var sentenceExplanations = pageConfig.sentenceExplanations || {};
  var logPrefix = pageId ? ('[Covenant Lexicon / ' + pageId + ']') : '[Covenant Lexicon]';

  function applyJourneyCompactHeader() {
    var ids = {
      invocation: true,
      foundation: true,
      declaration: true,
      I: true,
      II: true,
      III: true,
      IV: true,
      V: true,
      VI: true,
      VII: true,
      VIII: true,
      IX: true,
      X: true,
      XI: true,
      XII: true
    };

    if (!ids[pageId]) return;
    if (!doc.body) return;

    doc.body.classList.add('compact-header');

    var header = qs('.section-header');
    if (!header) return;

    var ornaments = qsa('.ornament', header);
    for (var i = 0; i < ornaments.length; i++) {
      if (ornaments[i] && ornaments[i].parentNode) ornaments[i].parentNode.removeChild(ornaments[i]);
    }
  }

  applyJourneyCompactHeader();

  var loadingIcon = byId('loadingIcon');
  var overlay = byId('blackFadeOverlay');
  var container = qs('.container');
  var navFooter = byId('navFooter');

  var panel = byId('lexiconPanel');
  var lexiconToggle = byId('lexiconToggle');
  var lexOverlay = byId('lexiconOverlay');

  var dynamicContent = byId('lexiconDynamicContent');
  var dragRegion = byId('lexiconDragRegion');

  var citationText = byId('citationText');

  var UI_STACK_ID = 'lexicon';
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

  function shouldUseLocalScrollLock() {
    var stack = getUIStack();
    return !uiStackReady(stack);
  }

  function registerWithUIStack() {
    if (uiRegistered) return;

    var stack = getUIStack();
    if (!uiStackReady(stack)) return;

    try {
      stack.register({
        id: UI_STACK_ID,
        priority: 40,
        useSharedScrollLock: true,
        allowScrollSelector: '#lexiconPanel .lexicon-panel-body',
        isOpen: function () {
          return !!(panel && panel.classList && panel.classList.contains('is-open'));
        },
        requestClose: function () {
          if (panel && panel.classList && panel.classList.contains('is-open')) closePanel();
        },
        setInert: function (isInert) {
          try {
            var asleep = !!isInert;
            if (panel) {
              if ('inert' in panel) panel.inert = asleep;
              panel.style.pointerEvents = asleep ? 'none' : '';
            }
            if (lexOverlay) lexOverlay.style.pointerEvents = asleep ? 'none' : '';
          } catch (err2) {}
        },
        setZIndex: function (baseZ) {
          try {
            if (lexOverlay) lexOverlay.style.zIndex = String(baseZ);
            if (panel) panel.style.zIndex = String(baseZ + 1);
          } catch (err3) {}
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

  function clearStackZIndex() {
    try { if (lexOverlay) lexOverlay.style.zIndex = ''; } catch (err1) {}
    try { if (panel) panel.style.zIndex = ''; } catch (err2) {}
  }

  var sealClearTimer = null;
  var ENABLE_PANEL_HANDLE_DRAG = false;
  if (dragRegion && !ENABLE_PANEL_HANDLE_DRAG) {
    dragRegion.style.display = 'none';
    dragRegion.style.pointerEvents = 'none';
    dragRegion.setAttribute('aria-hidden', 'true');
  }

  var defaultOverviewHTML = pageConfig.defaultOverviewHTML || (dynamicContent ? dynamicContent.innerHTML : '');
  if (dynamicContent && pageConfig.defaultOverviewHTML) dynamicContent.innerHTML = pageConfig.defaultOverviewHTML;

  var currentlySelectedSentence = null;
  var currentlySelectedSubpart = null;
  var currentlySelectedKey = null;
  var currentlySelectedQuoteText = '';
  var currentlySelectedFallbackKey = null;
  var currentlyActiveTooltip = null;
  var focusReturnEl = null;
  var scrollLockY = 0;

  var mobileGlyphMql = window.matchMedia ? window.matchMedia('(hover: none), (pointer: coarse)') : null;
  var isMobileGlyphMode = !!(mobileGlyphMql && mobileGlyphMql.matches);
  var bottomSheetMql = window.matchMedia ? window.matchMedia('(max-width: 600px)') : null;
  function isBottomSheetMode() { return !!(bottomSheetMql && bottomSheetMql.matches); }
  var MID_REST_NON_MODAL_PX = 2;

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

  function supportsDVH() {
    try {
      return !!(window.CSS && typeof window.CSS.supports === 'function' && window.CSS.supports('height', '100dvh'));
    } catch (err) {
      return false;
    }
  }

  var iosTouchMoveBlocker = null;
  var IOS_TOUCHMOVE_OPTS = { capture: true, passive: false };

  function enableIOSTouchScrollLock() {
    if (iosTouchMoveBlocker) return;
    iosTouchMoveBlocker = function (e) {
      if (!panel || !panel.classList.contains('is-open')) return;
      if (closestSafe(e.target, '.lexicon-panel-body')) return;
      if (e && e.cancelable) e.preventDefault();
    };
    doc.addEventListener('touchmove', iosTouchMoveBlocker, IOS_TOUCHMOVE_OPTS);
  }

  function disableIOSTouchScrollLock() {
    if (!iosTouchMoveBlocker) return;
    doc.removeEventListener('touchmove', iosTouchMoveBlocker, IOS_TOUCHMOVE_OPTS);
    iosTouchMoveBlocker = null;
  }

  function lockBodyScroll() {
    if (!shouldUseLocalScrollLock()) return;
    if (root.classList.contains('lexicon-scroll-lock')) return;
    scrollLockY = Math.round(window.scrollY || window.pageYOffset || 0);
    root.classList.add('lexicon-scroll-lock');
    if (isIOS) {
      enableIOSTouchScrollLock();
      return;
    }
    try { doc.body.style.overflow = 'hidden'; } catch (err) {}
  }

  function unlockBodyScroll() {
    if (!shouldUseLocalScrollLock()) return;
    if (!root.classList.contains('lexicon-scroll-lock')) return;
    root.classList.remove('lexicon-scroll-lock');
    if (isIOS) {
      disableIOSTouchScrollLock();
      return;
    }
    try { doc.body.style.overflow = ''; } catch (err) {}
    window.scrollTo(0, scrollLockY);
  }

  function clearActiveTooltip() {
    if (!currentlyActiveTooltip) return;
    currentlyActiveTooltip.classList.remove('tooltip-active');
    currentlyActiveTooltip = null;
  }

  function clearSubpartSelection() {
    if (!currentlySelectedSubpart) return;
    currentlySelectedSubpart.classList.remove('is-subpart-selected');
    currentlySelectedSubpart = null;
  }

  function clearSelectionState() {
    currentlySelectedSentence = null;
    currentlySelectedKey = null;
    currentlySelectedQuoteText = '';
    currentlySelectedFallbackKey = null;
    clearSubpartSelection();
  }

  function bindActivate(el, handler) {
    if (!el) return;
    var lastPointerUpAt = 0;
    el.addEventListener('pointerup', function (e) {
      if (e && e.pointerType === 'mouse' && typeof e.button === 'number' && e.button !== 0) return;
      lastPointerUpAt = Date.now();
      handler(e);
    });
    el.addEventListener('click', function (e) {
      if (Date.now() - lastPointerUpAt < 700) return;
      handler(e);
    });
  }

  function getSeatNudge() {
    if (!lexiconToggle) return 0;
    return getCssVarNumber('--seal-seat-nudge-closed', 0);
  }

  function setSealDragOffset(px, draggingNow) {
    if (!lexiconToggle) return;
    if (sealClearTimer) {
      window.clearTimeout(sealClearTimer);
      sealClearTimer = null;
    }
    lexiconToggle.style.setProperty('--seal-drag-y', px + 'px');
    lexiconToggle.classList.toggle('is-seal-dragging', !!draggingNow);
  }

  function clearSealDragOffset() {
    if (!lexiconToggle) return;
    if (sealClearTimer) {
      window.clearTimeout(sealClearTimer);
      sealClearTimer = null;
    }
    lexiconToggle.style.removeProperty('--seal-drag-y');
    lexiconToggle.classList.remove('is-seal-dragging');
  }

  function setSealToOpenPosition() {
    if (!lexiconToggle) return;
    var OPEN_DROP_PX = isIOS ? 1 : 0;
    var unit = supportsDVH() ? '100dvh' : '100vh';
    if (sealClearTimer) {
      window.clearTimeout(sealClearTimer);
      sealClearTimer = null;
    }
    lexiconToggle.style.setProperty('--seal-drag-y', 'calc(-' + unit + ' + (var(--footer-total-height) + var(--lexicon-panel-closed-peek)) + var(--seal-seat-nudge) + ' + OPEN_DROP_PX + 'px)');
    lexiconToggle.classList.remove('is-seal-dragging');
  }

  function setSealToClosedPosition() { clearSealDragOffset(); }

  function readStoredPanelY() {
    if (!panel) return null;
    var raw = '';
    try { raw = panel.getAttribute('data-lexicon-y') || ''; } catch (err) { raw = ''; }
    var n = parseFloat(String(raw).trim());
    return isFinite(n) ? n : null;
  }

  function storePanelY(y) {
    if (!panel) return;
    try { panel.setAttribute('data-lexicon-y', String(Math.round(y))); } catch (err) {}
  }

  function getViewportHeightSafe() {
    try {
      if (window.visualViewport && typeof window.visualViewport.height === 'number' && window.visualViewport.height > 0) {
        var vv = window.visualViewport;
        var h = vv.height;
        var off = (typeof vv.offsetTop === 'number' && isFinite(vv.offsetTop)) ? vv.offsetTop : 0;
        var sum = h + off;
        return (sum > 0) ? sum : h;
      }
    } catch (err) {}
    return window.innerHeight || 0;
  }

  function getFooterTotalHeightPx() {
    var cssPx = resolveCssVarPx('--footer-total-height', 0);
    var measured = 0;
    if (navFooter) {
      try {
        var r = navFooter.getBoundingClientRect();
        measured = (r && r.height) ? r.height : 0;
      } catch (err) {
        measured = 0;
      }
    }
    return Math.max(0, Math.round(Math.max(cssPx || 0, measured || 0)));
  }

  function getDockObscurePxSafe() {
    var vh = getViewportHeightSafe();
    var maxDockObscure = getFooterTotalHeightPx();
    if (navFooter) {
      try {
        var r = navFooter.getBoundingClientRect();
        if (r && isFinite(r.top)) {
          var measured = Math.max(0, Math.round(vh - r.top));
          return maxDockObscure ? Math.min(measured, maxDockObscure) : measured;
        }
        if (r && r.height) {
          var height = Math.max(0, Math.round(r.height));
          return maxDockObscure ? Math.min(height, maxDockObscure) : height;
        }
      } catch (err0) {}
    }
    return maxDockObscure;
  }

  function clearLexiconBodyDockInset() {
    if (!panel) return;
    var body = qs('.lexicon-panel-body', panel);
    if (!body) return;
    body.style.paddingBottom = '';
    body.style.scrollPaddingBottom = '';
  }

  function applyLexiconBodyDockInset(dockObscurePx) {
    if (!panel) return;
    var body = qs('.lexicon-panel-body', panel);
    if (!body) return;
    if (!isBottomSheetMode() || !panel.classList.contains('is-open')) {
      clearLexiconBodyDockInset();
      return;
    }
    var inset = Math.max(0, Math.round((dockObscurePx || 0) + 24));
    body.style.paddingBottom = inset + 'px';
    body.style.scrollPaddingBottom = inset + 'px';
  }

  function clearLexiconBodySizing() {
    if (!panel) return;
    var body = qs('.lexicon-panel-body', panel);
    if (!body) return;
    body.style.height = '';
    body.style.maxHeight = '';
  }

  function applyLexiconBodySizingForY(y, dockObscurePx) {
    if (!panel) return;
    var body = qs('.lexicon-panel-body', panel);
    if (!body) return;
    if (!isBottomSheetMode() || !panel.classList.contains('is-open')) {
      clearLexiconBodySizing();
      return;
    }
    var header = qs('.lexicon-panel-header', panel);
    var headerH = 0;
    try { headerH = header ? (header.getBoundingClientRect().height || 0) : 0; } catch (err0) { headerH = 0; }
    var vh = getViewportHeightSafe();
    if (typeof dockObscurePx !== 'number') dockObscurePx = getDockObscurePxSafe();
    var dockTop = Math.max(0, Math.round(vh - dockObscurePx));
    var yPx = Math.max(0, Math.round(y || 0));
    var avail = dockTop - yPx - Math.round(headerH);
    var MIN_BODY_H = 140;
    var bodyH = Math.max(MIN_BODY_H, Math.round(avail));
    body.style.height = bodyH + 'px';
    body.style.maxHeight = bodyH + 'px';
  }

  function measureLexiconContentHeight() {
    if (!panel) return 0;
    var header = qs('.lexicon-panel-header', panel);
    var body = qs('.lexicon-panel-body', panel);
    var headerH = 0;
    var bodyH = 0;
    try { headerH = header ? (header.getBoundingClientRect().height || 0) : 0; } catch (err0) { headerH = 0; }
    try { bodyH = body ? (body.scrollHeight || 0) : 0; } catch (err1) { bodyH = 0; }
    return Math.max(0, Math.round(headerH + bodyH + 10));
  }

  function applyMobileRestingY(y, closedY, sealDragging) {
    if (!panel || !lexOverlay) return;
    if (typeof sealDragging !== 'boolean') sealDragging = false;
    y = Math.round(y);
    closedY = Math.max(1, Math.round(closedY || 1));
    panel.style.transform = 'translateY(' + y + 'px)';
    var dockObscurePx = getDockObscurePxSafe();
    applyLexiconBodySizingForY(y, dockObscurePx);
    var progress = 1 - (y / closedY);
    if (progress < 0) progress = 0;
    if (progress > 1) progress = 1;
    var seatNudge = getSeatNudge();
    var openDrop = (isIOS ? 1 : 0) * progress;
    var sealOffset = (y - closedY) + (seatNudge * progress) + openDrop;
    setSealDragOffset(sealOffset, sealDragging);
    if (isBottomSheetMode() && !sealDragging && y > MID_REST_NON_MODAL_PX) {
      lexOverlay.style.opacity = '0';
      lexOverlay.style.pointerEvents = 'none';
    } else {
      lexOverlay.style.opacity = String(progress);
      lexOverlay.style.pointerEvents = '';
    }
    storePanelY(y);
  }

  var iosMidRestSyncRaf = null;
  function shouldSyncIOSMidRestNow() {
    if (!isIOS) return false;
    if (!isBottomSheetMode()) return false;
    if (!panel || !panel.classList.contains('is-open')) return false;
    if (panel.classList.contains('is-dragging')) return false;
    var storedY = readStoredPanelY();
    return !!(typeof storedY === 'number' && isFinite(storedY) && storedY > MID_REST_NON_MODAL_PX);
  }

  function scheduleIOSMidRestViewportResync() {
    if (!shouldSyncIOSMidRestNow()) return;
    var storedY = readStoredPanelY();
    if (!(typeof storedY === 'number' && isFinite(storedY))) return;
    if (iosMidRestSyncRaf) return;
    var raf = window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 0); };
    iosMidRestSyncRaf = raf(function () {
      iosMidRestSyncRaf = null;
      try {
        var dockObscurePx = getDockObscurePxSafe();
        var peek = getCssVarNumber('--lexicon-panel-closed-peek', 0);
        var rect = panel.getBoundingClientRect();
        var panelH = (rect && rect.height) ? rect.height : 1;
        var closedY = Math.max(1, Math.round(panelH - (dockObscurePx + peek)));
        var y = Math.round(storedY);
        if (y < 0) y = 0;
        if (y > closedY) y = closedY;
        applyMobileRestingY(y, closedY, false);
        applyLexiconBodyDockInset(dockObscurePx);
      } catch (err) {}
    });
  }

  (function initIOSMidRestViewportResync() {
    if (!isIOS) return;
    try {
      if (window.visualViewport && window.visualViewport.addEventListener) {
        window.visualViewport.addEventListener('resize', scheduleIOSMidRestViewportResync, { passive: true });
        window.visualViewport.addEventListener('scroll', scheduleIOSMidRestViewportResync, { passive: true });
      }
    } catch (err0) {}
    try { window.addEventListener('orientationchange', function () { setTimeout(scheduleIOSMidRestViewportResync, 50); }); } catch (err1) {}
    try { window.addEventListener('resize', scheduleIOSMidRestViewportResync, { passive: true }); } catch (err2) {}
    try { window.addEventListener('scroll', scheduleIOSMidRestViewportResync, { passive: true }); } catch (err3) {}
    try { doc.addEventListener('touchmove', scheduleIOSMidRestViewportResync, { passive: true, capture: true }); } catch (err4) {}
  })();

  function mobileTapOpenToContentHeight() {
    if (!panel || !lexOverlay) return;
    if (!isBottomSheetMode()) return;
    var dockObscurePx = getDockObscurePxSafe();
    var peek = getCssVarNumber('--lexicon-panel-closed-peek', 0);
    var rect = panel.getBoundingClientRect();
    var panelH = (rect && rect.height) ? rect.height : 1;
    var closedY = Math.max(1, Math.round(panelH - (dockObscurePx + peek)));
    var contentH = measureLexiconContentHeight();
    var availAboveDock = Math.max(180, Math.round(getViewportHeightSafe() - dockObscurePx));
    var capH = Math.round(availAboveDock * 0.60);
    var desired = Math.min(contentH, capH);
    var openY = Math.round(panelH - (dockObscurePx + desired));
    if (openY < 0) openY = 0;
    if (openY > closedY) openY = closedY;
    var SNAP_MS = getCssVarNumber('--lexicon-snap-duration', 420);
    var SNAP_EASE = getCssVarString('--lexicon-snap-ease', 'cubic-bezier(0.22, 0.61, 0.36, 1)');
    panel.style.transition = 'none';
    lexOverlay.style.transition = 'none';
    applyMobileRestingY(closedY, closedY, false);
    var raf = window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 0); };
    raf(function () {
      panel.style.transition = 'transform ' + SNAP_MS + 'ms ' + SNAP_EASE;
      lexOverlay.style.transition = 'opacity ' + SNAP_MS + 'ms ' + SNAP_EASE;
      applyMobileRestingY(openY, closedY, false);
      applyLexiconBodyDockInset(dockObscurePx);
      setTimeout(function () {
        try { panel.style.transition = ''; } catch (err0) {}
        try { lexOverlay.style.transition = ''; } catch (err1) {}
      }, SNAP_MS + 30);
    });
  }

  function renderOverview() {
    if (!dynamicContent) return;
    dynamicContent.style.opacity = '0';
    setTimeout(function () {
      dynamicContent.innerHTML = defaultOverviewHTML;
      dynamicContent.style.opacity = '1';
    }, 150);
  }

  function renderSentenceExplanation(key, sentenceText, fallbackKey) {
    if (!dynamicContent) return;
    var explanation = sentenceExplanations[key] || (fallbackKey ? sentenceExplanations[fallbackKey] : null);
    if (!explanation) {
      renderOverview();
      return;
    }
    var safeSentence = escapeHtml(sentenceText);
    dynamicContent.style.opacity = '0';
    setTimeout(function () {
      dynamicContent.innerHTML = '<div class="lexicon-sentence-quote">"' + safeSentence + '"</div><p>' + explanation + '</p>';
      dynamicContent.style.opacity = '1';
    }, 150);
  }

  function openPanel() {
    if (!panel || !lexOverlay) return;
    clearActiveTooltip();
    panel.classList.add('is-open');
    lexOverlay.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    lexOverlay.setAttribute('aria-hidden', 'false');
    if (lexiconToggle) lexiconToggle.setAttribute('aria-expanded', 'true');
    lockBodyScroll();
    noteOpen();
    if (isBottomSheetMode()) mobileTapOpenToContentHeight();
  }

  function closePanel() {
    if (!panel || !lexOverlay) return;
    clearActiveTooltip();
    clearLexiconBodyDockInset();
    clearLexiconBodySizing();
    panel.classList.remove('is-open');
    lexOverlay.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    lexOverlay.setAttribute('aria-hidden', 'true');
    if (lexiconToggle) lexiconToggle.setAttribute('aria-expanded', 'false');
    if (isBottomSheetMode()) setSealToClosedPosition();
    unlockBodyScroll();
    noteClose();
    clearStackZIndex();
  }

  validateSentenceKeys();
  registerWithUIStack();

  if (lexiconToggle && panel && lexOverlay) {
    bindActivate(lexiconToggle, function () {
      if (panel.classList.contains('is-open')) {
        if (!isTopmostForDismiss()) {
          bringSelfToFront();
          return;
        }
        closePanel();
        return;
      }
      if (currentlySelectedKey) renderSentenceExplanation(currentlySelectedKey, currentlySelectedQuoteText, currentlySelectedFallbackKey);
      else renderOverview();
      openPanel();
    });

    bindActivate(lexOverlay, function () {
      if (!isTopmostForDismiss()) return;
      closePanel();
    });
  }
})();
