/*! Covenant ToC Progress Journal v1.1.2 */
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
    // Option 1 behavior:
    // - First click on an unlocked item sets pending + previews in the page header title.
    // - Second click on the SAME pending item travels immediately.
    // - Closing the ToC commits (travels) if pending != current.
    var pendingPageId = '';
    var pendingHref = '';
    var pendingTitle = '';

    // Anti-ghost-click window after opening (iOS Safari can dispatch a synthesized click that
    // lands on the newly-opened overlay and immediately closes the panel).
    var tocJustOpenedAt = 0;
    var TOC_GHOST_GUARD_MS = 520;

    // Delay navigation slightly so the close animation reads as a ritual "folding".
    var NAV_DELAY_MS = 260;

    function closestSafe(target, selector) {
        if (!target) return null;
        var el = (target.nodeType === 1) ? target : target.parentElement;
        if (!el || !el.closest) return null;
        return el.closest(selector);
    }

    // ----------------------------------------
    // Header title preview slot
    // ----------------------------------------
    var headerEl = document.querySelector('.section-header');
    var headerTitleEl = headerEl ? headerEl.querySelector('h1') : null;
    var originalHeaderTitleText = headerTitleEl ? String(headerTitleEl.textContent || '') : '';

    function ensureOriginalHeaderTitleCaptured() {
        if (!headerTitleEl) return;
        if (originalHeaderTitleText) return;
        originalHeaderTitleText = String(headerTitleEl.textContent || '');
    }

    function setHeaderPreviewState(isPreviewing) {
        if (!headerEl) return;
        headerEl.classList.toggle('toc-previewing', !!isPreviewing);
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

        setHeaderPreviewState(true);
        headerTitleEl.classList.add('toc-title-swapping');

        setTimeout(function () {
            headerTitleEl.textContent = title;
            headerTitleEl.classList.remove('toc-title-swapping');
        }, 140);
    }

    function restoreHeaderTitle() {
        if (!headerTitleEl) return;
        ensureOriginalHeaderTitleCaptured();

        var target = String(originalHeaderTitleText || '').trim();
        if (!target) return;

        headerTitleEl.classList.add('toc-title-swapping');
        setTimeout(function () {
            headerTitleEl.textContent = target;
            headerTitleEl.classList.remove('toc-title-swapping');
            setHeaderPreviewState(false);
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
            // (Without this exception, iOS cannot scroll the panel content.)
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

        var titleEl = document.getElementById('tocSelectionTitle');
        if (titleEl) titleEl.textContent = pendingTitle;

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

    function renderToC() {
        if (!tocDynamicContent) return;

        var currentPage = getJourneyPageById(currentPageId);
        var selectionTitle = pendingTitle || (currentPage ? currentPage.title : (pageConfig.modeLabel || ''));

        var html = '';

        html += '<div class="toc-selection" role="region" aria-label="Pending destination">';
        // Visually remove the "Selected" label/hint to strengthen the "title lives in the scroll" illusion.
        // Keep a silent label for screen readers.
        html += '<div class="sr-only">Selected destination</div>';
        html += '<div class="toc-selection-title" id="tocSelectionTitle">' + escapeHtml(selectionTitle) + '</div>';
        html += '</div>';

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

                // Option 1: second click on same pending item travels immediately.
                if (pid === pendingPageId) {
                    closeToC(true);
                    return;
                }

                setPending(pid, false);
            });
        });
    }

    // Create a header-mounted toggle so we do not disturb the footer seal geometry.
    function ensureToggleExists() {
        if (tocToggle) return;
        if (!tocPanel) return;

        var btn = document.createElement('button');
        btn.id = 'tocToggle';
        btn.type = 'button';
        btn.className = 'toc-toggle';
        btn.setAttribute('aria-label', 'Open Contents');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', 'tocPanel');

        // Embedded sigil control (glyph-only).
        btn.innerHTML = '<span class="toc-toggle-glyph" aria-hidden="true">☰</span>';

        var header = document.querySelector('.section-header');
        if (header) {
            header.classList.add('has-toc-toggle');
            header.appendChild(btn);
        } else {
            btn.classList.add('toc-toggle--floating');
            document.body.appendChild(btn);
        }

        tocToggle = btn;
    }

    function positionDropdownPanel() {
        if (!tocPanel) return;

        var header = document.querySelector('.section-header');
        var topPx = 16;

        if (header && header.getBoundingClientRect) {
            var rect = header.getBoundingClientRect();
            topPx = Math.round(rect.bottom + 10);
        }

        // For fixed-position elements, top is relative to the viewport.
        tocPanel.style.top = topPx + 'px';

        // Keep a small bottom gutter so the sheet doesn't collide with the footer dock.
        var maxH = Math.max(220, window.innerHeight - topPx - 18);
        tocPanel.style.maxHeight = maxH + 'px';
    }

    // Panel open/close.
    var focusReturnEl = null;

    function openToC() {
        if (!tocPanel || !tocOverlay) return;

        tocJustOpenedAt = Date.now();

        focusReturnEl = tocToggle;

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

        if (pendingTitle) animateHeaderTitleTo(pendingTitle);

        tocPanel.classList.add('is-open');
        tocOverlay.classList.add('is-open');
        tocPanel.setAttribute('aria-hidden', 'false');
        tocOverlay.setAttribute('aria-hidden', 'false');
        if (tocToggle) tocToggle.setAttribute('aria-expanded', 'true');

        renderToC();

        setTimeout(function () {
            var closeBtn = tocPanel.querySelector('.toc-panel-close');
            if (closeBtn && closeBtn.focus) {
                closeBtn.focus();
            } else if (tocPanel.focus) {
                tocPanel.focus();
            }
        }, 0);
    }

    function closeToC(commit) {
        if (!tocPanel || !tocOverlay) return;

        var shouldNavigate = !!commit && pendingHref && pendingPageId && pendingPageId !== currentPageId;
        var hrefToNavigate = pendingHref;

        tocPanel.classList.remove('is-open');
        tocOverlay.classList.remove('is-open');
        tocPanel.setAttribute('aria-hidden', 'true');
        tocOverlay.setAttribute('aria-hidden', 'true');
        if (tocToggle) tocToggle.setAttribute('aria-expanded', 'false');

        unlockBodyScroll();

        // If this was a cancel (blur/visibility), restore the original title immediately.
        if (!commit) {
            restoreHeaderTitle();
        }

        if (shouldNavigate) {
            setTimeout(function () {
                window.location.href = hrefToNavigate;
            }, NAV_DELAY_MS);
            return;
        }

        // No navigation: restore original title (we were just previewing the current page title).
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
            bindActivate(tocToggle, function (e) {
                stopEvent(e);
                toggleToC();
            });
        }

        if (tocOverlay) {
            bindActivate(tocOverlay, function (e) {
                // iOS ghost-click guard: ignore immediate post-open events.
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
            if (tocPanel && tocPanel.classList.contains('is-open')) positionDropdownPanel();
        });
        window.addEventListener('orientationchange', function () {
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
