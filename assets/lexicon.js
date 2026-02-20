/*! Covenant Lexicon UI v0.3.4 (Overflow-only Scroll Lock) */
(function () {
  'use strict';

  // Exposed for quick verification during future page migrations.
  window.COVENANT_LEXICON_VERSION = '0.3.4';

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

  // ----------------------------------------------------------
  // Covenant Journey Header Standardization
  // ----------------------------------------------------------
  // Policy: Invocation → XII use the compact header style.
  // This ensures Foundation/Declaration and Articles II–X conform
  // without having to hand-edit each page during migration.
  // (rituals.html is intentionally excluded.)
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

  // Optional: coordinated UI stack (true surface layering across panels).
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

        // Participate in shared scroll lock.
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
    // Important: when Lexicon closes back to its "peek" state, it must not keep the
    // last UI-stack inline z-index from its open state; otherwise it can sit above
    // ToC/Reliquary tabs after an open→close cycle.
    try { if (lexOverlay) lexOverlay.style.zIndex = ''; } catch (err1) {}
    try { if (panel) panel.style.zIndex = ''; } catch (err2) {}
  }

  var sealClearTimer = null;

  // Policy: On mobile bottom-sheet, the panel should ONLY be dragged down from the footer seal.
  // The top drag handle is kept in markup for compatibility, but disabled here.
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

    // Round to avoid feeding fractional scroll offsets back into layout.
    scrollLockY = Math.round(window.scrollY || window.pageYOffset || 0);

    // Keep footer dock sovereign above the Lexicon overlay/panel.
    root.classList.add('lexicon-scroll-lock');

    // iOS Safari: toggling overflow hidden can nudge visualViewport and tick fixed docks by ~1px.
    // Local lock on iOS uses only the touchmove blocker.
    if (isIOS) {
      enableIOSTouchScrollLock();
      return;
    }

    // Overflow-only scroll lock (non-iOS).
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

  // ----------------------------------------
  // Seal interaction feedback (pulse + nudge)
  // ----------------------------------------
  var sealPulseTimer = null;
  var sealNudgeTimer = null;

  function getNavPulseDurationMs() {
    // CSS var is typically like "520ms"; parseFloat yields 520.
    return getCssVarNumber('--nav-pulse-duration', 520);
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

  // ----------------------------------------
  // Lexicon toggle glyph management
  // ----------------------------------------
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

  // ----------------------------------------
  // Mode label
  // ----------------------------------------
  var modeEl = byId('lexiconModeLabel') || qs('.lexicon-panel-mode');
  function setModeLabel() {
    if (!pageConfig.modeLabel || !modeEl) return;
    modeEl.textContent = pageConfig.modeLabel;
  }

  // ----------------------------------------
  // Sentence key validation
  // ----------------------------------------
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

  // ----------------------------------------
  // Intro sequencing
  // ----------------------------------------
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

  // ========================================
  // Citation Label Management
  // ========================================
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
  }

  initializeCitationLabel();

  // ========================================
  // Panel open/close + content rendering
  // ========================================
  function resetPanelInlineMotion() {
    if (!panel) return;
    panel.classList.remove('is-dragging');
    panel.style.transform = '';
    panel.style.transition = '';
    if (lexOverlay) {
      lexOverlay.style.opacity = '';
      lexOverlay.style.transition = '';
    }
  }

  function getPanelHeightSafe() {
    if (!panel) return 0;
    var rect = panel.getBoundingClientRect();
    return (rect && rect.height) ? rect.height : 0;
  }

  function getFooterHeightSafe() {
    if (navFooter) {
      var r = navFooter.getBoundingClientRect();
      if (r && r.height) return r.height;
    }

    var val = getCssVar('--footer-total-height');
    var n = parseFloat(val);
    return isFinite(n) ? n : 0;
  }

  function getSeatNudge() {
    if (!lexiconToggle) return 0;
    return getCssVarNumber('--seal-seat-nudge-closed', 0);
  }

  function getClosedPeek() {
    return getCssVarNumber('--lexicon-panel-closed-peek', 0);
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
    var h = getPanelHeightSafe();
    var f = getFooterHeightSafe();
    var p = getClosedPeek();
    var n = getSeatNudge();

    var OPEN_DROP_PX = isIOS ? 1 : 0;

    // Important: include closed peek so tap-open matches drag-open kinematics.
    // Without the peek, the seal travels a shorter distance than the sheet.
    if (h > 0) setSealDragOffset(-(h - (f + p)) + n + OPEN_DROP_PX, false);
  }

  function setSealToClosedPosition() {
    clearSealDragOffset();
  }

  function isKeyboardIntentEvent(e) {
    // In most browsers, keyboard activation of a button produces a click with detail === 0.
    try {
      if (!e) return false;
      if (e.type === 'click' && typeof e.detail === 'number' && e.detail === 0) return true;
      if (e.type === 'keydown') return true;
    } catch (err) {}
    return false;
  }

  function focusIntoPanel(preferCloseFocus) {
    if (!panel) return;

    // Avoid the “yellow box” focus ring on pointer-open; keep keyboard access intact.
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
      dynamicContent.innerHTML =
        '<div class="lexicon-sentence-quote">"' + safeSentence + "\"</div><p>" + explanation + '</p>';
      dynamicContent.style.opacity = '1';
    }, 150);
  }

  function openPanel(openEvent) {
    if (!panel || !lexOverlay) return;

    clearActiveTooltip();
    resetPanelInlineMotion();

    focusReturnEl = lexiconToggle;

    panel.classList.add('is-open');
    lexOverlay.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    lexOverlay.setAttribute('aria-hidden', 'false');
    if (lexiconToggle) lexiconToggle.setAttribute('aria-expanded', 'true');

    lockBodyScroll();
    setLexiconGlyph();

    noteOpen();

    if (isBottomSheetMode()) {
      // Start the seal move immediately (same tick as class changes) so it rides with the sheet.
      setSealToOpenPosition();

      // Then correct next frame in case any layout-driven height changed.
      var raf = window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 0); };
      raf(function () { setSealToOpenPosition(); });
    }

    var preferCloseFocus = isKeyboardIntentEvent(openEvent);
    setTimeout(function () { focusIntoPanel(preferCloseFocus); }, 0);
  }

  function closePanel() {
    if (!panel || !lexOverlay) return;

    clearActiveTooltip();
    resetPanelInlineMotion();

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

  // ========================================
  // Initialization / event wiring
  // ========================================
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

    // Intent feedback for activation/drag/keyboard intent (not hover).
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

        closePanel();
        return;
      }

      triggerSealPulse();
      openFromToggleIntent(e);
    });

    bindActivate(lexOverlay, function () {
      if (!isTopmostForDismiss()) return;
      closePanel();
    });

    var closeBtns = qsa('.lexicon-panel-close', panel);
    for (var i = 0; i < closeBtns.length; i++) {
      applyPressFeedback(closeBtns[i]);
      bindActivate(closeBtns[i], function (e) {
        stopEvent(e);
        closePanel();
      });
    }

    doc.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && panel.classList.contains('is-open')) {
        if (!isTopmostForDismiss()) return;
        closePanel();
      }
    });

    window.addEventListener('blur', function () {
      if (!isTopmostForDismiss()) return;
      if (panel.classList.contains('is-open')) closePanel();
    });

    doc.addEventListener('visibilitychange', function () {
      if (!doc.hidden) return;
      if (!isTopmostForDismiss()) return;
      if (panel.classList.contains('is-open')) closePanel();
    });
  }

  // ---- Glossary Terms: two-tap on touch ----
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

  // ---- Subpart Selection (Ⓐ/Ⓑ/Ⓒ...) ----
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

  // ---- Sentence Selection ----
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

  // ---- Mobile seal drag -> drag panel open/close (bottom sheet) ----
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
    var currentY = 0;

    var MOVE_SLOP = 6;

    var OPEN_VELOCITY = -0.85;
    var OPEN_RATIO = 0.38;

    var CLOSE_VELOCITY = 0.85;
    var CLOSE_RATIO = 0.28;

    var SNAP_MS = getCssVarNumber('--lexicon-snap-duration', 420);
    var SNAP_EASE = getCssVarString('--lexicon-snap-ease', 'cubic-bezier(0.22, 0.61, 0.36, 1)');

    window.__COVENANT_SEAL_DRAG_JUST_HAPPENED = false;

    var dragIntentPulsed = false;

    function isMobileSheet() {
      return isBottomSheetMode();
    }

    function getClosedPeek() {
      return getCssVarNumber('--lexicon-panel-closed-peek', 0);
    }

    function computeClosedY() {
      var rect = panel.getBoundingClientRect();
      var panelH = (rect && rect.height) ? rect.height : 1;
      var footerH = getFooterHeightSafe();
      var peek = getClosedPeek();
      closedY = Math.max(1, panelH - (footerH + peek));
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

      if (lexOverlay) lexOverlay.style.opacity = String(progress);
    }

    function applyOpenStateFromDrag() {
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

      var raf = window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 0); };
      raf(function () { setSealToOpenPosition(); });
    }

    function applyClosedStateFromDrag() {
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
      clearSealDragOffset();
    }

    function snap() {
      var shouldOpen = false;

      if (startWasOpen) {
        var dragDown = currentY - 0;
        shouldOpen = !(velocity > CLOSE_VELOCITY || dragDown > closedY * CLOSE_RATIO);
      } else {
        var dragUp = closedY - currentY;
        shouldOpen = (velocity < OPEN_VELOCITY || dragUp > closedY * OPEN_RATIO);
      }

      panel.style.transition = 'transform ' + SNAP_MS + 'ms ' + SNAP_EASE;
      if (lexOverlay) lexOverlay.style.transition = 'opacity ' + SNAP_MS + 'ms ' + SNAP_EASE;

      if (shouldOpen) {
        setPanelY(0, false);
        applyOpenStateFromDrag();
      } else {
        currentY = closedY;
        panel.style.transform = 'translateY(' + closedY + 'px)';
        if (lexOverlay) lexOverlay.style.opacity = '0';
        applyClosedStateFromDrag();
      }

      setTimeout(function () {
        panel.style.transform = '';
        panel.style.transition = '';
        if (lexOverlay) {
          lexOverlay.style.opacity = '';
          lexOverlay.style.transition = '';
        }
      }, SNAP_MS + 20);
    }

    lexiconToggle.addEventListener('pointerdown', function (e) {
      if (!isMobileSheet()) return;

      if (e.pointerType === 'mouse' && e.button !== 0) return;

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
      currentY = startWasOpen ? 0 : closedY;

      panel.classList.add('is-dragging');
      panel.style.transition = 'none';
      if (lexOverlay) lexOverlay.style.transition = 'none';

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

      var base = startWasOpen ? 0 : closedY;
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
