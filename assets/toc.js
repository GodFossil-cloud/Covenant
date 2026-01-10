/*! Covenant ToC Progress Journal v1.2.4 */
(function () {
    'use strict';

    if (!window.COVENANT_JOURNEY) {
        console.warn('[Covenant ToC] COVENANT_JOURNEY not found; ToC disabled.');
        return;
    }

    var STORAGE_KEY = 'covenant_progress';
    var STORAGE_VERSION = 1;

    var pageConfig = window.COVENANT_PAGE || {};
    var currentPageId = pageConfig.pageId || '';

    var storageAvailable = false;
    var maxIndexUnlocked = -1; // -1 = nothing unlocked yet
    var inMemoryFallback = -1;

    var tocPanel = document.getElementById('tocPanel');
    var tocOverlay = document.getElementById('tocOverlay');
    var tocToggle = document.getElementById('tocToggle');
    var tocDynamicContent = document.getElementById('tocDynamicContent');
    var tocLiveRegion = document.getElementById('tocLiveRegion');

    // Two-step selection: select (pending) → close to commit.
    // Behavior:
    // - The header title is the selection well for the CURRENT page when opening.
    // - Scrolling the list moves the "candidate" into the slot; header previews that candidate.
    // - Touch/click on an unlocked item sets pending + previews in the header title,
    //   and auto-scrolls the list so that item locks into the selection slot.
    // - Second click on the SAME pending item travels immediately.
    // - Closing the ToC commits (travels) if pending != current.
    var pendingPageId = '';
    var pendingHref = '';
    var pendingTitle = '';

    // Anti-ghost-click window after opening (iOS Safari can dispatch a synthesized click that
    // lands on the newly-opened overlay and immediately closes the panel).
    var tocJustOpenedAt = 0;
    var TOC_GHOST_GUARD_MS = 520;

    // Delay navigation slightly so the close animation fully reads before page unload.
    // (Target: 200–260ms.)
    var NAV_DELAY_MS = 240;

    // Selection slot geometry inside the scroll container.
    // IMPORTANT: This must match CSS --toc-selection-top; we read it dynamically.
    var TOC_SELECTION_TOP_PX = 64;

    // Debounce window so we only commit a scroll-based selection once the snap settles.
    var TOC_SCROLL_DEBOUNCE_MS = 90;

    function closestSafe(target, selector) {
        if (!target) return null;
        var el = (target.nodeType === 1) ? target : target.parentElement;
        if (!el || !el.closest) return null;
        return el.closest(selector);
    }

    function parsePx(value, fallback) {
        var n = parseFloat(String(value || '').replace('px', ''));
        return Number.isFinite(n) ? n : fallback;
    }

    function updateSelectionTopPx() {
        var body = getBodyScrollEl();
        if (!body || !window.getComputedStyle) return;

        // CSS defines --toc-selection-top (e.g. 64px desktop / 56px mobile).
        var cssVal = getComputedStyle(body).getPropertyValue('--toc-selection-top');
        TOC_SELECTION_TOP_PX = parsePx(cssVal, TOC_SELECTION_TOP_PX);
    }

    // ----------------------------------------
    // Header title = selection well (preview slot)
    // ----------------------------------------
    var headerEl = document.querySelector('.section-header');
    var headerTitleEl = headerEl ? headerEl.querySelector('h1') : null;
    var originalHeaderTitleText = headerTitleEl ? String(headerTitleEl.textContent || '') : '';

    var headerSwapTimer = 0;

    function ensureOriginalHeaderTitleCaptured() {
        if (!headerTitleEl) return;
        if (originalHeaderTitleText) return;
        originalHeaderTitleText = String(headerTitleEl.textContent || '');
    }

    function setHeaderPreviewState(isPreviewing) {
        if (!headerEl) return;
        headerEl.classList.toggle('toc-previewing', !!isPreviewing);
    }

    function setTitleSheen(isOn) {
        if (!headerEl) return;
        headerEl.classList.toggle('toc-title-sheen', !!isOn);
    }

    function animateHeaderTitleTo(title) {
        if (!headerTitleEl) return;
        ensureOriginalHeaderTitleCaptured();

        title = String(title || '').trim();
        if (!title) return;

        var current = String(headerTitleEl.textContent || '').trim();
        if (current === title) {
            setHeaderPreviewState(true);
            return;
        }

        if (headerSwapTimer) {
            clearTimeout(headerSwapTimer);
            headerSwapTimer = 0;
        }

        setHeaderPreviewState(true);
        headerTitleEl.classList.add('toc-title-swapping');

        headerSwapTimer = setTimeout(function () {
            headerTitleEl.textContent = title;
            headerTitleEl.classList.remove('toc-title-swapping');
            headerSwapTimer = 0;
        }, 140);
    }

    function restoreHeaderTitle() {
        if (!headerTitleEl) return;
        ensureOriginalHeaderTitleCaptured();

        var target = String(originalHeaderTitleText || '').trim();
        if (!target) return;

        // Guard: avoid redundant swap animations if the header title never changed.
        var current = String(headerTitleEl.textContent || '').trim();
        if (current === target) {
            headerTitleEl.classList.remove('toc-title-swapping');
            setHeaderPreviewState(false);
            return;
        }

        if (headerSwapTimer) {
            clearTimeout(headerSwapTimer);
            headerSwapTimer = 0;
        }

        headerTitleEl.classList.add('toc-title-swapping');
        headerSwapTimer = setTimeout(function () {
            headerTitleEl.textContent = target;
            headerTitleEl.classList.remove('toc-title-swapping');
            setHeaderPreviewState(false);
            headerSwapTimer = 0;
        }, 140);
    }

    // ----------------------------------------
    // Scroll lock (mirrors Lexicon approach)
    // ----------------------------------------
    var root = document.documentElement;
    var scrollLockY = 0;

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

            // Allow scrolling INSIDE the ToC panel body.
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

        if (isIOS) {
            document.body.style.overflow = 'hidden';
            enableIOSTouchScrollLock();
            return;
        }

        document.body.classList.add('toc-scroll-lock');
        document.body.style.top = (-scrollLockY) + 'px';
    }

    function unlockBodyScroll() {
        if (!root.classList.contains('toc-scroll-lock')) {
            root.classList.remove('toc-open');
            return;
        }

        root.classList.remove('toc-scroll-lock', 'toc-open');

        if (isIOS) {
            disableIOSTouchScrollLock();
            document.body.style.overflow = '';
            window.scrollTo(0, scrollLockY);
            return;
        }

        document.body.classList.remove('toc-scroll-lock');
        document.body.style.top = '';
        window.scrollTo(0, scrollLockY);
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function stopEvent(e) {
        if (!e) return;
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
        // Also stop any other listeners on the same element (helps on iOS).
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    }

    function getJourneyPageById(pageId) {
        if (!pageId) return null;
        for (var i = 0; i < window.COVENANT_JOURNEY.length; i++) {
            if (window.COVENANT_JOURNEY[i].id === pageId) return window.COVENANT_JOURNEY[i];
        }
        return null;
    }

    function isUnlockedPageId(pageId) {
        var idx = window.getJourneyIndex(pageId);
        return idx >= 0 && idx <= maxIndexUnlocked;
    }

    function announce(message) {
        if (!tocLiveRegion) return;
        tocLiveRegion.textContent = message;
        setTimeout(function () {
            if (tocLiveRegion.textContent === message) tocLiveRegion.textContent = '';
        }, 2500);
    }

    // Test if localStorage is available and writable.
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
            var data = { version: STORAGE_VERSION, max: maxIndexUnlocked };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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

    // Soft page-load gate: redirect if user jumped ahead.
    function enforceSoftGate() {
        if (!currentPageId) return;
        if (!storageAvailable) return; // Fail open when storage unavailable

        var currentIdx = window.getJourneyIndex(currentPageId);
        if (currentIdx < 0) return; // Not a journey page

        // Allow if within unlocked range OR exactly one step ahead (normal progression).
        if (currentIdx <= maxIndexUnlocked + 1) {
            return;
        }

        console.warn('[Covenant ToC] Access denied to locked page:', currentPageId);
        window.location.href = 'invocation.html';
    }

    function unlockCurrentPage() {
        if (!currentPageId) return;
        unlock(currentPageId);
    }

    function announceLockedAttempt() {
        announce('This page is locked until you reach it through the journey.');
    }

    function setPending(pageId, silent) {
        var page = getJourneyPageById(pageId);
        if (!page) return;
        if (!isUnlockedPageId(pageId)) return;

        pendingPageId = page.id;
        pendingHref = page.href;
        pendingTitle = page.title;

        animateHeaderTitleTo(pendingTitle);

        // Update list highlight.
        if (tocDynamicContent) {
            var items = tocDynamicContent.querySelectorAll('.toc-item');
            Array.prototype.forEach.call(items, function (li) {
                if (!li) return;
                if (li.getAttribute('data-page-id') === pendingPageId) {
                    li.classList.add('toc-item--pending');
                } else {
                    li.classList.remove('toc-item--pending');
                }
            });
        }

        if (!silent) {
            announce('Selected: ' + pendingTitle + '. Close Contents to travel, or tap again to travel now.');
        }
    }

    function getBodyScrollEl() {
        if (!tocPanel) return null;
        return tocPanel.querySelector('.toc-panel-body');
    }

    function scrollItemToSelection(pageId, behavior) {
        var body = getBodyScrollEl();
        if (!body || !tocDynamicContent) return;

        updateSelectionTopPx();

        var li = tocDynamicContent.querySelector('.toc-item[data-page-id="' + pageId + '"]');
        if (!li) return;

        var bodyRect = body.getBoundingClientRect();
        var liRect = li.getBoundingClientRect();

        var selectionY = bodyRect.top + TOC_SELECTION_TOP_PX;
        var deltaTop = liRect.top - selectionY;
        var nextTop = body.scrollTop + deltaTop;

        // Clamp.
        var maxTop = Math.max(0, body.scrollHeight - body.clientHeight);
        if (nextTop < 0) nextTop = 0;
        if (nextTop > maxTop) nextTop = maxTop;

        body.scrollTo({ top: nextTop, left: 0, behavior: behavior || 'auto' });
    }

    // ----------------------------------------
    // Scroll-driven selection (scroll-snap)
    // ----------------------------------------
    var tocBodyScrollEl = null;
    var scrollDebounceTimer = 0;
    var lastScrollSelectedId = '';
    var suppressScrollSync = false;
    var suppressScrollTimer = 0;

    function setScrollSyncSuppressed(ms) {
        suppressScrollSync = true;
        if (suppressScrollTimer) {
            clearTimeout(suppressScrollTimer);
            suppressScrollTimer = 0;
        }
        suppressScrollTimer = setTimeout(function () {
            suppressScrollSync = false;
            suppressScrollTimer = 0;
        }, Math.max(0, ms || 0));
    }

    function applyWheelStyling() {
        var body = tocBodyScrollEl;
        if (!body || !tocDynamicContent) return;

        updateSelectionTopPx();

        var items = tocDynamicContent.querySelectorAll('.toc-item');
        if (!items || !items.length) return;

        var bodyRect = body.getBoundingClientRect();
        var selectionY = bodyRect.top + TOC_SELECTION_TOP_PX;

        // Tuned to keep it sacred/subtle.
        var SCALE_MAX = 1.16;
        var SCALE_MIN = 0.94;
        var ALPHA_MIN = 0.36;
        var ALPHA_MAX = 1.0;
        var BLUR_MAX = 0.6;

        Array.prototype.forEach.call(items, function (li) {
            if (!li) return;

            var r = li.getBoundingClientRect();
            var d = Math.abs(r.top - selectionY);

            // 0..1 proximity (1 = in the slot).
            var p = 1 - Math.min(1, d / 160);

            var scale = SCALE_MIN + (SCALE_MAX - SCALE_MIN) * p;
            var alpha = ALPHA_MIN + (ALPHA_MAX - ALPHA_MIN) * p;
            var blur = (1 - p) * BLUR_MAX;

            li.style.setProperty('--toc-scale', String(scale));
            li.style.setProperty('--toc-alpha', String(alpha));
            li.style.setProperty('--toc-blur', blur.toFixed(2) + 'px');
        });
    }

    function computeScrollSelectedId() {
        var body = tocBodyScrollEl;
        if (!body || !tocDynamicContent) return '';

        updateSelectionTopPx();

        var items = tocDynamicContent.querySelectorAll('.toc-item');
        if (!items || !items.length) return '';

        var bodyRect = body.getBoundingClientRect();
        var selectionY = bodyRect.top + TOC_SELECTION_TOP_PX;

        var bestId = '';
        var bestDist = Infinity;

        Array.prototype.forEach.call(items, function (li) {
            if (!li) return;

            var pid = li.getAttribute('data-page-id') || '';
            if (!pid) return;
            if (!isUnlockedPageId(pid)) return;

            var r = li.getBoundingClientRect();
            var d = Math.abs(r.top - selectionY);
            if (d < bestDist) {
                bestDist = d;
                bestId = pid;
            }
        });

        return bestId;
    }

    function syncPendingFromScroll() {
        if (suppressScrollSync) return;

        var pid = computeScrollSelectedId();
        if (!pid) return;
        if (pid === lastScrollSelectedId) return;

        lastScrollSelectedId = pid;
        // Silent: do not spam aria-live while scrolling.
        setPending(pid, true);
    }

    function onToCBodyScroll() {
        // Always update wheel styling (purely visual).
        applyWheelStyling();

        if (suppressScrollSync) return;

        if (scrollDebounceTimer) {
            clearTimeout(scrollDebounceTimer);
            scrollDebounceTimer = 0;
        }

        scrollDebounceTimer = setTimeout(function () {
            scrollDebounceTimer = 0;
            syncPendingFromScroll();
        }, TOC_SCROLL_DEBOUNCE_MS);
    }

    function attachScrollSync(skipInitialSync) {
        var body = getBodyScrollEl();
        if (!body) return;

        tocBodyScrollEl = body;
        lastScrollSelectedId = '';

        updateSelectionTopPx();

        body.addEventListener('scroll', onToCBodyScroll, { passive: true });

        // Initial visual pass.
        setTimeout(function () {
            applyWheelStyling();
            if (!skipInitialSync) syncPendingFromScroll();
        }, 0);
    }

    function detachScrollSync() {
        if (suppressScrollTimer) {
            clearTimeout(suppressScrollTimer);
            suppressScrollTimer = 0;
        }

        if (scrollDebounceTimer) {
            clearTimeout(scrollDebounceTimer);
            scrollDebounceTimer = 0;
        }

        if (tocBodyScrollEl) {
            tocBodyScrollEl.removeEventListener('scroll', onToCBodyScroll);
        }

        tocBodyScrollEl = null;
        lastScrollSelectedId = '';
        suppressScrollSync = false;
    }

    function renderToC() {
        if (!tocDynamicContent) return;

        var html = '';

        html += '<nav aria-label="Journey contents"><ol class="toc-list">';

        for (var i = 0; i < window.COVENANT_JOURNEY.length; i++) {
            var page = window.COVENANT_JOURNEY[i];
            var isUnlocked = i <= maxIndexUnlocked;
            var isCurrent = page.id === currentPageId;
            var isPending = page.id === pendingPageId;

            html += '<li class="toc-item';
            if (isCurrent) html += ' toc-item--current';
            if (isPending) html += ' toc-item--pending';
            if (!isUnlocked) html += ' toc-item--locked';
            html += '" data-page-id="' + escapeHtml(page.id) + '">';

            if (isUnlocked) {
                html += '<button type="button" class="toc-item-btn" data-page-id="' + escapeHtml(page.id) + '"';
                if (isCurrent) html += ' aria-current="page"';
                html += '>' + escapeHtml(page.title) + '</button>';
            } else {
                html += '<button type="button" class="toc-locked-btn" aria-disabled="true" data-page-id="' + escapeHtml(page.id) + '">';
                html += escapeHtml(page.title);
                html += '<span class="toc-locked-label" aria-hidden="true"> (Locked)</span>';
                html += '<span class="sr-only"> – Locked until reached through the journey</span>';
                html += '</button>';
            }

            html += '</li>';
        }

        html += '</ol></nav>';

        tocDynamicContent.innerHTML = html;

        var lockedBtns = tocDynamicContent.querySelectorAll('.toc-locked-btn');
        Array.prototype.forEach.call(lockedBtns, function (btn) {
            btn.addEventListener('click', function (e) {
                stopEvent(e);
                announceLockedAttempt();
            });
        });

        var itemBtns = tocDynamicContent.querySelectorAll('.toc-item-btn');
        Array.prototype.forEach.call(itemBtns, function (btn) {
            btn.addEventListener('click', function (e) {
                stopEvent(e);
                var pid = btn.getAttribute('data-page-id') || '';
                if (!pid) return;

                // Second click on same pending item travels immediately.
                if (pid === pendingPageId) {
                    closeToC(true);
                    return;
                }

                setPending(pid, false);
                scrollItemToSelection(pid, 'smooth');
            });
        });
    }

    // ----------------------------------------
    // Title-as-toggle (no sigil button)
    // ----------------------------------------
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

    // Create a header-mounted toggle that *covers the title text*.
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

        // Invisible control (the title itself is the visible affordance).
        btn.innerHTML = '<span class="sr-only">Toggle Contents</span>';

        if (headerEl && headerTitleEl) {
            headerEl.classList.add('has-toc-toggle');
            headerEl.appendChild(btn);
        } else {
            // Rare fallback: if a page lacks the standard header.
            btn.classList.remove('toc-toggle--title');
            btn.classList.add('toc-toggle--floating');
            btn.innerHTML = '<span class="toc-toggle-glyph" aria-hidden="true">☰</span>';
            document.body.appendChild(btn);
        }

        tocToggle = btn;
        positionTitleToggle();

        // Keep the overlay aligned if fonts/layout shift after load.
        setTimeout(positionTitleToggle, 0);
        setTimeout(positionTitleToggle, 250);
    }

    function positionDropdownPanel() {
        if (!tocPanel) return;

        var header = document.querySelector('.section-header');
        var topPx = 16;

        if (header && header.getBoundingClientRect) {
            var rect = header.getBoundingClientRect();
            // Sit flush to the header divider line.
            topPx = Math.round(rect.bottom);
        }

        // For fixed-position elements, top is relative to the viewport.
        tocPanel.style.top = topPx + 'px';

        // Keep a small bottom gutter so the sheet doesn't collide with the footer dock.
        var maxH = Math.max(220, window.innerHeight - topPx - 18);
        tocPanel.style.maxHeight = maxH + 'px';

        positionTitleToggle();
        updateSelectionTopPx();
    }

    // Panel open/close.
    var focusReturnEl = null;

    function openToC() {
        if (!tocPanel || !tocOverlay) return;

        tocJustOpenedAt = Date.now();
        focusReturnEl = tocToggle;

        setTitleSheen(false);
        ensureOriginalHeaderTitleCaptured();
        lockBodyScroll();
        positionDropdownPanel();

        // Default pending selection = current page.
        var defaultPending = currentPageId;
        if (defaultPending && isUnlockedPageId(defaultPending)) {
            var p = getJourneyPageById(defaultPending);
            pendingPageId = p ? p.id : '';
            pendingHref = p ? p.href : '';
            pendingTitle = p ? p.title : '';
        } else {
            pendingPageId = '';
            pendingHref = '';
            pendingTitle = '';
        }

        // The header selection well is the current page title on open.
        if (pendingTitle) animateHeaderTitleTo(pendingTitle);

        tocPanel.classList.add('is-open');
        tocOverlay.classList.add('is-open');
        tocPanel.setAttribute('aria-hidden', 'false');
        tocOverlay.setAttribute('aria-hidden', 'false');
        if (tocToggle) {
            tocToggle.setAttribute('aria-expanded', 'true');
            tocToggle.setAttribute('aria-label', 'Close Contents');
        }

        renderToC();

        // Attach scroll sync.
        attachScrollSync(true);

        // Align the CURRENT page into the slot.
        // This ensures items before are visible above, and items after are visible below;
        // and the first item "down" is the next page.
        if (pendingPageId) {
            scrollItemToSelection(pendingPageId, 'auto');
        }

        // After layout, paint wheel styling and allow scroll-sync.
        setScrollSyncSuppressed(180);
        setTimeout(function () {
            applyWheelStyling();
            // Now safe to reconcile pending from scroll (should still be current).
            syncPendingFromScroll();
        }, 0);

        // Focus.
        setTimeout(function () {
            var closeBtn = tocPanel.querySelector('.toc-panel-close');
            if (closeBtn && closeBtn.focus) {
                closeBtn.focus();
                return;
            }

            var firstBtn = tocDynamicContent ? tocDynamicContent.querySelector('.toc-item-btn') : null;
            if (firstBtn && firstBtn.focus) {
                firstBtn.focus();
            } else if (tocPanel.focus) {
                tocPanel.focus();
            }
        }, 0);
    }

    function closeToC(commit) {
        if (!tocPanel || !tocOverlay) return;

        setTitleSheen(false);
        detachScrollSync();

        var shouldNavigate = !!commit && pendingHref && pendingPageId && pendingPageId !== currentPageId;
        var hrefToNavigate = pendingHref;

        tocPanel.classList.remove('is-open');
        tocOverlay.classList.remove('is-open');
        tocPanel.setAttribute('aria-hidden', 'true');
        tocOverlay.setAttribute('aria-hidden', 'true');
        if (tocToggle) {
            tocToggle.setAttribute('aria-expanded', 'false');
            tocToggle.setAttribute('aria-label', 'Open Contents');
        }

        unlockBodyScroll();

        if (!commit) {
            restoreHeaderTitle();
        }

        if (shouldNavigate) {
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    setTimeout(function () {
                        window.location.href = hrefToNavigate;
                    }, NAV_DELAY_MS);
                });
            });
            return;
        }

        restoreHeaderTitle();

        setTimeout(function () {
            var target = (focusReturnEl && document.contains(focusReturnEl)) ? focusReturnEl : tocToggle;
            if (target && target.focus) target.focus();
            focusReturnEl = null;
        }, 0);
    }

    function toggleToC() {
        if (tocPanel && tocPanel.classList.contains('is-open')) {
            closeToC(true);
        } else {
            openToC();
        }
    }

    function withinGhostGuardWindow() {
        return tocJustOpenedAt && (Date.now() - tocJustOpenedAt < TOC_GHOST_GUARD_MS);
    }

    // iOS Safari reliability: activate on pointerdown for touch (before scroll/gesture wins).
    function bindActivate(el, handler) {
        if (!el || !handler) return;

        var lastPointerDownAt = 0;

        if (window.PointerEvent) {
            el.addEventListener('pointerdown', function (e) {
                // Mouse: only primary.
                if (e && e.pointerType === 'mouse' && typeof e.button === 'number' && e.button !== 0) return;

                // Touch: fire immediately on pointerdown.
                if (e && e.pointerType === 'touch') {
                    lastPointerDownAt = Date.now();
                    handler(e);
                }
            });
        }

        el.addEventListener('click', function (e) {
            // Avoid double-activation when iOS synthesizes click after pointerdown.
            if (Date.now() - lastPointerDownAt < 700) return;
            handler(e);
        });
    }

    function wireControls() {
        if (tocToggle) {
            // Title sheen: hover + keyboard focus only.
            tocToggle.addEventListener('mouseenter', function () { setTitleSheen(true); });
            tocToggle.addEventListener('mouseleave', function () { setTitleSheen(false); });
            tocToggle.addEventListener('focus', function () { setTitleSheen(true); });
            tocToggle.addEventListener('blur', function () { setTitleSheen(false); });

            // Deliberate activation on touch: do NOT trigger on pointerdown.
            // Only toggle on click if the pointer did not move (i.e. not a scroll gesture).
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

                tocToggle.addEventListener('pointerup', function (e) {
                    if (!e || e.pointerType !== 'touch') return;
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

        if (tocPanel) {
            var closeBtns = tocPanel.querySelectorAll('.toc-panel-close');
            Array.prototype.forEach.call(closeBtns, function (btn) {
                bindActivate(btn, function (e) {
                    stopEvent(e);
                    closeToC(true);
                });
            });
        }

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && tocPanel && tocPanel.classList.contains('is-open')) {
                closeToC(true);
            }
        });

        // Reposition if viewport changes while the panel is open.
        window.addEventListener('resize', function () {
            positionTitleToggle();
            if (tocPanel && tocPanel.classList.contains('is-open')) positionDropdownPanel();
        });
        window.addEventListener('orientationchange', function () {
            positionTitleToggle();
            if (tocPanel && tocPanel.classList.contains('is-open')) positionDropdownPanel();
        });

        // Cancel (do not commit) on blur/visibility hide.
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
    wireControls();
})();
