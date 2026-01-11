/*! Covenant ToC Basic Dropdown v2.0.2 */
(function () {
  'use strict';

  // Tiny global version marker for compatibility checks.
  window.COVENANT_TOC_VERSION = '2.0.2';

  if (!window.COVENANT_JOURNEY || !window.getJourneyIndex) {
    console.warn('[Covenant ToC] Journey definition not found; ToC disabled.');
    return;
  }

  var STORAGE_KEY = 'covenant_progress';
  var STORAGE_VERSION = 1;

  var pageConfig = window.COVENANT_PAGE || {};
  var currentPageId = pageConfig.pageId || '';

  var tocPanel = document.getElementById('tocPanel');
  var tocOverlay = document.getElementById('tocOverlay');
  var tocToggle = document.getElementById('tocToggle');
  var tocDynamicContent = document.getElementById('tocDynamicContent');
  var tocLiveRegion = document.getElementById('tocLiveRegion');

  var root = document.documentElement;
  var scrollLockY = 0;

  var storageAvailable = false;
  var maxIndexUnlocked = -1;
  var inMemoryFallback = -1;

  // Anti-ghost-click window after opening (iOS Safari synthesized click).
  var tocJustOpenedAt = 0;
  var TOC_GHOST_GUARD_MS = 520;

  // Delay navigation slightly so the close animation reads.
  var NAV_DELAY_MS = 240;

  var focusReturnEl = null;
  var contentClickBound = false;

  // ----------------------------------------
  // Helpers
  // ----------------------------------------
  function closestSafe(target, selector) {
    if (!target) return null;
    var el = (target.nodeType === 1) ? target : target.parentElement;
    if (!el || !el.closest) return null;
    return el.closest(selector);
  }

  function stopEvent(e) {
    if (!e) return;
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function announce(message) {
    if (!tocLiveRegion) return;
    tocLiveRegion.textContent = message;
    setTimeout(function () {
      if (tocLiveRegion.textContent === message) tocLiveRegion.textContent = '';
    }, 2500);
  }

  function withinGhostGuardWindow() {
    return tocJustOpenedAt && (Date.now() - tocJustOpenedAt < TOC_GHOST_GUARD_MS);
  }

  function announceLockedAttempt() {
    announce('This page is locked until you reach it through the journey.');
  }

  // ----------------------------------------
  // Storage / progression
  // ----------------------------------------
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, max: maxIndexUnlocked }));
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

  function unlockCurrentPage() {
    if (!currentPageId) return;
    unlock(currentPageId);
  }

  function enforceSoftGate() {
    if (!currentPageId) return;
    if (!storageAvailable) return;

    var currentIdx = window.getJourneyIndex(currentPageId);
    if (currentIdx < 0) return;

    if (currentIdx <= maxIndexUnlocked + 1) return;

    console.warn('[Covenant ToC] Access denied to locked page:', currentPageId);
    window.location.href = 'invocation.html';
  }

  function isUnlockedJourneyIndex(i) {
    return typeof i === 'number' && i >= 0 && i <= maxIndexUnlocked;
  }

  // ----------------------------------------
  // Title-as-toggle (header/title is the button)
  // ----------------------------------------
  var headerEl = document.querySelector('.section-header');
  var headerTitleEl = headerEl ? headerEl.querySelector('h1') : null;

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
    btn.innerHTML = '<span class="sr-only">Toggle Contents</span>';

    if (headerEl && headerTitleEl) {
      headerEl.classList.add('has-toc-toggle');
      headerEl.appendChild(btn);
    } else {
      btn.classList.remove('toc-toggle--title');
      btn.classList.add('toc-toggle--floating');
      btn.innerHTML = '<span class="toc-toggle-glyph" aria-hidden="true">☰</span>';
      document.body.appendChild(btn);
    }

    tocToggle = btn;
    positionTitleToggle();

    setTimeout(positionTitleToggle, 0);
    setTimeout(positionTitleToggle, 250);
  }

  // ----------------------------------------
  // Scroll lock (mirrors Lexicon approach)
  // ----------------------------------------
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

    if (isIOS) enableIOSTouchScrollLock();

    document.body.classList.add('toc-scroll-lock');
    document.body.style.top = (-scrollLockY) + 'px';
  }

  function unlockBodyScroll() {
    if (!root.classList.contains('toc-scroll-lock')) {
      root.classList.remove('toc-open');
      return;
    }

    root.classList.remove('toc-scroll-lock', 'toc-open');

    if (isIOS) disableIOSTouchScrollLock();

    document.body.classList.remove('toc-scroll-lock');
    document.body.style.top = '';
    window.scrollTo(0, scrollLockY);
  }

  // ----------------------------------------
  // Render: basic dropdown list
  // ----------------------------------------
  function renderToC() {
    if (!tocDynamicContent) return;

    var html = '<nav aria-label="Journey contents"><ol class="toc-list">';

    for (var i = 0; i < window.COVENANT_JOURNEY.length; i++) {
      var page = window.COVENANT_JOURNEY[i];
      if (!page || !page.id) continue;

      var isCurrent = (page.id === currentPageId);
      var unlocked = isUnlockedJourneyIndex(i);

      html += '<li class="toc-item'
        + (isCurrent ? ' toc-item--current' : '')
        + (unlocked ? '' : ' toc-item--locked')
        + '" data-page-id="' + escapeHtml(page.id) + '"'
        + (isCurrent ? ' aria-current="page"' : '')
        + '>';

      if (unlocked) {
        if (isCurrent) {
          html += '<button type="button" class="toc-item-btn" aria-current="page" disabled>';
          html += escapeHtml(page.title);
          html += '</button>';
        } else {
          html += '<button type="button" class="toc-item-btn" data-href="' + escapeHtml(page.href) + '">';
          html += escapeHtml(page.title);
          html += '</button>';
        }
      } else {
        html += '<button type="button" class="toc-locked-btn" aria-disabled="true">';
        html += escapeHtml(page.title);
        html += '<span class="toc-locked-label" aria-hidden="true"> (Locked)</span>';
        html += '<span class="sr-only"> – Locked until reached through the journey</span>';
        html += '</button>';
      }

      html += '</li>';
    }

    html += '</ol></nav>';
    tocDynamicContent.innerHTML = html;
  }

  // ----------------------------------------
  // Content click delegation
  // ----------------------------------------
  function bindContentClicks() {
    if (contentClickBound) return;
    if (!tocDynamicContent) return;

    tocDynamicContent.addEventListener('click', function (e) {
      var lockedBtn = closestSafe(e.target, '.toc-locked-btn');
      if (lockedBtn) {
        stopEvent(e);
        announceLockedAttempt();
        return;
      }

      var itemBtn = closestSafe(e.target, '.toc-item-btn');
      if (!itemBtn) return;

      var href = itemBtn.getAttribute('data-href');
      if (!href) {
        // Current page button is disabled and has no data-href; ignore.
        return;
      }

      stopEvent(e);
      closeToC(false);

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          setTimeout(function () {
            window.location.href = href;
          }, NAV_DELAY_MS);
        });
      });
    });

    contentClickBound = true;
  }

  // ----------------------------------------
  // Open / Close
  // ----------------------------------------
  function positionDropdownPanel() {
    if (!tocPanel) return;

    var topPx = 16;
    if (headerEl && headerEl.getBoundingClientRect) {
      topPx = Math.round(headerEl.getBoundingClientRect().bottom);
    }

    tocPanel.style.top = topPx + 'px';
    tocPanel.style.maxHeight = Math.max(220, window.innerHeight - topPx - 18) + 'px';

    positionTitleToggle();
  }

  function openToC() {
    if (!tocPanel || !tocOverlay) return;

    tocJustOpenedAt = Date.now();
    focusReturnEl = tocToggle;

    lockBodyScroll();
    positionDropdownPanel();

    tocPanel.classList.add('is-open');
    tocOverlay.classList.add('is-open');
    tocPanel.setAttribute('aria-hidden', 'false');
    tocOverlay.setAttribute('aria-hidden', 'false');

    if (tocToggle) {
      tocToggle.setAttribute('aria-expanded', 'true');
      tocToggle.setAttribute('aria-label', 'Close Contents');
    }

    renderToC();

    setTimeout(function () {
      var closeBtn = tocPanel.querySelector('.toc-panel-close');
      if (closeBtn && closeBtn.focus) closeBtn.focus();
      else if (tocPanel.focus) tocPanel.focus();
    }, 0);
  }

  function closeToC(restoreFocus) {
    if (!tocPanel || !tocOverlay) return;

    tocPanel.classList.remove('is-open');
    tocOverlay.classList.remove('is-open');
    tocPanel.setAttribute('aria-hidden', 'true');
    tocOverlay.setAttribute('aria-hidden', 'true');

    if (tocToggle) {
      tocToggle.setAttribute('aria-expanded', 'false');
      tocToggle.setAttribute('aria-label', 'Open Contents');
    }

    unlockBodyScroll();

    if (restoreFocus) {
      setTimeout(function () {
        var target = (focusReturnEl && document.contains(focusReturnEl)) ? focusReturnEl : tocToggle;
        if (target && target.focus) target.focus();
        focusReturnEl = null;
      }, 0);
    } else {
      focusReturnEl = null;
    }
  }

  function toggleToC() {
    if (tocPanel && tocPanel.classList.contains('is-open')) closeToC(true);
    else openToC();
  }

  // ----------------------------------------
  // Wiring
  // ----------------------------------------
  function setTitleSheen(isOn) {
    if (!headerEl) return;
    headerEl.classList.toggle('toc-title-sheen', !!isOn);
  }

  function bindActivate(el, handler) {
    if (!el || !handler) return;

    var lastPointerDownAt = 0;

    if (window.PointerEvent) {
      el.addEventListener('pointerdown', function (e) {
        if (e && e.pointerType === 'mouse' && typeof e.button === 'number' && e.button !== 0) return;
        if (e && e.pointerType === 'touch') {
          lastPointerDownAt = Date.now();
          handler(e);
        }
      });
    }

    el.addEventListener('click', function (e) {
      if (Date.now() - lastPointerDownAt < 700) return;
      handler(e);
    });
  }

  function wireControls() {
    if (tocToggle) {
      tocToggle.addEventListener('mouseenter', function () { setTitleSheen(true); });
      tocToggle.addEventListener('mouseleave', function () { setTitleSheen(false); });
      tocToggle.addEventListener('focus', function () { setTitleSheen(true); });
      tocToggle.addEventListener('blur', function () { setTitleSheen(false); });

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
      if (e.key === 'Escape' && tocPanel && tocPanel.classList.contains('is-open')) closeToC(true);
    });

    window.addEventListener('resize', function () {
      positionTitleToggle();
      if (tocPanel && tocPanel.classList.contains('is-open')) positionDropdownPanel();
    });

    window.addEventListener('orientationchange', function () {
      positionTitleToggle();
      if (tocPanel && tocPanel.classList.contains('is-open')) positionDropdownPanel();
    });

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
  bindContentClicks();
  wireControls();
})();
