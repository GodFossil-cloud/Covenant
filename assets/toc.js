/*! Covenant ToC Progress Journal v1.0.7 */
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

    // Anti-ghost-click window after opening (iOS Safari can dispatch a synthesized click that
    // lands on the newly-opened overlay and immediately closes the panel).
    var tocJustOpenedAt = 0;
    var TOC_GHOST_GUARD_MS = 520;

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
        if (!tocLiveRegion) return;
        tocLiveRegion.textContent = 'This page is locked until you reach it through the journey.';
        setTimeout(function () {
            tocLiveRegion.textContent = '';
        }, 3000);
    }

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
                html += '<a href="' + escapeHtml(page.href) + '"';
                if (isCurrent) html += ' aria-current="page"';
                html += '>' + escapeHtml(page.title) + '</a>';
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

    // Panel open/close.
    var focusReturnEl = null;

    function openToC() {
        if (!tocPanel || !tocOverlay) return;

        tocJustOpenedAt = Date.now();

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
                closeToC();
            });
        }

        if (tocPanel) {
            var closeBtns = tocPanel.querySelectorAll('.toc-panel-close');
            Array.prototype.forEach.call(closeBtns, function (btn) {
                bindActivate(btn, function (e) {
                    stopEvent(e);
                    closeToC();
                });
            });
        }

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && tocPanel && tocPanel.classList.contains('is-open')) {
                closeToC();
            }
        });

        window.addEventListener('blur', function () {
            if (tocPanel && tocPanel.classList.contains('is-open')) closeToC();
        });
        document.addEventListener('visibilitychange', function () {
            if (document.hidden && tocPanel && tocPanel.classList.contains('is-open')) closeToC();
        });
    }

    // Initialize
    loadProgress();
    enforceSoftGate();
    unlockCurrentPage();

    ensureToggleExists();
    wireControls();
})();
