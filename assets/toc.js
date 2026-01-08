/*! Covenant ToC Progress Journal v1.0.0 */
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

    function canNavigateTo(pageId) {
        var idx = window.getJourneyIndex(pageId);
        if (idx < 0) return false;
        return idx <= maxIndexUnlocked;
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

        // User jumped ahead; redirect to first page.
        console.warn('[Covenant ToC] Access denied to locked page:', currentPageId);
        window.location.href = 'invocation.html';
    }

    // Mark current page as unlocked (called after gate check).
    function unlockCurrentPage() {
        if (!currentPageId) return;
        unlock(currentPageId);
    }

    // Render ToC list.
    function renderToC() {
        if (!tocDynamicContent) return;

        var html = '<nav aria-label="Journey contents"><ol class="toc-list">';

        for (var i = 0; i < window.COVENANT_JOURNEY.length; i++) {
            var page = window.COVENANT_JOURNEY[i];
            var isUnlocked = i <= maxIndexUnlocked;
            var isCurrent = page.id === currentPageId;

            html += '<li class="toc-item';
            if (isCurrent) html += ' toc-item--current';
            if (!isUnlocked) html += ' toc-item--locked';
            html += '">';

            if (isUnlocked) {
                html += '<a href="' + page.href + '"';
                if (isCurrent) html += ' aria-current="page"';
                html += '>' + page.title + '</a>';
            } else {
                html += '<button type="button" class="toc-locked-btn" aria-disabled="true" data-page-id="' + page.id + '">';
                html += page.title;
                html += '<span class="toc-locked-label" aria-hidden="true"> (Locked)</span>';
                html += '<span class="sr-only"> – Locked until reached through the journey</span>';
                html += '</button>';
            }

            html += '</li>';
        }

        html += '</ol></nav>';

        tocDynamicContent.innerHTML = html;

        // Wire locked button handlers.
        var lockedBtns = tocDynamicContent.querySelectorAll('.toc-locked-btn');
        Array.prototype.forEach.call(lockedBtns, function (btn) {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                announceLockedAttempt();
            });
        });
    }

    function announceLockedAttempt() {
        if (!tocLiveRegion) return;
        tocLiveRegion.textContent = 'This page is locked until you reach it through the journey.';
        setTimeout(function () {
            tocLiveRegion.textContent = '';
        }, 3000);
    }

    // Panel open/close (mirrors Lexicon behavior).
    var focusReturnEl = null;

    function openToC() {
        if (!tocPanel || !tocOverlay) return;
        focusReturnEl = tocToggle;
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

    function closeToC() {
        if (!tocPanel || !tocOverlay) return;
        tocPanel.classList.remove('is-open');
        tocOverlay.classList.remove('is-open');
        tocPanel.setAttribute('aria-hidden', 'true');
        tocOverlay.setAttribute('aria-hidden', 'true');
        if (tocToggle) tocToggle.setAttribute('aria-expanded', 'false');

        setTimeout(function () {
            var target = (focusReturnEl && document.contains(focusReturnEl)) ? focusReturnEl : tocToggle;
            if (target && target.focus) target.focus();
            focusReturnEl = null;
        }, 0);
    }

    function toggleToC() {
        if (tocPanel && tocPanel.classList.contains('is-open')) {
            closeToC();
        } else {
            openToC();
        }
    }

    // Wire toggle button.
    if (tocToggle) {
        tocToggle.addEventListener('click', function (e) {
            e.preventDefault();
            toggleToC();
        });
    }

    // Wire overlay click to close.
    if (tocOverlay) {
        tocOverlay.addEventListener('click', function () {
            closeToC();
        });
    }

    // Wire close button.
    if (tocPanel) {
        var closeBtns = tocPanel.querySelectorAll('.toc-panel-close');
        Array.prototype.forEach.call(closeBtns, function (btn) {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                closeToC();
            });
        });
    }

    // Escape key closes panel.
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && tocPanel && tocPanel.classList.contains('is-open')) {
            closeToC();
        }
    });

    // Safety: force close on blur/hide.
    window.addEventListener('blur', function () {
        if (tocPanel && tocPanel.classList.contains('is-open')) closeToC();
    });
    document.addEventListener('visibilitychange', function () {
        if (document.hidden && tocPanel && tocPanel.classList.contains('is-open')) closeToC();
    });

    // Initialize on load.
    loadProgress();
    enforceSoftGate();
    unlockCurrentPage();
})();
