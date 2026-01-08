/*! Covenant ToC / Progress Journal v0.1.0 */
(function () {
    'use strict';

    var journey = window.COVENANT_JOURNEY || null;
    var pages = journey && Array.isArray(journey.pages) ? journey.pages : null;
    if (!pages || !pages.length) return;

    // Only activate on pages that appear in the journey registry.
    var currentHref = getCurrentHref();
    var currentIndex = indexByHref(currentHref);
    if (currentIndex === -1) return;

    var storageKey = journey.storageKey || 'covenant_progress_v1';

    var tocPanel = document.getElementById('tocPanel');
    var tocOverlay = document.getElementById('tocOverlay');
    var tocDynamic = document.getElementById('tocDynamicContent');
    var tocModeLabel = document.getElementById('tocModeLabel');
    var tocLive = document.getElementById('tocLiveRegion');

    var tocToggle = document.getElementById('tocToggle');

    var state = {
        maxIndexUnlocked: -1,
        canPersist: false
    };

    // --- Persistence ---
    state.canPersist = storageWorks();
    var stored = state.canPersist ? safeLoadProgress(storageKey) : null;
    if (stored && typeof stored.maxIndexUnlocked === 'number' && isFinite(stored.maxIndexUnlocked)) {
        state.maxIndexUnlocked = clamp(Math.floor(stored.maxIndexUnlocked), -1, pages.length - 1);
    }

    // --- Soft gate (only when persistence works) ---
    // Rule:
    // - Allowed: any page <= maxUnlocked, or exactly next page (maxUnlocked + 1).
    // - Disallowed: anything beyond next (jump-ahead). Redirect.
    if (state.canPersist) {
        var allowedMax = state.maxIndexUnlocked + 1;
        if (currentIndex > allowedMax) {
            var redirectHref = pages[Math.max(0, state.maxIndexUnlocked)].href;
            window.location.replace(redirectHref);
            return;
        }
    }

    // --- Unlock on reach ---
    if (currentIndex > state.maxIndexUnlocked) {
        state.maxIndexUnlocked = currentIndex;
        if (state.canPersist) safeSaveProgress(storageKey, state.maxIndexUnlocked);
    }

    // --- UI: inject header toggle (progressive enhancement) ---
    if (!tocToggle) {
        tocToggle = injectHeaderToggle();
    }

    if (!tocToggle || !tocPanel || !tocOverlay || !tocDynamic) return;

    // --- Rendering ---
    renderToc();

    // --- Panel interactions (mirrors Lexicon behavior) ---
    var focusReturnEl = null;
    var scrollLockY = 0;
    var iosTouchMoveBlocker = null;

    bindActivate(tocToggle, function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (tocPanel.classList.contains('is-open')) {
            closeToc();
        } else {
            // If Lexicon is open, close it first to avoid dual overlays/locks.
            closeLexiconIfOpen();
            renderToc();
            openToc();
        }
    });

    bindActivate(tocOverlay, function () {
        closeToc();
    });

    Array.prototype.forEach.call(tocPanel.querySelectorAll('.toc-panel-close'), function (btn) {
        bindActivate(btn, function (e) {
            if (e && e.preventDefault) e.preventDefault();
            closeToc();
        });
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && tocPanel.classList.contains('is-open')) {
            closeToc();
        }
    });

    // Handle locked item "activation" with announcement.
    tocPanel.addEventListener('click', function (e) {
        var t = e.target;
        var btn = closestSafe(t, 'button[data-toc-locked="true"]');
        if (!btn) return;
        e.preventDefault();
        announceLocked(btn.getAttribute('data-title') || 'This page');
    });

    // Smooth nav for unlocked anchors: close panel, then navigate.
    tocPanel.addEventListener('click', function (e) {
        var t = e.target;
        var link = closestSafe(t, 'a[data-toc-link="true"]');
        if (!link) return;

        // Allow normal browser behaviors for modified clicks.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (typeof e.button === 'number' && e.button !== 0)) return;

        var href = link.getAttribute('href');
        if (!href || href.charAt(0) === '#') return;

        e.preventDefault();
        closeToc();
        window.setTimeout(function () {
            window.location.href = href;
        }, 60);
    }, true);

    // --- Helpers ---
    function injectHeaderToggle() {
        var header = document.querySelector('.section-header');
        if (!header) return null;

        var btn = document.createElement('button');
        btn.id = 'tocToggle';
        btn.className = 'toc-toggle-header';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Open Contents');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', 'tocPanel');
        btn.textContent = 'Contents';

        header.appendChild(btn);
        return btn;
    }

    function renderToc() {
        var unlockedCount = Math.max(0, state.maxIndexUnlocked + 1);
        if (tocModeLabel) {
            tocModeLabel.textContent = unlockedCount + ' of ' + pages.length + ' opened';
        }

        var html = '';

        if (!state.canPersist) {
            html += '<div class="toc-alert" role="note">Progress cannot be saved in this browser. Unlock state may be lost when the tab closes.</div>';
        }

        html += '<nav class="toc-nav" aria-label="Covenant contents">';
        html += '<ol class="toc-list">';

        for (var i = 0; i < pages.length; i++) {
            var p = pages[i];
            var title = escapeHtml(p.title);
            var href = escapeAttr(p.href);

            var isCurrent = (i === currentIndex);
            var isUnlocked = (i <= state.maxIndexUnlocked);

            html += '<li class="toc-item">';

            if (isUnlocked) {
                html += '<a class="toc-link' + (isCurrent ? ' is-current' : '') + '" data-toc-link="true" href="' + href + '"' + (isCurrent ? ' aria-current="page"' : '') + '>';
                html += '<span class="toc-title">' + title + '</span>';
                html += '</a>';
            } else {
                html += '<button type="button" class="toc-link toc-link--locked" data-toc-locked="true" aria-disabled="true" data-title="' + escapeAttr(p.title) + '">';
                html += '<span class="toc-title">' + title + '</span>';
                html += '<span class="toc-lock" aria-hidden="true">Locked</span>';
                html += '<span class="sr-only">Locked until reached through the journey.</span>';
                html += '</button>';
            }

            html += '</li>';
        }

        html += '</ol>';
        html += '</nav>';

        if (journey.references && journey.references.length) {
            html += '<div class="toc-divider" aria-hidden="true">✦</div>';
            html += '<div class="toc-ref-title">References</div>';
            html += '<ul class="toc-ref-list">';
            for (var r = 0; r < journey.references.length; r++) {
                var ref = journey.references[r];
                html += '<li><a class="toc-ref-link" data-toc-link="true" href="' + escapeAttr(ref.href) + '">' + escapeHtml(ref.title) + '</a></li>';
            }
            html += '</ul>';
        }

        tocDynamic.innerHTML = html;
    }

    function openToc() {
        focusReturnEl = tocToggle;

        tocPanel.classList.add('is-open');
        tocOverlay.classList.add('is-open');

        tocPanel.setAttribute('aria-hidden', 'false');
        tocOverlay.setAttribute('aria-hidden', 'false');
        tocToggle.setAttribute('aria-expanded', 'true');

        lockBodyScroll();

        // Move focus into the panel.
        window.setTimeout(function () {
            var closeBtn = tocPanel.querySelector('.toc-panel-close');
            if (closeBtn && closeBtn.focus) closeBtn.focus();
        }, 0);
    }

    function closeToc() {
        tocPanel.classList.remove('is-open');
        tocOverlay.classList.remove('is-open');

        tocPanel.setAttribute('aria-hidden', 'true');
        tocOverlay.setAttribute('aria-hidden', 'true');
        tocToggle.setAttribute('aria-expanded', 'false');

        unlockBodyScroll();

        window.setTimeout(function () {
            var target = (focusReturnEl && document.contains(focusReturnEl)) ? focusReturnEl : tocToggle;
            if (target && target.focus) target.focus();
            focusReturnEl = null;
        }, 0);
    }

    function closeLexiconIfOpen() {
        var lexiconPanel = document.getElementById('lexiconPanel');
        var lexiconToggle = document.getElementById('lexiconToggle');
        if (!lexiconPanel || !lexiconToggle) return;
        if (lexiconPanel.classList.contains('is-open')) {
            // lexicon.js listens for activation events on lexiconToggle.
            lexiconToggle.click();
        }
    }

    function announceLocked(title) {
        if (!tocLive) return;
        tocLive.textContent = '';
        window.setTimeout(function () {
            tocLive.textContent = title + ' is locked until it is reached through the intended sequence.';
        }, 20);
    }

    function lockBodyScroll() {
        if (document.documentElement.classList.contains('lexicon-scroll-lock')) return;
        scrollLockY = window.scrollY || window.pageYOffset || 0;

        document.documentElement.classList.add('lexicon-scroll-lock');

        if (isIOS()) {
            document.body.style.overflow = 'hidden';
            enableIOSTouchScrollLock();
            return;
        }

        document.body.classList.add('lexicon-scroll-lock');
        document.body.style.top = (-scrollLockY) + 'px';
    }

    function unlockBodyScroll() {
        if (!document.documentElement.classList.contains('lexicon-scroll-lock')) return;

        document.documentElement.classList.remove('lexicon-scroll-lock');

        if (isIOS()) {
            disableIOSTouchScrollLock();
            document.body.style.overflow = '';
            window.scrollTo(0, scrollLockY);
            return;
        }

        document.body.classList.remove('lexicon-scroll-lock');
        document.body.style.top = '';
        window.scrollTo(0, scrollLockY);
    }

    function enableIOSTouchScrollLock() {
        if (iosTouchMoveBlocker) return;

        iosTouchMoveBlocker = function (e) {
            if (!tocPanel || !tocPanel.classList.contains('is-open')) return;
            var withinPanelBody = !!closestSafe(e.target, '.toc-panel-body');
            if (withinPanelBody) return;
            if (e && e.cancelable) e.preventDefault();
        };

        document.addEventListener('touchmove', iosTouchMoveBlocker, { capture: true, passive: false });
    }

    function disableIOSTouchScrollLock() {
        if (!iosTouchMoveBlocker) return;
        document.removeEventListener('touchmove', iosTouchMoveBlocker, { capture: true });
        iosTouchMoveBlocker = null;
    }

    function isIOS() {
        try {
            var ua = navigator.userAgent || '';
            var platform = navigator.platform || '';
            var iOSDevice = /iPad|iPhone|iPod/.test(ua);
            var iPadOS = (platform === 'MacIntel' && navigator.maxTouchPoints && navigator.maxTouchPoints > 1);
            return iOSDevice || iPadOS;
        } catch (err) {
            return false;
        }
    }

    function getCurrentHref() {
        var path = window.location.pathname || '';
        var parts = path.split('/');
        var file = parts[parts.length - 1] || '';
        return file || 'index.html';
    }

    function indexByHref(href) {
        for (var i = 0; i < pages.length; i++) {
            if (pages[i] && pages[i].href === href) return i;
        }
        return -1;
    }

    function storageWorks() {
        try {
            if (!window.localStorage) return false;
            var k = '__covenant_toc_test__';
            localStorage.setItem(k, '1');
            localStorage.removeItem(k);
            return true;
        } catch (err) {
            return false;
        }
    }

    function safeLoadProgress(key) {
        try {
            var raw = localStorage.getItem(key);
            if (!raw) return null;
            var data = JSON.parse(raw);
            if (!data || typeof data !== 'object') return null;
            return data;
        } catch (err) {
            return null;
        }
    }

    function safeSaveProgress(key, maxIndex) {
        try {
            localStorage.setItem(key, JSON.stringify({ v: 1, maxIndexUnlocked: maxIndex }));
        } catch (err) { }
    }

    function clamp(n, min, max) {
        return Math.max(min, Math.min(max, n));
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeAttr(value) {
        return escapeHtml(value).replace(/\n/g, ' ');
    }

    function closestSafe(target, selector) {
        if (!target) return null;
        var el = (target.nodeType === 1) ? target : target.parentElement;
        if (!el || !el.closest) return null;
        return el.closest(selector);
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
})();
