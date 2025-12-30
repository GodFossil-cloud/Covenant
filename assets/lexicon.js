/*! Covenant Lexicon UI v0.2.4 */
(function () {
    'use strict';

    // Exposed for quick verification during future page migrations.
    window.COVENANT_LEXICON_VERSION = '0.2.4';

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

    function closestSafe(target, selector) {
        if (!target) return null;
        var el = (target.nodeType === 1) ? target : target.parentElement;
        if (!el || !el.closest) return null;
        return el.closest(selector);
    }

    function isBottomSheetMode() {
        return window.matchMedia && window.matchMedia('(max-width: 600px)').matches;
    }

    function lockBodyScroll() {
        if (document.documentElement.classList.contains('lexicon-scroll-lock')) return;
        scrollLockY = window.scrollY || window.pageYOffset || 0;
        document.documentElement.classList.add('lexicon-scroll-lock');
        document.body.classList.add('lexicon-scroll-lock');
        document.body.style.top = (-scrollLockY) + 'px';
    }

    function unlockBodyScroll() {
        if (!document.documentElement.classList.contains('lexicon-scroll-lock')) return;
        document.documentElement.classList.remove('lexicon-scroll-lock');
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
            if (e.pointerType === 'mouse' && e.button !== 0) return;
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
        default: '𓐆 𖤓 𓐆',
        defaultHover: '↿◌↾',
        selected: '⌯ 𖤓 ⌯',
        selectedHover: '⌯ 𖤓 ⌯',
        openSummary: '≡⦿≡',
        openSelected: '▸𖤓◂',
        openHover: '⇃⌵⇂',
        mobileOpen: '⇃⌵⇂'
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
        dynamicContent.style.opacity = '0';
        setTimeout(function () {
            dynamicContent.innerHTML = '<div class="lexicon-sentence-quote">"' + sentenceText + '"</div><p>' + explanation + '</p>';
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

        panel.querySelectorAll('.lexicon-panel-close').forEach(function (btn) {
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
    }

    var dragRegion = document.getElementById('lexiconDragRegion');
    var dragPill = dragRegion ? dragRegion.querySelector('.lexicon-drag-pill') : null;

    if (dragRegion && panel && lexOverlay) {
        var isDragging = false;
        var startY = 0;
        var lastY = 0;
        var lastT = 0;
        var velocity = 0;
        var currentDelta = 0;

        function setPillPressed(on) {
            if (!dragPill) return;
            dragPill.classList.toggle('is-pressed', !!on);
        }

        function getPanelHeight() {
            var rect = panel.getBoundingClientRect();
            return rect && rect.height ? rect.height : 1;
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
            if (shouldClose) {
                closePanel();
            } else {
                panel.classList.remove('is-dragging');
                panel.style.transition = '';
                panel.style.transform = '';
                lexOverlay.style.opacity = '';
            }
        }

        /* cancel should always restore panel state */
        function cancelDrag() {
            if (!isDragging) return;
            setPillPressed(false);
            isDragging = false;
            panel.classList.remove('is-dragging');
            panel.style.transition = '';
            panel.style.transform = '';
            lexOverlay.style.opacity = '';
        }

        if (window.PointerEvent) {
            dragRegion.addEventListener('pointerdown', function (e) {
                beginDrag(e.clientY);
                try { dragRegion.setPointerCapture(e.pointerId); } catch (err) { }
            });
            dragRegion.addEventListener('pointermove', function (e) {
                updateDrag(e.clientY);
            });
            dragRegion.addEventListener('pointerup', endDrag);
            dragRegion.addEventListener('pointercancel', cancelDrag);
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
    sentenceNodes.forEach(function (node) {
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

    glossaryTerms.forEach(function (term) {
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

    // Exit fade + radiant pulse for Covenant section nav only (invocation.html → XII.html).
    // Gate: requires lexicon panel + toggle + footer (keeps this off non-section pages).
    (function initExitTransitions() {
        if (!panel || !lexiconToggle || !navFooter || !container) return;

        var PANEL_CLOSE_MS = 120;
        var EXIT_MS = 380;

        function isModifiedClick(e) {
            return !!(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0);
        }

        function pulse(el) {
            if (!el) return;
            el.classList.remove('is-pulsing');
            void el.offsetWidth;
            el.classList.add('is-pulsing');
            window.setTimeout(function () {
                el.classList.remove('is-pulsing');
            }, 700);
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

        document.querySelectorAll('a.nav-next, a.nav-prev').forEach(function (link) {
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
