/*! Covenant Lexicon UI v0.3.20 (mobile bottom-sheet supports 3 snap stops: closed, tap-rest mid, fully open; tap-to-close from fully open closes straight to dock) */
(function () {
  'use strict';

  // Exposed for quick verification during future page migrations.
  window.COVENANT_LEXICON_VERSION = '0.3.20';

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

            if (lexOverlay) {
              lexOverlay.style.pointerEvents = asleep ? 'none' : '';
            }
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

  var sealSlot = byId('lexiconSealSlot');
  var headerText = byId('lexiconHeaderText');
  var sealDockParent = null;
  var sealDockPlaceholder = null;
  var sealIsInHeader = false;

  function ensureSealDockPlaceholder() {
    if (sealDockPlaceholder) return sealDockPlaceholder;

    var el = doc.createElement('span');
    el.setAttribute('aria-hidden', 'true');
    el.style.display = 'block';
    el.style.width = 'var(--seal-size, 56px)';
    el.style.height = 'var(--seal-size, 56px)';
    el.style.pointerEvents = 'none';

    sealDockPlaceholder = el;
    return el;
  }

  function ensureHeaderLayout() {
    if (sealSlot) {
      sealSlot.style.display = 'flex';
      sealSlot.style.alignItems = 'center';
      sealSlot.style.justifyContent = 'center';
      sealSlot.style.flex = '0 0 auto';
    }

    if (headerText) {
      headerText.style.flex = '1 1 auto';
      headerText.style.minWidth = '0';
    }
  }

  function moveSealIntoHeader() {
    if (!lexiconToggle || !sealSlot) return;
    if (sealIsInHeader) return;

    sealDockParent = lexiconToggle.parentNode;
    if (!sealDockParent) return;

    try {
      sealDockParent.insertBefore(ensureSealDockPlaceholder(), lexiconToggle);
    } catch (err0) {}

    try {
      ensureHeaderLayout();
      sealSlot.appendChild(lexiconToggle);
      lexiconToggle.classList.add('is-seal-in-header');
      lexiconToggle.style.transform = 'none';
      lexiconToggle.style.margin = '0 8px 0 0';
      lexiconToggle.style.removeProperty('--seal-drag-y');
      sealIsInHeader = true;
    } catch (err1) {}
  }

  function restoreSealToDock() {
    if (!lexiconToggle) return;
    if (!sealDockParent) return;
    if (!sealIsInHeader) return;

    try {
      if (sealDockPlaceholder && sealDockPlaceholder.parentNode === sealDockParent) {
        sealDockParent.insertBefore(lexiconToggle, sealDockPlaceholder);
        sealDockParent.removeChild(sealDockPlaceholder);
      } else {
        sealDockParent.appendChild(lexiconToggle);
      }

      lexiconToggle.classList.remove('is-seal-in-header');
      lexiconToggle.style.transform = '';
      lexiconToggle.style.margin = '';
      sealDockPlaceholder = null;
      sealIsInHeader = false;
    } catch (err2) {}
  }

  var sealClearTimer = null;
  var ENABLE_PANEL_HANDLE_DRAG = false;
  if (dragRegion && !ENABLE_PANEL_HANDLE_DRAG) {
    dragRegion.style.display = 'none';
    dragRegion.style.pointerEvents = 'none';
    dragRegion.setAttribute('aria-hidden', 'true');
  }

  var loadingGlyph = (pageConfig && pageConfig.loadingGlyph) || window.COVENANT_LOADING_GLYPH || '֎';
  if (loadingIcon) {
    var currentGlyph = (loadingIcon.textContent || '').trim();
    if (currentGlyph !== loadingGlyph) loadingIcon.textContent = loadingGlyph;
  }

  var defaultOverviewHTML = pageConfig.defaultOverviewHTML || (dynamicContent ? dynamicContent.innerHTML : '');
  if (dynamicContent && pageConfig.defaultOverviewHTML) {
    dynamicContent.innerHTML = pageConfig.defaultOverviewHTML;
  }

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

  function applyPressFeedback(el) {
    if (!el) return;

    function add() { el.classList.add('is-pressed'); }
    function remove() { el.classList.remove('is-pressed'); }

    if (window.PointerEvent) {
      el.addEventListener('pointerdown', add);
      el.addEventListener('pointerup', function () { setTimeout(remove, 160); });
      el.addEventListener('pointercancel', remove);
      el.addEventListener('pointerleave', remove);
    } else {
      el.addEventListener('touchstart', add, { passive: true });
      el.addEventListener('touchend', function () { setTimeout(remove, 160); }, { passive: true });
      el.addEventListener('touchcancel', remove, { passive: true });
    }
  }

  var sealPulseTimer = null;
  var sealNudgeTimer = null;
  var sealTapClassTimer = null;

  function getNavPulseDurationMs() {
    return getCssVarNumber('--nav-pulse-duration', 520);
  }

  function getLexiconTapMotionMs() {
    return getCssVarNumber('--lexicon-snap-duration', 420);
  }

  function clearSealTapClasses() {
    if (!lexiconToggle || !lexiconToggle.classList) return;
    lexiconToggle.classList.remove('is-tap-opening', 'is-tap-closing');
  }

  function scheduleSealTapClassClear(ms) {
    if (sealTapClassTimer) {
      window.clearTimeout(sealTapClassTimer);
      sealTapClassTimer = null;
    }

    sealTapClassTimer = window.setTimeout(function () {
      try { clearSealTapClasses(); } catch (err) {}
      sealTapClassTimer = null;
    }, Math.max(0, ms || 0) + 60);
  }

  function markSealTapOpening() {
    if (!lexiconToggle || !lexiconToggle.classList) return;
    clearSealTapClasses();
    lexiconToggle.classList.add('is-tap-opening');
    scheduleSealTapClassClear(getLexiconTapMotionMs());
  }

  function markSealTapClosing() {
    if (!lexiconToggle || !lexiconToggle.classList) return;
    clearSealTapClasses();
    lexiconToggle.classList.add('is-tap-closing');
    scheduleSealTapClassClear(getLexiconTapMotionMs());
  }

  function triggerSealPulse() {
    if (!lexiconToggle || !lexiconToggle.classList) return;

    if (sealPulseTimer) {
      window.clearTimeout(sealPulseTimer);
      sealPulseTimer = null;
    }

    lexiconToggle.classList.remove('is-pulsing');
    void lexiconToggle.offsetWidth;
    lexiconToggle.classList.add('is-pulsing');

    sealPulseTimer = window.setTimeout(function () {
      try { if (lexiconToggle && lexiconToggle.classList) lexiconToggle.classList.remove('is-pulsing'); } catch (err) {}
      sealPulseTimer = null;
    }, getNavPulseDurationMs() + 90);
  }

  function triggerSealNudge() {
    if (!lexiconToggle || !lexiconToggle.classList) return;

    if (sealNudgeTimer) {
      window.clearTimeout(sealNudgeTimer);
      sealNudgeTimer = null;
    }

    lexiconToggle.classList.remove('is-nudging');
    void lexiconToggle.offsetWidth;
    lexiconToggle.classList.add('is-nudging');

    sealNudgeTimer = window.setTimeout(function () {
      try { if (lexiconToggle && lexiconToggle.classList) lexiconToggle.classList.remove('is-nudging'); } catch (err) {}
      sealNudgeTimer = null;
    }, 140);
  }

  var lexiconHovering = false;
  var LEX_GLYPHS = {
    default: '𖤓',
    defaultHover: '𖤓',
    selected: '𖤓',
    selectedHover: '𖤓',
    openSummary: '𖤓',
    openSelected: '𖤓',
    openHover: '𖤓',
    mobileOpen: '𖤓'
  };

  function setGlyphMarkup(target, glyph) {
    if (!target) return;

    glyph = String(glyph === null || glyph === undefined ? '' : glyph);

    var markerAttr = 'data-covenant-glyph';
    if (target.getAttribute(markerAttr) === glyph) return;
    target.setAttribute(markerAttr, glyph);

    while (target.firstChild) target.removeChild(target.firstChild);

    var star = '𖤓';
    var idx = glyph.indexOf(star);
    if (idx === -1) {
      target.textContent = glyph;
      return;
    }

    var left = glyph.slice(0, idx);
    var right = glyph.slice(idx + star.length);

    target.appendChild(doc.createTextNode(left));

    var midOuter = doc.createElement('span');
    midOuter.className = 'lexicon-glyph-mid';

    var midInner = doc.createElement('span');
    midInner.className = 'lexicon-glyph-mid-inner';
    midInner.textContent = star;

    midOuter.appendChild(midInner);
    target.appendChild(midOuter);
    target.appendChild(doc.createTextNode(right));
  }

  function setLexiconGlyph() {
    if (!lexiconToggle || !panel) return;

    var explicitIdle = qs('.lexicon-glyph--idle', lexiconToggle);
    var explicitActive = qs('.lexicon-glyph--active', lexiconToggle);
    if (explicitIdle && explicitActive) return;

    var isOpen = panel.classList.contains('is-open');
    var hasSelection = !!currentlySelectedKey;
    var glyphTarget = qs('.lexicon-glyph', lexiconToggle) || lexiconToggle;

    if (isMobileGlyphMode) {
      var mobileGlyph = isOpen ? LEX_GLYPHS.mobileOpen : (hasSelection ? LEX_GLYPHS.selected : LEX_GLYPHS.default);
      setGlyphMarkup(glyphTarget, mobileGlyph);
      return;
    }

    var glyph;
    if (isOpen) {
      glyph = lexiconHovering ? LEX_GLYPHS.openHover : (hasSelection ? LEX_GLYPHS.openSelected : LEX_GLYPHS.openSummary);
    } else {
      glyph = lexiconHovering
        ? (hasSelection ? LEX_GLYPHS.selectedHover : LEX_GLYPHS.defaultHover)
        : (hasSelection ? LEX_GLYPHS.selected : LEX_GLYPHS.default);
    }

    setGlyphMarkup(glyphTarget, glyph);
  }

  if (mobileGlyphMql) {
    var onMobileGlyphChange = function () {
      isMobileGlyphMode = !!mobileGlyphMql.matches;
      setLexiconGlyph();
    };

    if (typeof mobileGlyphMql.addEventListener === 'function') {
      mobileGlyphMql.addEventListener('change', onMobileGlyphChange);
    } else if (typeof mobileGlyphMql.addListener === 'function') {
      mobileGlyphMql.addListener(onMobileGlyphChange);
    }
  }

  function updateLexiconButtonState() {
    if (!lexiconToggle) return;
    lexiconToggle.classList.toggle('has-selection', !!currentlySelectedKey);
    setLexiconGlyph();
  }

  var modeEl = byId('lexiconModeLabel') || qs('.lexicon-panel-mode');
  function setModeLabel() {
    if (!pageConfig.modeLabel || !modeEl) return;
    modeEl.textContent = pageConfig.modeLabel;
  }

  function resolveKeyPattern() {
    var fallback = /^[IVX]+\.[0-9]+$/;

    if (pageConfig.keyPattern instanceof RegExp) return pageConfig.keyPattern;

    if (typeof pageConfig.keyPattern === 'string' && pageConfig.keyPattern.trim()) {
      try {
        return new RegExp(pageConfig.keyPattern);
      } catch (err) {
        console.warn(logPrefix, 'Invalid pageConfig.keyPattern; using default.', pageConfig.keyPattern);
        return fallback;
      }
    }

    return fallback;
  }

  function validateSentenceKeys() {
    var nodes = qsa('.sentence');
    if (!nodes || !nodes.length) return;

    var seen = Object.create(null);
    var duplicates = Object.create(null);
    var missingCount = 0;
    var nonstandard = Object.create(null);
    var pattern = resolveKeyPattern();

    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var key = node && node.dataset ? node.dataset.lexiconKey : null;
      if (!key) {
        missingCount += 1;
        continue;
      }

      if (!pattern.test(key)) nonstandard[key] = true;
      if (seen[key]) duplicates[key] = true;
      seen[key] = true;
    }

    var dupKeys = Object.keys(duplicates);
    if (dupKeys.length) console.warn(logPrefix, 'Duplicate data-lexicon-key values found:', dupKeys);
    if (missingCount) console.warn(logPrefix, 'Some .sentence elements are missing data-lexicon-key:', missingCount);

    var nonstandardKeys = Object.keys(nonstandard);
    if (nonstandardKeys.length) {
      console.warn(logPrefix, 'Non-standard data-lexicon-key format (expected I.1, II.3, etc.):', nonstandardKeys);
    }
  }

  function applyIntroOverrides() {
    var intro = pageConfig.intro;
    if (!intro || typeof intro !== 'object') return;

    function setVar(name, value) {
      if (value === null || value === undefined) return;
      if (value === '') return;
      root.style.setProperty(name, String(value));
    }

    setVar('--intro-icon-duration', intro.iconDuration);
    setVar('--intro-overlay-duration', intro.overlayDuration);
    setVar('--intro-container-duration', intro.contentDuration);
    setVar('--intro-footer-duration', intro.footerDuration);
    setVar('--intro-panel-duration', intro.panelDuration);
  }

  function resolveIntroDelays() {
    var intro = pageConfig.intro;
    var defaults = {
      startDelay: 1800,
      iconToOverlayDelay: 500,
      overlayToContentDelay: 1500,
      cleanupDelay: 1500,
      panelToFooterDelay: 90
    };

    if (!intro || typeof intro !== 'object') return defaults;

    function pickNumber(value, fallback) {
      return (typeof value === 'number' && isFinite(value)) ? value : fallback;
    }

    return {
      startDelay: pickNumber(intro.startDelay, defaults.startDelay),
      iconToOverlayDelay: pickNumber(intro.iconToOverlayDelay, defaults.iconToOverlayDelay),
      overlayToContentDelay: pickNumber(intro.overlayToContentDelay, defaults.overlayToContentDelay),
      cleanupDelay: pickNumber(intro.cleanupDelay, defaults.cleanupDelay),
      panelToFooterDelay: pickNumber(intro.panelToFooterDelay, defaults.panelToFooterDelay)
    };
  }

  applyIntroOverrides();
  var introDelays = resolveIntroDelays();

  setTimeout(function () {
    if (loadingIcon) loadingIcon.classList.add('fade-out');

    setTimeout(function () {
      if (overlay) overlay.classList.add('fade-out');

      setTimeout(function () {
        if (container) container.classList.add('fade-in');
        if (panel) panel.classList.add('fade-in');

        setTimeout(function () {
          if (navFooter) navFooter.classList.add('fade-in');
        }, introDelays.panelToFooterDelay);

        setTimeout(function () {
          if (loadingIcon && loadingIcon.parentNode) loadingIcon.parentNode.removeChild(loadingIcon);
          if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, introDelays.cleanupDelay);
      }, introDelays.overlayToContentDelay);
    }, introDelays.iconToOverlayDelay);
  }, introDelays.startDelay);

  var lastCitationText = '';
  var UNICODE_ROMAN_ARTICLE = {
    'I': 'Ⅰ', 'II': 'Ⅱ', 'III': 'Ⅲ', 'IV': 'Ⅳ', 'V': 'Ⅴ', 'VI': 'Ⅵ',
    'VII': 'Ⅶ', 'VIII': 'Ⅷ', 'IX': 'Ⅸ', 'X': 'Ⅹ', 'XI': 'Ⅺ', 'XII': 'Ⅻ'
  };
  var UNICODE_ROMAN_NUM = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ', 'Ⅺ', 'Ⅻ'];

  function romanAsciiToUnicode(roman) {
    roman = String(roman || '').trim();
    return UNICODE_ROMAN_ARTICLE[roman] || roman;
  }

  function intToUnicodeRoman(n) {
    var num = parseInt(n, 10);
    if (!isFinite(num) || num <= 0) return String(n);
    return UNICODE_ROMAN_NUM[num] || String(n);
  }

  function latinToCircled(letter) {
    if (!letter) return '';
    var s = String(letter);

    if (/^[\u24B6-\u24CF]$/.test(s)) return s;

    var up = s.toUpperCase();
    if (up.length !== 1) return s;

    var code = up.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCharCode(0x24B6 + (code - 65));

    return s;
  }

  function circledToLatin(letter) {
    if (!letter) return '';
    var s = String(letter).trim();

    if (/^[A-Za-z]$/.test(s)) return s.toUpperCase();

    if (/^[\u24B6-\u24CF]$/.test(s)) {
      var code = s.charCodeAt(0);
      return String.fromCharCode(65 + (code - 0x24B6));
    }

    return '';
  }

  function formatCitation(sentenceKey) {
    var isArticlePage = !!(pageConfig.pageId && pageConfig.pageId.match(/^[IVX]+$/));

    if (sentenceKey) {
      if (isArticlePage) {
        var m = String(sentenceKey).match(/^([IVX]+)\.(\d+)(?:\.([A-Za-z\u24B6-\u24CF]))?$/);
        var articleAscii = m ? m[1] : pageConfig.pageId;
        var sectionNum = m ? m[2] : null;
        var subpart = m ? m[3] : null;
        var articleUnicode = romanAsciiToUnicode(articleAscii);
        var sectionUnicode = sectionNum ? intToUnicodeRoman(sectionNum) : String(sentenceKey);
        var out = 'Article ' + articleUnicode + ', §.' + sectionUnicode;
        if (subpart) out += '.' + latinToCircled(subpart);
        return out;
      }

      if (pageConfig.pageId === 'invocation') {
        var invMatch = String(sentenceKey).match(/^[IVX]+\.(\d+)$/);
        if (invMatch) {
          var n = parseInt(invMatch[1], 10);
          if (n === 1) return 'Invocation §\u2011' + n;
          return 'Preamble §\u2011' + n;
        }
        return 'Invocation §\u2011' + sentenceKey;
      }

      return '§\u2011' + sentenceKey;
    }

    var pageLabel = pageConfig.citationLabel || pageConfig.sectionLabel || pageConfig.pageId || '';
    if (pageConfig.pageId === 'invocation') return 'Invocation and Preamble';
    if (pageConfig.pageId === 'foundation') return 'Foundation';
    if (pageConfig.pageId === 'declaration') return 'Declaration';
    if (pageConfig.pageId && pageConfig.pageId.match(/^[IVX]+$/)) return 'Article ' + romanAsciiToUnicode(pageConfig.pageId);
    return pageLabel;
  }

  function updateCitationLabel(sentenceKey, fromSelection) {
    if (!citationText) return;

    var newText = formatCitation(sentenceKey);
    if (newText === lastCitationText) return;

    var isToSelection = !!sentenceKey;
    var wasSelection = !!fromSelection;
    citationText.classList.remove('slide-up', 'slide-up-dramatic', 'slide-down');

    var animClass;
    if (!wasSelection && isToSelection) animClass = 'slide-up-dramatic';
    else if (wasSelection && !isToSelection) animClass = 'slide-down';
    else if (wasSelection && isToSelection) animClass = 'slide-up';
    else animClass = null;

    citationText.textContent = newText;
    lastCitationText = newText;

    if (citationText.dataset) {
      citationText.dataset.lexiconKey = sentenceKey || '';
    } else {
      try { citationText.setAttribute('data-lexicon-key', sentenceKey || ''); } catch (err) {}
    }

    if (animClass) {
      void citationText.offsetWidth;
      citationText.classList.add(animClass);
    }
  }

  function initializeCitationLabel() {
    if (!citationText) return;
    var initialText = formatCitation(null);
    citationText.textContent = initialText;
    lastCitationText = initialText;

    if (citationText.dataset) {
      citationText.dataset.lexiconKey = '';
    } else {
      try { citationText.setAttribute('data-lexicon-key', ''); } catch (err) {}
    }
  }

  initializeCitationLabel();

  function resetPanelInlineMotion() {
    if (!panel) return;
    panel.classList.remove('is-dragging');
    panel.style.transform = '';
    panel.style.transition = '';
    if (lexOverlay) {
      lexOverlay.style.opacity = '';
      lexOverlay.style.transition = '';
      lexOverlay.style.pointerEvents = '';
    }
    clearLexiconBodySizing();
  }

  function getSeatNudge() {
    if (!lexiconToggle) return 0;
    return getCssVarNumber('--seal-seat-nudge-closed', 0);
  }

  function shouldAnchorSealToDock() {
    return !!(isIOS && isBottomSheetMode());
  }

  function setSealDragOffset(px, draggingNow) {
    if (!lexiconToggle) return;
    if (lexiconToggle.classList && lexiconToggle.classList.contains('is-seal-in-header')) return;

    if (shouldAnchorSealToDock()) {
      clearSealDragOffset();
      return;
    }

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
    if (lexiconToggle.classList && lexiconToggle.classList.contains('is-seal-in-header')) return;

    if (shouldAnchorSealToDock()) {
      clearSealDragOffset();
      return;
    }

    var OPEN_DROP_PX = isIOS ? 1 : 0;
    var unit = supportsDVH() ? '100dvh' : '100vh';

    if (sealClearTimer) {
      window.clearTimeout(sealClearTimer);
      sealClearTimer = null;
    }

    lexiconToggle.style.setProperty(
      '--seal-drag-y',
      'calc(-' + unit + ' + (var(--footer-total-height) + var(--lexicon-panel-closed-peek)) + var(--seal-seat-nudge) + ' + OPEN_DROP_PX + 'px)'
    );

    lexiconToggle.classList.remove('is-seal-dragging');
  }

  function setSealToClosedPosition() {
    clearSealDragOffset();
  }

  function readStoredPanelY() {
    if (!panel) return null;
    var raw = '';
    try {
      raw = panel.getAttribute('data-lexicon-y') || '';
    } catch (err) {
      raw = '';
    }
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

  function getDockObscurePxSafe() {
    var vh = getViewportHeightSafe();

    if (navFooter) {
      try {
        var r = navFooter.getBoundingClientRect();
        if (r && isFinite(r.top)) return Math.max(0, Math.round(vh - r.top));
        if (r && r.height) return Math.max(0, Math.round(r.height));
      } catch (err0) {}
    }

    var val = getCssVar('--footer-total-height');
    var n = parseFloat(val);
    return isFinite(n) ? Math.max(0, Math.round(n)) : 0;
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

  function scheduleIOSMidRestViewportResync() {
    if (!isIOS) return;
    if (!isBottomSheetMode()) return;
    if (!panel || !panel.classList.contains('is-open')) return;
    if (panel.classList.contains('is-dragging')) return;

    var storedY = readStoredPanelY();
    if (!(typeof storedY === 'number' && isFinite(storedY))) return;
    if (storedY <= MID_REST_NON_MODAL_PX) return;
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
    try { window.addEventListener('pageshow', scheduleIOSMidRestViewportResync); } catch (err4) {}
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

  function isKeyboardIntentEvent(e) {
    try {
      if (!e) return false;
      if (e.type === 'click' && typeof e.detail === 'number' && e.detail === 0) return true;
      if (e.type === 'keydown') return true;
    } catch (err) {}
    return false;
  }

  function focusIntoPanel(preferCloseFocus) {
    if (!panel) return;
    if (!preferCloseFocus) return;

    var closeBtn = qs('.lexicon-panel-close', panel);
    if (closeBtn && closeBtn.focus) closeBtn.focus();
    else if (panel.focus) panel.focus();
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

  function openPanel(openEvent) {
    if (!panel || !lexOverlay) return;

    clearActiveTooltip();
    resetPanelInlineMotion();
    focusReturnEl = lexiconToggle;

    var bottomSheet = isBottomSheetMode();
    if (!bottomSheet) moveSealIntoHeader();
    else restoreSealToDock();

    panel.classList.add('is-open');
    lexOverlay.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    lexOverlay.setAttribute('aria-hidden', 'false');
    if (lexiconToggle) lexiconToggle.setAttribute('aria-expanded', 'true');

    lockBodyScroll();
    setLexiconGlyph();
    noteOpen();

    if (bottomSheet) mobileTapOpenToContentHeight();

    var preferCloseFocus = isKeyboardIntentEvent(openEvent);
    setTimeout(function () { focusIntoPanel(preferCloseFocus); }, 0);
  }

  function closePanel() {
    if (!panel || !lexOverlay) return;

    clearActiveTooltip();
    resetPanelInlineMotion();
    clearLexiconBodyDockInset();
    clearLexiconBodySizing();

    panel.classList.remove('is-open');
    lexOverlay.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    lexOverlay.setAttribute('aria-hidden', 'true');
    if (lexiconToggle) lexiconToggle.setAttribute('aria-expanded', 'false');

    if (isBottomSheetMode()) setSealToClosedPosition();

    unlockBodyScroll();
    setLexiconGlyph();
    noteClose();
    clearStackZIndex();

    if (!isBottomSheetMode()) restoreSealToDock();

    setTimeout(function () {
      var target = (focusReturnEl && doc.contains(focusReturnEl)) ? focusReturnEl : lexiconToggle;
      if (target && target.focus) target.focus();
      focusReturnEl = null;
    }, 0);
  }

  function openFromToggleIntent(e) {
    if (currentlySelectedKey) renderSentenceExplanation(currentlySelectedKey, currentlySelectedQuoteText, currentlySelectedFallbackKey);
    else renderOverview();
    openPanel(e);
  }

  validateSentenceKeys();
  registerWithUIStack();

  if (lexiconToggle && panel && lexOverlay) {
    setModeLabel();
    setLexiconGlyph();

    if (!isMobileGlyphMode) {
      lexiconToggle.addEventListener('pointerenter', function () { lexiconHovering = true; setLexiconGlyph(); });
      lexiconToggle.addEventListener('mouseenter', function () { lexiconHovering = true; setLexiconGlyph(); });
      lexiconToggle.addEventListener('focus', function () { lexiconHovering = true; setLexiconGlyph(); });
      lexiconToggle.addEventListener('pointerleave', function () { lexiconHovering = false; setLexiconGlyph(); });
      lexiconToggle.addEventListener('mouseleave', function () { lexiconHovering = false; setLexiconGlyph(); });
      lexiconToggle.addEventListener('blur', function () { lexiconHovering = false; setLexiconGlyph(); });
    }

    lexiconToggle.addEventListener('pointerdown', function (e) {
      if (e && e.pointerType === 'mouse' && typeof e.button === 'number' && e.button !== 0) return;
      triggerSealNudge();
    });

    lexiconToggle.addEventListener('keydown', function (e) {
      var k = e && e.key;
      if (k !== 'Enter' && k !== ' ') return;
      if (e && e.repeat) return;
      triggerSealNudge();
    });

    applyPressFeedback(lexiconToggle);

    bindActivate(lexiconToggle, function (e) {
      if (window.__COVENANT_SEAL_DRAG_JUST_HAPPENED) {
        window.__COVENANT_SEAL_DRAG_JUST_HAPPENED = false;
        return;
      }

      if (panel.classList.contains('is-open')) {
        if (!isTopmostForDismiss()) {
          bringSelfToFront();
          return;
        }

        markSealTapClosing();
        closePanel();
        return;
      }

      if (!(isIOS && isBottomSheetMode())) triggerSealPulse();
      markSealTapOpening();
      openFromToggleIntent(e);
    });

    bindActivate(lexOverlay, function () {
      if (!isTopmostForDismiss()) return;
      markSealTapClosing();
      closePanel();
    });

    var closeBtns = qsa('.lexicon-panel-close', panel);
    for (var i = 0; i < closeBtns.length; i++) {
      applyPressFeedback(closeBtns[i]);
      bindActivate(closeBtns[i], function (e) {
        stopEvent(e);
        markSealTapClosing();
        closePanel();
      });
    }

    doc.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && panel.classList.contains('is-open')) {
        if (!isTopmostForDismiss()) return;
        markSealTapClosing();
        closePanel();
      }
    });

    window.addEventListener('blur', function () {
      if (!isTopmostForDismiss()) return;
      if (panel.classList.contains('is-open')) {
        markSealTapClosing();
        closePanel();
      }
    });

    doc.addEventListener('visibilitychange', function () {
      if (!doc.hidden) return;
      if (!isTopmostForDismiss()) return;
      if (panel.classList.contains('is-open')) {
        markSealTapClosing();
        closePanel();
      }
    });
  }

  (function initGlossaryTwoTap() {
    var terms = qsa('.glossary-term');
    if (!terms || !terms.length) return;

    function isTouchLikeEvent(e) {
      return !!(isMobileGlyphMode || (e && e.pointerType && e.pointerType !== 'mouse'));
    }

    doc.addEventListener('pointerdown', function (e) {
      if (!closestSafe(e.target, '.glossary-term')) clearActiveTooltip();
    }, true);

    for (var i = 0; i < terms.length; i++) {
      (function (term) {
        term.addEventListener('click', function (e) {
          if (!isTouchLikeEvent(e)) return;
          if (currentlyActiveTooltip !== term) {
            stopEvent(e);
            clearActiveTooltip();
            term.classList.add('tooltip-active');
            currentlyActiveTooltip = term;
            return;
          }
        });
      })(terms[i]);
    }
  })();

  (function initSubpartSelection() {
    var subparts = qsa('.sentence.has-subparts .subpart');
    if (!subparts || !subparts.length) return;

    for (var i = 0; i < subparts.length; i++) {
      (function (subpart) {
        subpart.addEventListener('click', function (e) {
          stopEvent(e);
          clearActiveTooltip();

          var sentence = closestSafe(subpart, '.sentence');
          if (!sentence) return;

          var baseKey = (sentence.dataset && sentence.dataset.lexiconKey) ? String(sentence.dataset.lexiconKey) : '';
          if (!baseKey) return;

          var markerEl = qs('.subpart-marker', subpart);
          var letter = circledToLatin(markerEl ? normalizeWhitespace(markerEl.textContent) : '');
          if (!letter) return;

          var key = baseKey + '.' + letter;
          var quoteEl = qs('.subpart-content', subpart) || subpart;
          var quoteText = normalizeWhitespace(quoteEl.textContent);
          var hadPreviousSelection = !!currentlySelectedKey;
          var isSameSelection = (currentlySelectedKey === key);

          if (currentlySelectedSentence && currentlySelectedSentence !== sentence) {
            currentlySelectedSentence.classList.remove('is-selected');
          }
          clearSubpartSelection();

          if (isSameSelection) {
            sentence.classList.remove('is-selected');
            clearSelectionState();
            updateLexiconButtonState();
            updateCitationLabel(null, true);
            renderOverview();
            return;
          }

          sentence.classList.add('is-selected');
          currentlySelectedSentence = sentence;
          subpart.classList.add('is-subpart-selected');
          currentlySelectedSubpart = subpart;
          currentlySelectedKey = key;
          currentlySelectedFallbackKey = baseKey;
          currentlySelectedQuoteText = quoteText;
          updateLexiconButtonState();
          updateCitationLabel(key, hadPreviousSelection);
          renderSentenceExplanation(key, quoteText, baseKey);
        });
      })(subparts[i]);
    }
  })();

  (function initSentenceSelection() {
    var sentences = qsa('.sentence');
    if (!sentences || !sentences.length) return;

    for (var i = 0; i < sentences.length; i++) {
      (function (sentence) {
        sentence.addEventListener('click', function (e) {
          if (closestSafe(e && e.target, '.subpart')) return;
          clearActiveTooltip();

          var wasSelected = sentence.classList.contains('is-selected');
          var hadPreviousSelection = !!currentlySelectedKey;
          var hadSubpartInThisSentence = !!(currentlySelectedSubpart && currentlySelectedSentence === sentence);

          if (currentlySelectedSentence && currentlySelectedSentence !== sentence) {
            currentlySelectedSentence.classList.remove('is-selected');
          }
          clearSubpartSelection();

          if (wasSelected && !hadSubpartInThisSentence && currentlySelectedSentence === sentence) {
            sentence.classList.remove('is-selected');
            clearSelectionState();
            updateLexiconButtonState();
            updateCitationLabel(null, true);
            renderOverview();
            return;
          }

          sentence.classList.add('is-selected');
          currentlySelectedSentence = sentence;

          var key = sentence.dataset.lexiconKey;
          var text = sentence.dataset.sentenceText || sentence.textContent.replace(/^[0-9]+\.\s*/, '');
          text = normalizeWhitespace(text);
          currentlySelectedKey = key;
          currentlySelectedQuoteText = text;
          currentlySelectedFallbackKey = null;
          updateLexiconButtonState();
          updateCitationLabel(key, hadPreviousSelection);
          renderSentenceExplanation(key, text);
        });
      })(sentences[i]);
    }
  })();

  (function initMobileSealDrag() {
    if (!lexiconToggle || !panel || !lexOverlay) return;
    if (!window.PointerEvent) return;

    var dragging = false;
    var moved = false;
    var pointerId = null;
    var startY = 0;
    var lastY = 0;
    var lastT = 0;
    var velocity = 0;
    var startWasOpen = false;
    var closedY = 0;
    var midY = null;
    var currentY = 0;
    var startPanelY = 0;
    var panelHCache = 1;
    var dockObscurePxCache = 0;
    var MOVE_SLOP = 6;
    var OPEN_VELOCITY = -0.85;
    var OPEN_RATIO = 0.38;
    var CLOSE_VELOCITY = 0.85;
    var CLOSE_RATIO = 0.28;
    var SNAP_MS = getCssVarNumber('--lexicon-snap-duration', 420);
    var SNAP_EASE = getCssVarString('--lexicon-snap-ease', 'cubic-bezier(0.22, 0.61, 0.36, 1)');

    window.__COVENANT_SEAL_DRAG_JUST_HAPPENED = false;
    var dragIntentPulsed = false;
    var sealSettlingTimer = null;

    function clearSealSettling() {
      if (!lexiconToggle || !lexiconToggle.classList) return;
      lexiconToggle.classList.remove('is-seal-settling');
    }

    function markSealSettling(ms) {
      if (!lexiconToggle || !lexiconToggle.classList) return;

      if (sealSettlingTimer) {
        window.clearTimeout(sealSettlingTimer);
        sealSettlingTimer = null;
      }

      lexiconToggle.classList.add('is-seal-settling');
      sealSettlingTimer = window.setTimeout(function () {
        try { clearSealSettling(); } catch (err) {}
        sealSettlingTimer = null;
      }, Math.max(0, ms || 0) + 80);
    }

    function isMobileSheet() {
      return isBottomSheetMode();
    }

    function getClosedPeek() {
      return getCssVarNumber('--lexicon-panel-closed-peek', 0);
    }

    function getDockObscurePxSafeLocal() {
      var vh = getViewportHeightSafe();

      if (navFooter) {
        try {
          var r = navFooter.getBoundingClientRect();
          if (r && isFinite(r.top)) return Math.max(0, Math.round(vh - r.top));
          if (r && r.height) return Math.max(0, Math.round(r.height));
        } catch (err0) {}
      }

      var val = getCssVar('--footer-total-height');
      var n = parseFloat(val);
      return isFinite(n) ? Math.max(0, Math.round(n)) : 0;
    }

    function computeClosedY() {
      var rect = panel.getBoundingClientRect();
      panelHCache = (rect && rect.height) ? rect.height : 1;
      dockObscurePxCache = getDockObscurePxSafeLocal();
      var peek = getClosedPeek();
      closedY = Math.max(1, panelHCache - (dockObscurePxCache + peek));
    }

    function computeMidY() {
      var contentH = measureLexiconContentHeight();
      var availAboveDock = Math.max(180, Math.round(getViewportHeightSafe() - dockObscurePxCache));
      var capH = Math.round(availAboveDock * 0.60);
      var desired = Math.min(contentH, capH);

      var y = Math.round(panelHCache - (dockObscurePxCache + desired));
      if (y < 0) y = 0;
      if (y > closedY) y = closedY;
      if (Math.abs(y) < 12) return null;
      if (Math.abs(y - closedY) < 12) return null;
      return y;
    }

    function setPanelY(y, sealDragging) {
      if (typeof sealDragging !== 'boolean') sealDragging = true;

      currentY = y;
      panel.style.transform = 'translateY(' + y + 'px)';

      var denom = (closedY || 1);
      var progress = 1 - (y / denom);
      if (progress < 0) progress = 0;
      if (progress > 1) progress = 1;

      var seatNudge = getSeatNudge();
      var openDrop = (isIOS ? 1 : 0) * progress;
      var sealOffset = (y - closedY) + (seatNudge * progress) + openDrop;

      setSealDragOffset(sealOffset, sealDragging);

      if (lexOverlay) {
        if (isBottomSheetMode() && !sealDragging && y > MID_REST_NON_MODAL_PX) {
          lexOverlay.style.opacity = '0';
          lexOverlay.style.pointerEvents = 'none';
        } else {
          lexOverlay.style.opacity = String(progress);
          lexOverlay.style.pointerEvents = '';
        }
      }

      // Live drag stays transform-only; body sizing + stored state are committed on snap.
    }

    function ensureOpenShellFromDrag() {
      clearSealTapClasses();
      clearSealSettling();

      if (!panel.classList.contains('is-open')) {
        panel.classList.add('is-open');
        lexOverlay.classList.add('is-open');
        panel.setAttribute('aria-hidden', 'false');
        lexOverlay.setAttribute('aria-hidden', 'false');
        lexiconToggle.setAttribute('aria-expanded', 'true');
        lockBodyScroll();
        setLexiconGlyph();
        noteOpen();
      } else {
        bringSelfToFront();
      }

      applyLexiconBodyDockInset(getDockObscurePxSafe());
    }

    function finalizeFullyOpenFromDrag() {
      var raf = window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 0); };
      raf(function () {
        var dockObscurePx = getDockObscurePxSafe();
        applyLexiconBodySizingForY(0, dockObscurePx);
        applyLexiconBodyDockInset(dockObscurePx);
        setSealToOpenPosition();
        storePanelY(0);
      });
    }

    function applyClosedStateFromDrag() {
      clearSealTapClasses();

      if (panel.classList.contains('is-open')) {
        panel.classList.remove('is-open');
        lexOverlay.classList.remove('is-open');
        panel.setAttribute('aria-hidden', 'true');
        lexOverlay.setAttribute('aria-hidden', 'true');
        lexiconToggle.setAttribute('aria-expanded', 'false');
        unlockBodyScroll();
        setLexiconGlyph();
        noteClose();
        clearStackZIndex();
      }

      try {
        if (lexOverlay) lexOverlay.style.pointerEvents = '';
      } catch (err0) {}

      clearLexiconBodyDockInset();
      clearLexiconBodySizing();
      clearSealDragOffset();
      storePanelY(closedY);
    }

    function snap() {
      var openY = 0;
      var targetY = null;
      var mid = (typeof midY === 'number' && isFinite(midY)) ? Math.round(midY) : null;
      var closed = Math.max(1, Math.round(closedY || 1));

      if (startWasOpen) {
        var dragDown = currentY - 0;
        if (velocity > CLOSE_VELOCITY || dragDown > closed * CLOSE_RATIO) targetY = closed;
      } else {
        var dragUp = closed - currentY;
        if (velocity < OPEN_VELOCITY || dragUp > closed * OPEN_RATIO) targetY = openY;
      }

      if (targetY === null) {
        if (velocity < OPEN_VELOCITY) targetY = openY;
        else if (velocity > CLOSE_VELOCITY) targetY = closed;
        else {
          var candidates = [openY, closed];
          if (mid !== null) candidates.splice(1, 0, mid);
          targetY = candidates[0];
          var bestDist = Math.abs(currentY - targetY);
          for (var i = 1; i < candidates.length; i++) {
            var d = Math.abs(currentY - candidates[i]);
            if (d < bestDist) {
              bestDist = d;
              targetY = candidates[i];
            }
          }
        }
      }

      panel.style.transition = 'transform ' + SNAP_MS + 'ms ' + SNAP_EASE;
      if (lexOverlay) lexOverlay.style.transition = 'opacity ' + SNAP_MS + 'ms ' + SNAP_EASE;

      if (targetY === closed) {
        markSealSettling(SNAP_MS);
        currentY = closed;
        panel.style.transform = 'translateY(' + closed + 'px)';
        if (lexOverlay) {
          lexOverlay.style.opacity = '0';
          lexOverlay.style.pointerEvents = '';
        }
        applyClosedStateFromDrag();
      } else {
        ensureOpenShellFromDrag();

        if (targetY === openY) {
          setPanelY(openY, false);
          finalizeFullyOpenFromDrag();
        } else {
          applyMobileRestingY(targetY, closed, false);
        }
      }

      setTimeout(function () {
        panel.style.transition = '';
        if (lexOverlay) lexOverlay.style.transition = '';
        if (targetY === closed || targetY === openY) {
          panel.style.transform = '';
          if (lexOverlay) lexOverlay.style.opacity = '';
        }
      }, SNAP_MS + 20);
    }

    lexiconToggle.addEventListener('pointerdown', function (e) {
      if (!isMobileSheet()) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      clearSealSettling();
      dragging = true;
      moved = false;
      dragIntentPulsed = false;
      pointerId = e.pointerId;
      startY = e.clientY;
      lastY = startY;
      lastT = Date.now();
      velocity = 0;
      startWasOpen = panel.classList.contains('is-open');

      computeClosedY();
      midY = computeMidY();

      var stored = startWasOpen ? readStoredPanelY() : null;
      if (!isFinite(stored)) stored = 0;
      if (stored < 0) stored = 0;
      if (stored > closedY) stored = closedY;

      startPanelY = startWasOpen ? stored : closedY;
      currentY = startPanelY;

      panel.classList.add('is-dragging');
      panel.style.transition = 'none';
      if (lexOverlay) lexOverlay.style.transition = 'none';
      panel.style.transform = 'translateY(' + currentY + 'px)';
      setPanelY(currentY, true);

      lexiconToggle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    lexiconToggle.addEventListener('pointermove', function (e) {
      if (!dragging || e.pointerId !== pointerId) return;

      var deltaY = e.clientY - startY;
      if (!moved && Math.abs(deltaY) > MOVE_SLOP) {
        moved = true;
        window.__COVENANT_SEAL_DRAG_JUST_HAPPENED = true;
        if (!dragIntentPulsed) {
          dragIntentPulsed = true;
          triggerSealNudge();
        }
      }
      if (!moved) return;

      var now = Date.now();
      var dt = now - lastT;
      if (dt > 0) velocity = (e.clientY - lastY) / dt;
      lastY = e.clientY;
      lastT = now;

      var base = startWasOpen ? startPanelY : closedY;
      var targetY = base + deltaY;
      if (targetY < 0) targetY = 0;
      if (targetY > closedY) targetY = closedY;

      setPanelY(targetY, true);
      e.preventDefault();
    });

    function endDrag(e) {
      if (!dragging || (e && e.pointerId !== pointerId)) return;

      dragging = false;
      panel.classList.remove('is-dragging');

      if (moved) {
        window.__COVENANT_SEAL_DRAG_JUST_HAPPENED = true;
        setTimeout(function () { window.__COVENANT_SEAL_DRAG_JUST_HAPPENED = false; }, 300);
        snap();
      }

      if (e && lexiconToggle.hasPointerCapture && lexiconToggle.hasPointerCapture(e.pointerId)) {
        lexiconToggle.releasePointerCapture(e.pointerId);
      }
    }

    lexiconToggle.addEventListener('pointerup', endDrag);
    lexiconToggle.addEventListener('pointercancel', endDrag);
    lexiconToggle.addEventListener('lostpointercapture', endDrag);
  })();

})();
