/*! Covenant Lexicon UI v0.2.26 */
(function () {
    'use strict';

    // Exposed for quick verification during future page migrations.
    window.COVENANT_LEXICON_VERSION = '0.2.26';

    var pageConfig = window.COVENANT_PAGE || {};
    var pageId = pageConfig.pageId || '';
    var sentenceExplanations = pageConfig.sentenceExplanations || {};

    var logPrefix = pageId ? ('[Covenant Lexicon / ' + pageId + ']') : '[Covenant Lexicon]';

    var loadingIcon = document.getElementById('loadingIcon');
    var overlay = document.getElementById('blackFadeOverlay');
    var container = document.querySelector('.container');
    var navFooter = document.getElementById('navFooter');
    var panel = document.getElementById('lexiconPanel');
    var lexiconToggle = document.getElementById('lexiconToggle');
    var lexOverlay = document.getElementById('lexiconOverlay');
    var dynamicContent = document.getElementById('lexiconDynamicContent');
    var dragRegion = document.getElementById('lexiconDragRegion');
    var citationText = document.getElementById('citationText');
    var sealClearTimer = null;

    // Policy: On mobile bottom-sheet, the panel should ONLY be dragged down from the footer seal.
    // The top drag handle is kept in markup for compatibility, but disabled here.
    var ENABLE_PANEL_HANDLE_DRAG = false;

    if (dragRegion && !ENABLE_PANEL_HANDLE_DRAG) {
        // Remove any implied affordance + ensure it can't intercept touches.
        dragRegion.style.display = 'none';
        dragRegion.style.pointerEvents = 'none';
        dragRegion.setAttribute('aria-hidden', 'true');
    }

    // Standardize the "seal" glyph used for the intro loader across Covenant pages.
    // Canonical default: _includes/covenant-config.html (included via _includes/head-fonts.html).
    // Override options:
    // - window.COVENANT_LOADING_GLYPH = '✦'
    // - window.COVENANT_PAGE.loadingGlyph = '✦'
    var loadingGlyph = (pageConfig && pageConfig.loadingGlyph) || window.COVENANT_LOADING_GLYPH || '֎';
    if (loadingIcon) {
        var currentGlyph = (loadingIcon.textContent || '').trim();
        if (currentGlyph !== loadingGlyph) {
            loadingIcon.textContent = loadingGlyph;
        }
    }

    // Back-compat: if pageConfig.defaultOverviewHTML is not set yet (older pages), fall back to DOM capture.
    var defaultOverviewHTML = pageConfig.defaultOverviewHTML || (dynamicContent ? dynamicContent.innerHTML : '');

    // If a page provides overview via config, treat the panel body as JS-driven.
    if (dynamicContent && pageConfig.defaultOverviewHTML) {
        dynamicContent.innerHTML = pageConfig.defaultOverviewHTML;
    }

    var currentlySelectedSentence = null;
    var currentlyActiveTooltip = null;
    var focusReturnEl = null;
    var scrollLockY = 0;

    var mobileGlyphMql = window.matchMedia ? window.matchMedia('(hover: none), (pointer: coarse)') : null;
    var isMobileGlyphMode = !!(mobileGlyphMql && mobileGlyphMql.matches);

    var bottomSheetMql = window.matchMedia ? window.matchMedia('(max-width: 600px)') : null;

    // iOS Safari (and iOS WKWebView) is particularly sensitive to the "body { position: fixed }" scroll-lock pattern.
    // When the user is near the bottom, it can expose the black html background and, worse, get stuck in a non-interactive state.
    // Use an iOS-specific scroll lock that avoids fixing the body and instead prevents background touch scrolling.
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
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function isBottomSheetMode() {
        return !!(bottomSheetMql && bottomSheetMql.matches);
    }

    function enableIOSTouchScrollLock() {
        if (iosTouchMoveBlocker) return;

        iosTouchMoveBlocker = function (e) {
            // Only relevant while the panel is open.
            if (!panel || !panel.classList.contains('is-open')) return;

            // Allow scrolling inside the panel body.
            var withinPanelBody = !!closestSafe(e.target, '.lexicon-panel-body');
            if (withinPanelBody) return;

            // Block everything else (prevents the page behind from scrolling / rubber-banding).
            if (e && e.cancelable) e.preventDefault();
        };

        // Capture + passive:false are required to reliably prevent iOS background scrolling.
        document.addEventListener('touchmove', iosTouchMoveBlocker, { capture: true, passive: false });
    }

    function disableIOSTouchScrollLock() {
        if (!iosTouchMoveBlocker) return;
        document.removeEventListener('touchmove', iosTouchMoveBlocker, { capture: true });
        iosTouchMoveBlocker = null;
    }

    function lockBodyScroll() {
        if (document.documentElement.classList.contains('lexicon-scroll-lock')) return;
        scrollLockY = window.scrollY || window.pageYOffset || 0;

        // Always lock the root element.
        document.documentElement.classList.add('lexicon-scroll-lock');

        if (isIOS) {
            // iOS path: do not apply body fixed positioning (avoid black gaps + stuck interaction).
            document.body.style.overflow = 'hidden';
            enableIOSTouchScrollLock();
            return;
        }

        // Default path (desktop + most browsers): fixed-body lock.
        document.body.classList.add('lexicon-scroll-lock');
        document.body.style.top = (-scrollLockY) + 'px';
    }

    function unlockBodyScroll() {
        if (!document.documentElement.classList.contains('lexicon-scroll-lock')) return;

        document.documentElement.classList.remove('lexicon-scroll-lock');

        if (isIOS) {
            disableIOSTouchScrollLock();
            document.body.style.overflow = '';
            // On iOS we never moved the body, so no scrollTo correction is needed,
            // but keeping it is harmless and normalizes edge cases.
            window.scrollTo(0, scrollLockY);
            return;
        }

        document.body.classList.remove('lexicon-scroll-lock');
        document.body.style.top = '';
        window.scrollTo(0, scrollLockY);
    }

    function clearActiveTooltip() {
        if (!currentlyActiveTooltip) return;
        currentlyActiveTooltip.classList.remove('tooltip-active');
        currentlyActiveTooltip = null;
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
            el.addEventListener('pointerup', function () {
                setTimeout(remove, 160);
            });
            el.addEventListener('pointercancel', remove);
            el.addEventListener('pointerleave', remove);
        } else {
            el.addEventListener('touchstart', add, { passive: true });
            el.addEventListener('touchend', function () {
                setTimeout(remove, 160);
            }, { passive: true });
            el.addEventListener('touchcancel', remove, { passive: true });
        }
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

        while (target.firstChild) {
            target.removeChild(target.firstChild);
        }

        var star = '𖤓';
        var idx = glyph.indexOf(star);
        if (idx === -1) {
            target.textContent = glyph;
            return;
        }

        var left = glyph.slice(0, idx);
        var right = glyph.slice(idx + star.length);

        target.appendChild(document.createTextNode(left));

        var midOuter = document.createElement('span');
        midOuter.className = 'lexicon-glyph-mid';

        var midInner = document.createElement('span');
        midInner.className = 'lexicon-glyph-mid-inner';
        midInner.textContent = star;

        midOuter.appendChild(midInner);
        target.appendChild(midOuter);

        target.appendChild(document.createTextNode(right));
    }

    function setLexiconGlyph() {
        if (!lexiconToggle || !panel) return;

        var isOpen = panel.classList.contains('is-open');
        var hasSelection = !!currentlySelectedSentence;
        var glyphTarget = lexiconToggle.querySelector('.lexicon-glyph') || lexiconToggle;

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

    function setModeLabel() {
        if (!pageConfig.modeLabel) return;
        var modeEl = document.getElementById('lexiconModeLabel') || document.querySelector('.lexicon-panel-mode');
        if (modeEl) modeEl.textContent = pageConfig.modeLabel;
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
        var nodes = document.querySelectorAll('.sentence');
        if (!nodes || !nodes.length) return;

        var seen = Object.create(null);
        var duplicates = Object.create(null);
        var missingCount = 0;
        var nonstandard = Object.create(null);

        var pattern = resolveKeyPattern();

        Array.prototype.forEach.call(nodes, function (node) {
            var key = node && node.dataset ? node.dataset.lexiconKey : null;
            if (!key) {
                missingCount += 1;
                return;
            }

            if (!pattern.test(key)) {
                nonstandard[key] = true;
            }

            if (seen[key]) {
                duplicates[key] = true;
            }
            seen[key] = true;
        });

        var dupKeys = Object.keys(duplicates);
        if (dupKeys.length) {
            console.warn(logPrefix, 'Duplicate data-lexicon-key values found:', dupKeys);
        }

        if (missingCount) {
            console.warn(logPrefix, 'Some .sentence elements are missing data-lexicon-key:', missingCount);
        }

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
            document.documentElement.style.setProperty(name, String(value));
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

            // Panel should "spawn" first, but footer should become visible sooner.
            // This delay ensures the footer fade begins slightly after the panel fade starts.
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

                // Spawn panel first.
                if (panel) panel.classList.add('fade-in');

                // Then bring the footer in quickly; its shorter duration makes it "arrive" first.
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

    /**
     * Format citation based on page config and selection state.
     * @param {string|null} sentenceKey - The data-lexicon-key of selected sentence, or null for page overview
     * @returns {string} - Formatted citation text
     */
    function formatCitation(sentenceKey) {
        // If a sentence is selected, format as passage citation
        if (sentenceKey) {
            // Check if this is an Article page (I-XII)
            var articleMatch = sentenceKey.match(/^([IVX]+)\./);
            if (articleMatch) {
                return 'Art. §\u2011' + sentenceKey;
            }
            
            // For other pages with numbered sentences, use section marker
            return '§\u2011' + sentenceKey;
        }

        // Page overview citations
        var pageLabel = pageConfig.citationLabel || pageConfig.sectionLabel || pageConfig.pageId || '';
        
        // Apply special formatting rules based on pageId
        if (pageConfig.pageId === 'invocation') {
            return 'Invocation and Preamble';
        } else if (pageConfig.pageId === 'foundation') {
            return 'Foundation';
        } else if (pageConfig.pageId === 'declaration') {
            return 'Declaration';
        } else if (pageConfig.pageId && pageConfig.pageId.match(/^[IVX]+$/)) {
            return 'Article ' + pageConfig.pageId;
        }

        return pageLabel;
    }

    /**
     * Update the citation label with appropriate transition.
     * @param {string|null} sentenceKey - The data-lexicon-key of selected sentence, or null
     * @param {boolean} fromSelection - Was there a selection before this update?
     */
    function updateCitationLabel(sentenceKey, fromSelection) {
        if (!citationText) return;

        var newText = formatCitation(sentenceKey);
        if (newText === lastCitationText) return;

        var isToSelection = !!sentenceKey;
        var wasSelection = fromSelection;

        // Remove any existing animation classes
        citationText.classList.remove('slide-up', 'slide-up-dramatic', 'slide-down');

        // Determine transition type
        var animClass;
        if (!wasSelection && isToSelection) {
            // Page overview → selected passage: dramatic upward
            animClass = 'slide-up-dramatic';
        } else if (wasSelection && !isToSelection) {
            // Selected passage → page overview: swift downward
            animClass = 'slide-down';
        } else if (wasSelection && isToSelection) {
            // Passage → passage: tight quick upward
            animClass = 'slide-up';
        } else {
            // Overview → overview (shouldn't happen often): no animation
            animClass = null;
        }

        // Update text content
        citationText.textContent = newText;
        lastCitationText = newText;

        // Apply animation if appropriate
        if (animClass) {
            // Force reflow to restart animation
            void citationText.offsetWidth;
            citationText.classList.add(animClass);
        }
    }

    /**
     * Initialize citation label on page load.
     */
    function initializeCitationLabel() {
        if (!citationText) return;
        var initialText = formatCitation(null);
        citationText.textContent = initialText;
        lastCitationText = initialText;
    }

    // Initialize citation on page load
    initializeCitationLabel();

    function updateLexiconButtonState() {
        if (!lexiconToggle) return;
        lexiconToggle.classList.toggle('has-selection', !!currentlySelectedSentence);
        setLexiconGlyph();
    }

    function resetPanelInlineMotion() {
        if (!panel) return;
        panel.classList.remove('is-dragging');
        panel.style.transform = '';
        panel.style.transition = '';
        if (lexOverlay) lexOverlay.style.opacity = '';
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

        // Fallback: CSS variable (should resolve to px in computed style).
        try {
            var style = window.getComputedStyle(document.documentElement);
            var val = style.getPropertyValue('--footer-total-height').trim();
            if (val) return parseFloat(val) || 0;
        } catch (err) { }

        return 0;
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

    function clearSealDragOffsetSoon(ms) {
        if (!lexiconToggle) return;

        if (sealClearTimer) {
            window.clearTimeout(sealClearTimer);
            sealClearTimer = null;
        }

        sealClearTimer = window.setTimeout(function () {
            sealClearTimer = null;
            if (!lexiconToggle) return;
            lexiconToggle.style.removeProperty('--seal-drag-y');
            lexiconToggle.classList.remove('is-seal-dragging');
        }, ms || 0);
    }

    function setSealToOpenPosition() {
        // On mobile bottom-sheet, the seal should meet the sheet lip.
        // The seal lives inside the footer, so subtract the footer height from the panel height.
        // NOTE: In mobile sheet mode we keep the seat nudge active (CSS), so we counterbalance it here.
        var h = getPanelHeightSafe();
        var f = getFooterHeightSafe();
        var n = getSeatNudge();
        if (h > 0) setSealDragOffset(-(h - f) + n, false);
    }

    function setSealToClosedPosition() {
        // Seal sits in the footer notch.
        setSealDragOffset(0, false);
        clearSealDragOffsetSoon(520);
    }

    // Read the CSS seating nudge (upward offset while closed).
    function getSeatNudge() {
        if (!lexiconToggle) return 0;
        try {
            var style = window.getComputedStyle(document.documentElement);
            var val = style.getPropertyValue('--seal-seat-nudge-closed').trim();
            if (!val) return 0;
            return parseFloat(val) || 0;
        } catch (err) {
            return 0;
        }
    }

    function focusIntoPanel() {
        if (!panel) return;
        var closeBtn = panel.querySelector('.lexicon-panel-close');
        if (closeBtn && closeBtn.focus) {
            closeBtn.focus();
        } else if (panel.focus) {
            panel.focus();
        }
    }

    function openPanel() {
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

        // Mobile bottom-sheet: lift the same footer seal up with the panel.
        // Use rAF so the seal and the panel transition begin on the same paint (prevents the seal "leading" the sheet).
        if (isBottomSheetMode()) {
            var raf = window.requestAnimationFrame || function (cb) { return window.setTimeout(cb, 0); };
            raf(function () {
                setSealToOpenPosition();
            });
        }

        setTimeout(focusIntoPanel, 0);
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

        // Mobile bottom-sheet: let the seal descend back into the notch.
        if (isBottomSheetMode()) {
            setSealToClosedPosition();
        }

        unlockBodyScroll();
        setLexiconGlyph();

        setTimeout(function () {
            var target = (focusReturnEl && document.contains(focusReturnEl)) ? focusReturnEl : lexiconToggle;
            if (target && target.focus) target.focus();
            focusReturnEl = null;
        }, 0);
    }

    function renderOverview() {
        if (!dynamicContent) return;
        dynamicContent.style.opacity = '0';
        setTimeout(function () {
            dynamicContent.innerHTML = defaultOverviewHTML;
            dynamicContent.style.opacity = '1';
        }, 150);
    }

    function renderSentenceExplanation(key, sentenceText) {
        if (!dynamicContent) return;
        var explanation = sentenceExplanations[key];
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

    validateSentenceKeys();

    if (lexiconToggle && panel && lexOverlay) {
        setModeLabel();
        setLexiconGlyph();

        if (!isMobileGlyphMode) {
            ['pointerenter', 'mouseenter', 'focus'].forEach(function (evt) {
                lexiconToggle.addEventListener(evt, function () {
                    lexiconHovering = true;
                    setLexiconGlyph();
                });
            });
            ['pointerleave', 'mouseleave', 'blur'].forEach(function (evt) {
                lexiconToggle.addEventListener(evt, function () {
                    lexiconHovering = false;
                    setLexiconGlyph();
                });
            });
        }

        applyPressFeedback(lexiconToggle);

        bindActivate(lexiconToggle, function () {

            // Prevent drag-then-tap from also toggling
            if (window.__COVENANT_SEAL_DRAG_JUST_HAPPENED) {
                window.__COVENANT_SEAL_DRAG_JUST_HAPPENED = false;
                return;
            }

            if (panel.classList.contains('is-open')) {
                closePanel();
            } else {
                if (currentlySelectedSentence && currentlySelectedSentence.dataset.lexiconKey) {
                    renderSentenceExplanation(currentlySelectedSentence.dataset.lexiconKey, currentlySelectedSentence.dataset.sentenceText);
                } else {
                    renderOverview();
                }
                openPanel();
            }
        });

        bindActivate(lexOverlay, function () {
            closePanel();
        });

        Array.prototype.forEach.call(panel.querySelectorAll('.lexicon-panel-close'), function (btn) {
            applyPressFeedback(btn);
            bindActivate(btn, function (e) {
                if (e && e.preventDefault) e.preventDefault();
                closePanel();
            });
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && panel.classList.contains('is-open')) {
                closePanel();
            }
        });

        // Hard safety net: if the browser loses focus or hides the tab while the panel is open,
        // force-close and unlock scroll so the page cannot get "stuck".
        window.addEventListener('blur', function () {
            if (panel.classList.contains('is-open')) closePanel();
        });
        document.addEventListener('visibilitychange', function () {
            if (document.hidden && panel.classList.contains('is-open')) closePanel();
        });
    }

    // ---- Sentence Selection ----
    (function initSentenceSelection() {
        var sentences = document.querySelectorAll('.sentence');
        if (!sentences || !sentences.length) return;

        Array.prototype.forEach.call(sentences, function (sentence) {
            sentence.addEventListener('click', function () {
                var wasSelected = sentence.classList.contains('is-selected');
                var hadPreviousSelection = !!currentlySelectedSentence;

                // Clear previous selection
                if (currentlySelectedSentence) {
                    currentlySelectedSentence.classList.remove('is-selected');
                }

                if (wasSelected) {
                    // Deselect: go back to page overview
                    currentlySelectedSentence = null;
                    updateLexiconButtonState();
                    updateCitationLabel(null, true);
                    renderOverview();
                } else {
                    // Select new sentence
                    sentence.classList.add('is-selected');
                    currentlySelectedSentence = sentence;
                    updateLexiconButtonState();
                    
                    var key = sentence.dataset.lexiconKey;
                    var text = sentence.dataset.sentenceText || sentence.textContent.replace(/^[0-9]+\.\s*/, '');
                    
                    updateCitationLabel(key, hadPreviousSelection);
                    renderSentenceExplanation(key, text);
                }
            });
        });
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

        // closedY is the sheet's "tucked" resting translateY, measured from fully-open (0).
        // For the Covenant footer seal, we treat the closed rest position as (panelHeight - footerHeight),
        // so the sheet lip emerges immediately beneath the footer.
        var closedY = 0;
        var currentY = 0;

        var MOVE_SLOP = 6;

        // Open gesture tuning (drag up from the seal while closed).
        var OPEN_VELOCITY = -0.85;
        var OPEN_RATIO = 0.38;

        // Close gesture tuning (drag down from the seal while open).
        var CLOSE_VELOCITY = 0.85;
        var CLOSE_RATIO = 0.28;

        // Snap tuning: heavier, slower, no bounce.
        var SNAP_MS = 420;
        var SNAP_EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

        window.__COVENANT_SEAL_DRAG_JUST_HAPPENED = false;

        function isMobileSheet() {
            return isBottomSheetMode && isBottomSheetMode();
        }

        function computeClosedY() {
            var rect = panel.getBoundingClientRect();
            var panelH = (rect && rect.height) ? rect.height : 1;
            var footerH = getFooterHeightSafe();
            closedY = Math.max(1, panelH - footerH);
        }

        function setPanelY(y, sealDragging) {
            if (typeof sealDragging !== 'boolean') sealDragging = true;

            currentY = y;
            panel.style.transform = 'translateY(' + y + 'px)';

            // Keep seal and sheet in one continuous chain.
            var denom = (closedY || 1);
            var progress = 1 - (y / denom);
            if (progress < 0) progress = 0;
            if (progress > 1) progress = 1;

            // Counterbalance the seat nudge while open; reintroduce it as we approach closed.
            var seatNudge = getSeatNudge();
            var sealOffset = (y - closedY) + (seatNudge * progress);

            // Important: when snapping (finger released), let CSS transitions take over.
            setSealDragOffset(sealOffset, sealDragging);

            // Overlay opacity: fade in as panel lifts.
            if (lexOverlay) {
                lexOverlay.style.opacity = String(progress);
            }
        }

        function snap() {
            // Decide whether to open or close based on gesture.
            var shouldOpen = false;

            if (startWasOpen) {
                // Was open: close if dragged far enough down or with sufficient velocity.
                var dragDist = currentY - 0;
                if (velocity > CLOSE_VELOCITY || dragDist > closedY * CLOSE_RATIO) {
                    shouldOpen = false;
                } else {
                    shouldOpen = true;
                }
            } else {
                // Was closed: open if dragged far enough up or with sufficient velocity.
                var dragDist = closedY - currentY;
                if (velocity < OPEN_VELOCITY || dragDist > closedY * OPEN_RATIO) {
                    shouldOpen = true;
                } else {
                    shouldOpen = false;
                }
            }

            // Apply transition and snap to final position.
            panel.style.transition = 'transform ' + SNAP_MS + 'ms ' + SNAP_EASE;
            if (lexOverlay) {
                lexOverlay.style.transition = 'opacity ' + SNAP_MS + 'ms ' + SNAP_EASE;
            }

            if (shouldOpen) {
                setPanelY(0, false);
                if (!panel.classList.contains('is-open')) {
                    panel.classList.add('is-open');
                    lexOverlay.classList.add('is-open');
                    panel.setAttribute('aria-hidden', 'false');
                    lexOverlay.setAttribute('aria-hidden', 'false');
                    if (lexiconToggle) lexiconToggle.setAttribute('aria-expanded', 'true');
                    lockBodyScroll();
                    setLexiconGlyph();
                }
            } else {
                setPanelY(closedY, false);
                if (panel.classList.contains('is-open')) {
                    panel.classList.remove('is-open');
                    lexOverlay.classList.remove('is-open');
                    panel.setAttribute('aria-hidden', 'true');
                    lexOverlay.setAttribute('aria-hidden', 'true');
                    if (lexiconToggle) lexiconToggle.setAttribute('aria-expanded', 'false');
                    unlockBodyScroll();
                    setLexiconGlyph();
                }
                clearSealDragOffsetSoon(SNAP_MS + 100);
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
            if (!moved && Math.abs(deltaY) > MOVE_SLOP) moved = true;
            if (!moved) return;

            var now = Date.now();
            var dt = now - lastT;
            if (dt > 0) {
                velocity = (e.clientY - lastY) / dt;
            }
            lastY = e.clientY;
            lastT = now;

            var targetY = (startWasOpen ? 0 : closedY) + deltaY;
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
                setTimeout(function () {
                    window.__COVENANT_SEAL_DRAG_JUST_HAPPENED = false;
                }, 300);
                snap();
            } else {
                // No significant movement: let the tap handler toggle.
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
