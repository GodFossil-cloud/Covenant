/*! Covenant Lexicon UI v0.2.16 */
(function () {
    'use strict';

    // Exposed for quick verification during future page migrations.
    window.COVENANT_LEXICON_VERSION = '0.2.16';

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
    var sealClearTimer = null;

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

    var isMobileGlyphMode = window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches;

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
        return window.matchMedia && window.matchMedia('(max-width: 600px)').matches;
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
        var h = getPanelHeightSafe();
        var f = getFooterHeightSafe();
        if (h > 0) setSealDragOffset(-(h - f), false);
    }

    function setSealToClosedPosition() {
        // Seal sits in the footer notch.
        setSealDragOffset(0, false);
        clearSealDragOffsetSoon(340);
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
        if (isBottomSheetMode()) {
            // Defer one tick so layout has a stable height.
            window.setTimeout(function () {
                setSealToOpenPosition();
            }, 0);
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

    // ---- Mobile seal drag -> drag panel open (bottom sheet) ----
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

        var closedY = 0;
        var currentY = 0;

        var MOVE_SLOP = 6;
        var OPEN_VELOCITY = -0.85;
        var OPEN_RATIO = 0.38;

        window.__COVENANT_SEAL_DRAG_JUST_HAPPENED = false;

        function isMobileSheet() {
            return isBottomSheetMode && isBottomSheetMode();
        }

        // Read the CSS seating nudge so we can counterbalance it during drag init.
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

        function setPanelY(y) {
            currentY = y;
            panel.style.transform = 'translateY(' + y + 'px)';

            // Keep seal and sheet in one continuous chain:
            // - At rest (closed), don't "pre-lift" the seal.
            // - As the sheet rises, gradually cancel the closed seating nudge so the seal and the sheet lip stay welded.
            var denom = (closedY || 1);
            var progress = 1 - (y / denom);
            if (progress < 0) progress = 0;
            if (progress > 1) progress = 1;

            var seatNudge = getSeatNudge();
            var footerH = getFooterHeightSafe();
            var sealOffset = (y - closedY) + (seatNudge * progress) + (footerH * progress);
            setSealDragOffset(sealOffset, true);

            lexOverlay.style.opacity = String(progress);
        }

        function beginOpenGesture(e) {
            if (!isMobileSheet()) return;
            if (e.pointerType === 'mouse') return;

            // If already open, defer to the panel drag-region logic.
            if (panel.classList.contains('is-open')) return;

            dragging = true;
            moved = false;
            pointerId = e.pointerId;

            startY = e.clientY;
            lastY = e.clientY;
            lastT = (window.performance && performance.now) ? performance.now() : Date.now();
            velocity = 0;

            // Ensure the correct content is ready while dragging.
            if (currentlySelectedSentence && currentlySelectedSentence.dataset.lexiconKey) {
                renderSentenceExplanation(currentlySelectedSentence.dataset.lexiconKey, currentlySelectedSentence.dataset.sentenceText);
            } else {
                renderOverview();
            }

            // IMPORTANT: prevent a 1-frame "pre-lift" caused by aria-expanded toggling before
            // the .is-seal-dragging class is present.
            setSealDragOffset(0, true);

            // Prepare overlay + scroll lock immediately (prevents iOS rubber-band).
            lexOverlay.classList.add('is-open');
            panel.setAttribute('aria-hidden', 'false');
            lexOverlay.setAttribute('aria-hidden', 'false');
            lexiconToggle.setAttribute('aria-expanded', 'true');
            lockBodyScroll();

            // Measure the panel's effective height, and treat that as our closed offset.
            var rect = panel.getBoundingClientRect();
            closedY = (rect && rect.height) ? rect.height : 1;

            panel.classList.add('is-dragging');
            panel.style.transition = 'none';

            // Start from fully closed.
            setPanelY(closedY);

            try { lexiconToggle.setPointerCapture(pointerId); } catch (err) { }
        }

        function updateOpenGesture(e) {
            if (!dragging) return;
            if (pointerId !== null && e.pointerId !== pointerId) return;

            var deltaUp = startY - e.clientY;

            if (!moved && Math.abs(deltaUp) > MOVE_SLOP) moved = true;
            if (!moved) return;

            var now = (window.performance && performance.now) ? performance.now() : Date.now();
            var dt = now - lastT;
            if (dt > 0) velocity = (e.clientY - lastY) / dt;
            lastY = e.clientY;
            lastT = now;

            var y = closedY - deltaUp;
            if (y < 0) y = 0;
            if (y > closedY) y = closedY;

            setPanelY(y);

            if (e.cancelable) e.preventDefault();
        }

        function cleanupClosedState() {
            panel.classList.remove('is-dragging');
            panel.style.transform = '';
            panel.style.transition = '';

            lexOverlay.style.opacity = '';
            lexOverlay.classList.remove('is-open');

            panel.setAttribute('aria-hidden', 'true');
            lexOverlay.setAttribute('aria-hidden', 'true');
            lexiconToggle.setAttribute('aria-expanded', 'false');

            setSealToClosedPosition();

            unlockBodyScroll();
            setLexiconGlyph();
        }

        function finalizeOpenState() {
            // Convert to the normal open state (class-driven).
            panel.classList.remove('is-dragging');
            panel.style.transform = '';
            panel.style.transition = '';
            lexOverlay.style.opacity = '';

            focusReturnEl = lexiconToggle;
            panel.classList.add('is-open');
            lexOverlay.classList.add('is-open');

            // Seal stays lifted with the open sheet (corrected for footer height).
            var footerH = getFooterHeightSafe();
            setSealDragOffset(-(closedY - footerH), false);

            setLexiconGlyph();
            setTimeout(focusIntoPanel, 0);
        }

        function finishOpenGesture() {
            if (!dragging) return;

            dragging = false;
            try {
                if (pointerId !== null) lexiconToggle.releasePointerCapture(pointerId);
            } catch (err) { }
            pointerId = null;

            if (!moved) {
                // Treat as a normal tap (the click handler will run).
                cleanupClosedState();
                return;
            }

            window.__COVENANT_SEAL_DRAG_JUST_HAPPENED = true;

            var progress = 1 - (currentY / (closedY || 1));
            var shouldOpen = (progress >= OPEN_RATIO) || (velocity <= OPEN_VELOCITY);

            if (shouldOpen) {
                // Snap to open.
                panel.style.transition = 'transform 260ms ease';
                lexOverlay.style.transition = 'opacity 260ms ease';
                setPanelY(0);

                setTimeout(function () {
                    lexOverlay.style.transition = '';
                    finalizeOpenState();
                }, 270);
            } else {
                // Snap back closed.
                panel.style.transition = 'transform 220ms ease';
                lexOverlay.style.transition = 'opacity 220ms ease';
                setPanelY(closedY);

                setTimeout(function () {
                    lexOverlay.style.transition = '';
                    cleanupClosedState();
                }, 230);
            }
        }

        lexiconToggle.addEventListener('pointerdown', beginOpenGesture, { passive: true });
        lexiconToggle.addEventListener('pointermove', updateOpenGesture, { passive: false });
        lexiconToggle.addEventListener('pointerup', function () { finishOpenGesture(); }, true);
        lexiconToggle.addEventListener('pointercancel', function () { finishOpenGesture(); }, true);
    })();

    var dragPill = dragRegion ? dragRegion.querySelector('.lexicon-drag-pill') : null;

    if (dragRegion && panel && lexOverlay) {
        var isDragging = false;
        var startY = 0;
        var lastY = 0;
        var lastT = 0;
        var velocity = 0;
        var currentDelta = 0;
        var capturedPointerId = null;

        function setPillPressed(on) {
            if (!dragPill) return;
            dragPill.classList.toggle('is-pressed', !!on);
        }

        function getPanelHeight() {
            var rect = panel.getBoundingClientRect();
            return rect && rect.height ? rect.height : 1;
        }

        function releaseCapture() {
            if (capturedPointerId === null) return;
            try { dragRegion.releasePointerCapture(capturedPointerId); } catch (err) { }
            capturedPointerId = null;
        }

        function beginDrag(clientY) {
            if (!panel.classList.contains('is-open') || !isBottomSheetMode()) return;
            isDragging = true;
            setPillPressed(true);
            startY = clientY;
            lastY = clientY;
            lastT = window.performance && performance.now ? performance.now() : Date.now();
            velocity = 0;
            currentDelta = 0;
            panel.classList.add('is-dragging');
            panel.style.transition = 'none';
        }

        function updateDrag(clientY) {
            if (!isDragging) return;
            currentDelta = clientY - startY;
            if (currentDelta < 0) currentDelta = 0;

            panel.style.transform = 'translateY(' + currentDelta + 'px)';

            var h = getPanelHeight();
            var fade = 1 - (currentDelta / (h * 0.9));
            if (fade < 0) fade = 0;
            if (fade > 1) fade = 1;
            lexOverlay.style.opacity = String(fade);

            // Seal tracks the top of the sheet while dragging down (corrected baseline).
            if (isBottomSheetMode()) {
                var footerH = getFooterHeightSafe();
                setSealDragOffset(-(h - footerH) + currentDelta, true);
            }

            var now = window.performance && performance.now ? performance.now() : Date.now();
            var dt = now - lastT;
            if (dt > 0) velocity = (clientY - lastY) / dt;
            lastY = clientY;
            lastT = now;
        }

        function endDrag() {
            if (!isDragging) return;
            setPillPressed(false);

            var h = getPanelHeight();
            var threshold = Math.max(120, h * 0.25);
            var shouldClose = (currentDelta > threshold) || (velocity > 0.9);

            isDragging = false;
            releaseCapture();

            if (shouldClose) {
                closePanel();
            } else {
                panel.classList.remove('is-dragging');
                panel.style.transition = '';
                panel.style.transform = '';
                lexOverlay.style.opacity = '';

                // Snap seal back to open position.
                if (isBottomSheetMode()) {
                    var footerH = getFooterHeightSafe();
                    setSealDragOffset(-(h - footerH), false);
                }
            }
        }

        function cancelDrag() {
            if (!isDragging) {
                releaseCapture();
                return;
            }
            setPillPressed(false);
            isDragging = false;
            releaseCapture();

            panel.classList.remove('is-dragging');
            panel.style.transition = '';
            panel.style.transform = '';
            lexOverlay.style.opacity = '';

            // Restore seal to open position.
            if (isBottomSheetMode()) {
                var h = getPanelHeight();
                var footerH = getFooterHeightSafe();
                setSealDragOffset(-(h - footerH), false);
            }
        }

        if (window.PointerEvent) {
            dragRegion.addEventListener('pointerdown', function (e) {
                beginDrag(e.clientY);
                if (!isDragging) return;
                capturedPointerId = e.pointerId;
                try { dragRegion.setPointerCapture(e.pointerId); } catch (err) { }
            });

            // Use window-level capture listeners so the UI cannot get stuck if the pointer leaves the drag region.
            window.addEventListener('pointermove', function (e) {
                if (!isDragging) return;
                if (capturedPointerId !== null && e.pointerId !== capturedPointerId) return;
                updateDrag(e.clientY);
            }, true);

            window.addEventListener('pointerup', function (e) {
                if (!isDragging) return;
                if (capturedPointerId !== null && e.pointerId !== capturedPointerId) return;
                endDrag();
            }, true);

            window.addEventListener('pointercancel', function (e) {
                if (capturedPointerId !== null && e.pointerId !== capturedPointerId) return;
                cancelDrag();
            }, true);

            dragRegion.addEventListener('lostpointercapture', cancelDrag);
        } else {
            dragRegion.addEventListener('touchstart', function (e) {
                if (!e.touches || !e.touches[0]) return;
                beginDrag(e.touches[0].clientY);
            }, { passive: true });
            dragRegion.addEventListener('touchmove', function (e) {
                if (!e.touches || !e.touches[0]) return;
                updateDrag(e.touches[0].clientY);
            }, { passive: true });
            dragRegion.addEventListener('touchend', endDrag);
            dragRegion.addEventListener('touchcancel', cancelDrag, { passive: true });
        }
    }

    function clearSentenceSelection() {
        if (currentlySelectedSentence) {
            currentlySelectedSentence.classList.remove('is-selected');
            currentlySelectedSentence = null;
            updateLexiconButtonState();
        }
    }

    function handleSentenceClick(node) {
        if (currentlySelectedSentence === node) {
            clearSentenceSelection();
        } else {
            clearSentenceSelection();
            currentlySelectedSentence = node;
            node.classList.add('is-selected');
            updateLexiconButtonState();
        }
    }

    var sentenceNodes = document.querySelectorAll('.sentence');
    Array.prototype.forEach.call(sentenceNodes, function (node) {
        node.addEventListener('click', function (event) {
            event.stopPropagation();
            handleSentenceClick(node);
        });

        var lastTapTime = 0;
        node.addEventListener('touchend', function (event) {
            var currentTime = Date.now();
            var tapLength = currentTime - lastTapTime;
            if (tapLength < 300 && tapLength > 0) {
                event.preventDefault();
                event.stopPropagation();
                handleSentenceClick(node);
            }
            lastTapTime = currentTime;
        });
    });

    function handleOutsideInteraction(event) {
        var isSentence = !!closestSafe(event.target, '.sentence');
        var isLexicon = !!closestSafe(event.target, '#lexiconToggle');
        var isPanel = !!closestSafe(event.target, '#lexiconPanel');
        if (!isSentence && !isLexicon && !isPanel) {
            clearSentenceSelection();
        }
    }

    document.addEventListener('click', handleOutsideInteraction);
    document.addEventListener('touchend', handleOutsideInteraction);

    var glossaryTerms = document.querySelectorAll('.glossary-term');

    Array.prototype.forEach.call(glossaryTerms, function (term) {
        term.addEventListener('touchstart', function (e) {
            if (this === currentlyActiveTooltip) return;
            e.preventDefault();
            clearActiveTooltip();
            this.classList.add('tooltip-active');
            currentlyActiveTooltip = this;
        }, { passive: false });
    });

    document.addEventListener('touchstart', function (e) {
        if (currentlyActiveTooltip) {
            var touchedGlossaryTerm = Array.prototype.slice.call(glossaryTerms).some(function (term) {
                return term.contains(e.target);
            });
            if (!touchedGlossaryTerm) {
                clearActiveTooltip();
            }
        }

        if (currentlySelectedSentence) {
            var touchedCurrentSentence = currentlySelectedSentence.contains(e.target);
            var touchedLexicon = !!closestSafe(e.target, '#lexiconToggle');
            var touchedPanel = !!closestSafe(e.target, '#lexiconPanel');
            if (!touchedCurrentSentence && !touchedLexicon && !touchedPanel) {
                clearSentenceSelection();
            }
        }
    }, { capture: true, passive: true });

    // Exit fade + radiant nav pulse for Covenant section nav only (invocation.html → XII.html).
    // Gate: requires lexicon panel + toggle + footer (keeps this off non-section pages).
    (function initExitTransitions() {
        if (!panel || !lexiconToggle || !navFooter || !container) return;

        var PANEL_CLOSE_MS = 120;
        var EXIT_MS = 380;

        // "Press" nudge duration (separate from :active).
        var NUDGE_MS = 120;

        // Optional: subtle nav click sound. Muted by default.
        var SOUND_KEY = 'covenant_nav_sound';
        var audioCtx = null;

        function getSoundPref() {
            try {
                return window.localStorage && localStorage.getItem(SOUND_KEY);
            } catch (err) {
                return null;
            }
        }

        function setSoundPref(val) {
            try {
                if (!window.localStorage) return;
                if (val === null || val === undefined) {
                    localStorage.removeItem(SOUND_KEY);
                } else {
                    localStorage.setItem(SOUND_KEY, String(val));
                }
            } catch (err) { }
        }

        // Opt-in via query param:
        //   ?sound=1  (enable and persist)
        //   ?sound=0  (disable and persist)
        (function initSoundQueryParam() {
            try {
                if (!window.URLSearchParams) return;
                var params = new URLSearchParams(window.location.search);
                if (!params.has('sound')) return;
                var v = params.get('sound');
                if (v === '1' || v === 'true' || v === 'on') {
                    setSoundPref('1');
                } else if (v === '0' || v === 'false' || v === 'off') {
                    setSoundPref('0');
                }

                // Clean URL (so the covenant path stays clean after opting in).
                params.delete('sound');
                var newSearch = params.toString();
                var nextUrl = window.location.pathname + (newSearch ? ('?' + newSearch) : '') + window.location.hash;
                if (window.history && history.replaceState) {
                    history.replaceState(null, document.title, nextUrl);
                }
            } catch (err) { }
        })();

        function soundEnabled() {
            return getSoundPref() === '1';
        }

        function playClickTick() {
            if (!soundEnabled()) return;
            try {
                var Ctx = window.AudioContext || window.webkitAudioContext;
                if (!Ctx) return;
                if (!audioCtx) audioCtx = new Ctx();
                if (audioCtx.state === 'suspended' && audioCtx.resume) {
                    audioCtx.resume();
                }

                var now = audioCtx.currentTime;
                var osc = audioCtx.createOscillator();
                var gain = audioCtx.createGain();

                // Tiny percussive "tick": quick down-sweep.
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(1100, now);
                osc.frequency.exponentialRampToValueAtTime(520, now + 0.03);

                // Very low gain (subtle).
                gain.gain.setValueAtTime(0.0001, now);
                gain.gain.exponentialRampToValueAtTime(0.018, now + 0.005);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

                osc.connect(gain);
                gain.connect(audioCtx.destination);

                osc.start(now);
                osc.stop(now + 0.06);

                osc.onended = function () {
                    try { osc.disconnect(); } catch (err) { }
                    try { gain.disconnect(); } catch (err) { }
                };
            } catch (err) { }
        }

        function isModifiedClick(e) {
            var nonPrimary = (typeof e.button === 'number') ? (e.button !== 0) : false;
            return !!(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || nonPrimary);
        }

        function pulse(el) {
            if (!el) return;

            // Radiant flare.
            el.classList.remove('is-pulsing');
            void el.offsetWidth;
            el.classList.add('is-pulsing');
            window.setTimeout(function () {
                el.classList.remove('is-pulsing');
            }, 700);

            // Physical press: brief 1px travel, separate from :active.
            el.classList.add('is-nudging');
            window.setTimeout(function () {
                el.classList.remove('is-nudging');
            }, NUDGE_MS);
        }

        function ensureExitOverlay() {
            var existing = document.getElementById('blackFadeOverlay');
            if (existing) return existing;

            var o = document.createElement('div');
            o.id = 'blackFadeOverlay';
            // Start transparent; CSS "fade-out" sets opacity:0, then body.is-exiting forces it back to 1.
            o.className = 'fade-out';
            o.setAttribute('data-exit-overlay', 'true');
            document.body.appendChild(o);
            // Force style flush so transition engages.
            void o.offsetWidth;
            return o;
        }

        function beginExitThenNavigate(href, pulseTarget) {
            if (!href) return;
            if (document.body.classList.contains('is-exiting')) return;

            var panelOpen = panel.classList.contains('is-open');
            var delay = panelOpen ? PANEL_CLOSE_MS : 0;

            playClickTick();
            pulse(pulseTarget);

            // Close panel if open (intentional first).
            if (panelOpen) {
                closePanel();
            }

            // Wait for panel close, then start exit.
            window.setTimeout(function () {
                ensureExitOverlay();
                document.body.classList.add('is-exiting');

                window.setTimeout(function () {
                    window.location.href = href;
                }, EXIT_MS);
            }, delay);
        }

        // Reset exit state if BFCache restores the page.
        window.addEventListener('pageshow', function () {
            document.body.classList.remove('is-exiting');
            var o = document.getElementById('blackFadeOverlay');
            if (o && o.getAttribute('data-exit-overlay') === 'true' && o.parentNode) {
                o.parentNode.removeChild(o);
            }
        });

        Array.prototype.forEach.call(document.querySelectorAll('a.nav-next, a.nav-prev'), function (link) {
            link.addEventListener('click', function (e) {
                if (isModifiedClick(e)) return;

                var href = link.getAttribute('href');
                if (!href || href.charAt(0) === '#') return;

                e.preventDefault();
                var frame = link.querySelector('.nav-next-frame, .nav-prev-frame');
                beginExitThenNavigate(href, frame || link);
            });
        });
    })();
})();
