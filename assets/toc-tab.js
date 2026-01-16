/*! Covenant ToC Tab Module v1.0.3 (Keep tab visible while ToC open) */
(function () {
  'use strict';

  function $(sel) {
    return document.querySelector(sel);
  }

  function prefersReducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (err) {
      return false;
    }
  }

  function readCssNumberVar(varName) {
    try {
      var raw = getComputedStyle(document.documentElement).getPropertyValue(varName);
      if (!raw) return 0;
      var v = parseFloat(String(raw).trim());
      return isNaN(v) ? 0 : v;
    } catch (err) {
      return 0;
    }
  }

  function getFooterReservedPx() {
    var total = readCssNumberVar('--footer-total-height');
    if (!total) {
      total = readCssNumberVar('--footer-height') + readCssNumberVar('--footer-safe');
    }

    if (!total) {
      var footer = $('.nav-footer');
      if (footer && footer.getBoundingClientRect) total = footer.getBoundingClientRect().height || 0;
    }

    return Math.max(0, Math.round(total || 0));
  }

  var headerEl = $('.section-header');
  var headerTitleEl = headerEl ? headerEl.querySelector('h1') : null;
  var containerEl = $('.container');

  var tocPanel = $('#tocPanel');
  var tocToggle = $('#tocToggle');

  // toc.js should have created tocToggle by now (scripts are deferred + ordered),
  // but defensively bail if not present.
  if (!tocPanel || !tocToggle) return;

  var tocTab = $('#tocTab');
  var summoned = null;

  var SUMMON_MS = 240;

  var titleObserver = null;

  function isHeaderOffscreen() {
    if (!headerEl || !headerEl.getBoundingClientRect) return true;
    var r = headerEl.getBoundingClientRect();
    return r.bottom <= 0;
  }

  function getContainerLeftPx() {
    var base = containerEl || headerEl;
    if (!base || !base.getBoundingClientRect) return 14;
    var rect = base.getBoundingClientRect();
    return Math.max(10, Math.round(rect.left));
  }

  function getCurrentTitleText() {
    var titleText = '';
    if (headerTitleEl) titleText = String(headerTitleEl.textContent || '').trim();
    if (!titleText) titleText = document.title || '';
    return titleText;
  }

  function syncSummonedTitle() {
    if (!summoned) return;
    var t = getCurrentTitleText();
    if (!t) return;
    if (summoned.textContent !== t) summoned.textContent = t;
  }

  function ensureTitleObserver() {
    if (titleObserver || !headerTitleEl || !window.MutationObserver) return;

    titleObserver = new MutationObserver(function () {
      syncSummonedTitle();
    });

    titleObserver.observe(headerTitleEl, { childList: true, characterData: true, subtree: true });
  }

  function ensureTab() {
    if (tocTab) return;

    var btn = document.createElement('button');
    btn.id = 'tocTab';
    btn.type = 'button';
    btn.className = 'toc-tab-toggle';
    btn.setAttribute('aria-label', 'Open Contents');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span class="sr-only">Contents</span><span class="toc-tab-glyph" aria-hidden="true">☰</span>';

    // Bind to the header so it reads as part of the title plane.
    if (headerEl) headerEl.appendChild(btn);
    else document.body.appendChild(btn);

    tocTab = btn;
  }

  function updateTabStickyState() {
    if (!tocTab) return;

    if (isHeaderOffscreen()) {
      tocTab.classList.add('is-sticky');
      var leftPx = getContainerLeftPx();
      tocTab.style.left = leftPx + 'px';
      tocTab.style.setProperty('--toc-tab-left', leftPx + 'px');
    } else {
      tocTab.classList.remove('is-sticky');
      tocTab.style.left = '';
      tocTab.style.removeProperty('--toc-tab-left');
    }
  }

  function removeSummoned(immediate) {
    if (!summoned) return;

    var el = summoned;
    summoned = null;

    if (immediate || prefersReducedMotion()) {
      if (el.parentNode) el.parentNode.removeChild(el);
      return;
    }

    el.classList.remove('is-revealed');
    el.classList.add('is-hiding');

    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, SUMMON_MS + 40);
  }

  function createSummoned() {
    removeSummoned(true);

    if (!tocTab) return null;

    var tabRect = tocTab.getBoundingClientRect();
    var containerRect = containerEl && containerEl.getBoundingClientRect ? containerEl.getBoundingClientRect() : null;

    var rightPad = 10;
    if (containerRect) {
      rightPad = Math.max(10, Math.round(window.innerWidth - containerRect.right));
      rightPad = Math.max(0, rightPad);
    }

    var leftPx = Math.round(tabRect.right + 10);

    var el = document.createElement('div');
    el.className = 'toc-summoned-title';
    el.id = 'tocSummonedTitle';
    el.setAttribute('aria-hidden', 'true');

    el.textContent = getCurrentTitleText();

    el.style.top = Math.max(8, Math.round(tabRect.top)) + 'px';
    el.style.left = Math.max(0, leftPx) + 'px';
    el.style.right = rightPad + 'px';
    el.style.height = Math.max(34, Math.round(tabRect.height)) + 'px';

    document.body.appendChild(el);
    summoned = el;

    syncSummonedTitle();

    if (prefersReducedMotion()) {
      el.classList.add('is-revealed');
      return el;
    }

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (!el) return;
        el.classList.add('is-revealed');
      });
    });

    return el;
  }

  function positionPanelUnderSummoned() {
    if (!summoned || !tocPanel || !summoned.getBoundingClientRect) return;

    var stripRect = summoned.getBoundingClientRect();
    var topPx = Math.max(16, Math.round(stripRect.bottom));

    var footerReserved = getFooterReservedPx();
    var safeBottomLimit = Math.max(0, window.innerHeight - footerReserved);
    var available = safeBottomLimit - topPx;

    tocPanel.style.top = topPx + 'px';
    tocPanel.style.maxHeight = Math.max(220, Math.floor(available)) + 'px';
  }

  function isTocOpenish() {
    return tocPanel.classList.contains('is-open') || tocPanel.classList.contains('is-closing');
  }

  function setTabState(isOpen) {
    if (!tocTab) return;
    tocTab.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    tocTab.setAttribute('aria-label', isOpen ? 'Close Contents' : 'Open Contents');
  }

  function tabActivate(e) {
    if (e && e.preventDefault) e.preventDefault();

    if (isTocOpenish()) {
      removeSummoned(false);
      tocToggle.click();
      return;
    }

    if (isHeaderOffscreen()) {
      createSummoned();

      if (prefersReducedMotion()) {
        tocToggle.click();
        setTimeout(positionPanelUnderSummoned, 0);
        setTimeout(positionPanelUnderSummoned, 50);
        return;
      }

      setTimeout(function () {
        tocToggle.click();
        setTimeout(positionPanelUnderSummoned, 0);
        setTimeout(positionPanelUnderSummoned, 50);
      }, SUMMON_MS);

      return;
    }

    tocToggle.click();
  }

  function bind() {
    ensureTab();
    ensureTitleObserver();

    updateTabStickyState();

    // Keep sticky state in sync with scroll.
    window.addEventListener('scroll', updateTabStickyState, { passive: true });
    window.addEventListener('resize', function () {
      updateTabStickyState();
      positionPanelUnderSummoned();
    });

    if (tocTab) tocTab.addEventListener('click', tabActivate);

    // Track ToC open state: update aria + clear the summoned strip on close.
    var mo = new MutationObserver(function () {
      var html = document.documentElement;
      var isOpen = html.classList.contains('toc-open');
      setTabState(isOpen);

      if (!isOpen) {
        removeSummoned(false);
      } else {
        syncSummonedTitle();
      }
    });

    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    // Initial state.
    setTabState(document.documentElement.classList.contains('toc-open'));
  }

  bind();
})();
