/*! Covenant Reliquary Archive v0.4.13 (quote box = interactive save surface) */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;

  var KEY_PENDING = 'covenant_reliquary_pending_v1';
  var KEY_STORE   = 'covenant_reliquary_v1';

  // Hoisted ref set by wireCitationBookmarkToggle so doRemove can call sync().
  var _syncCitationState = null;

  function byId(id) { return doc.getElementById(id); }

  function closestSafe(target, selector) {
    if (!target) return null;
    var el = (target.nodeType === 1) ? target : target.parentElement;
    if (!el || !el.closest) return null;
    return el.closest(selector);
  }

  function basename(path) {
    var s = String(path || '');
    if (!s) return '';
    var q = s.indexOf('?');
    if (q >= 0) s = s.slice(0, q);
    var h = s.indexOf('#');
    if (h >= 0) s = s.slice(0, h);
    s = s.replace(/\\/g, '/');
    var parts = s.split('/');
    return parts[parts.length - 1] || '';
  }

  function getCurrentFile() {
    return basename(window.location && window.location.pathname);
  }

  function safeJsonParse(raw) {
    try { return JSON.parse(String(raw || '')); } catch (err) { return null; }
  }

  function readStore() {
    var raw = null;
    try { raw = window.localStorage.getItem(KEY_STORE); } catch (err0) { raw = null; }
    var data = safeJsonParse(raw);
    if (!data || typeof data !== 'object') data = {};
    var items = Array.isArray(data.items) ? data.items : [];
    return { version: 1, items: items };
  }

  function writeStore(store) {
    try { window.localStorage.setItem(KEY_STORE, JSON.stringify(store)); } catch (err) {}
  }

  function normalizeItem(item) {
    if (!item || typeof item !== 'object') return null;
    var href       = String(item.href       || '').trim();
    var lexiconKey = String(item.lexiconKey || '').trim();
    if (!href || !lexiconKey) return null;
    var quote     = String(item.quote || '').trim();
    var createdAt = (typeof item.createdAt === 'number' && isFinite(item.createdAt)) ? item.createdAt : Date.now();
    return { href: basename(href), lexiconKey: lexiconKey, quote: quote, createdAt: createdAt };
  }

  function dedupeItems(items) {
    var seen = Object.create(null);
    var out  = [];
    for (var i = 0; i < items.length; i++) {
      var it = normalizeItem(items[i]);
      if (!it) continue;
      var k = it.href + '|' + it.lexiconKey;
      if (seen[k]) continue;
      seen[k] = true;
      out.push(it);
    }
    return out;
  }

  function addItem(item) {
    var it = normalizeItem(item);
    if (!it) return false;
    var store = readStore();
    store.items = dedupeItems(store.items.concat([it]));
    writeStore(store);
    return true;
  }

  function removeItem(href, lexiconKey) {
    href       = basename(href);
    lexiconKey = String(lexiconKey || '').trim();
    if (!href || !lexiconKey) return false;
    var store  = readStore();
    var before = Array.isArray(store.items) ? store.items.length : 0;
    var out    = [];
    for (var i = 0; i < store.items.length; i++) {
      var it = normalizeItem(store.items[i]);
      if (!it) continue;
      if (it.href === href && it.lexiconKey === lexiconKey) continue;
      out.push(it);
    }
    store.items = dedupeItems(out);
    writeStore(store);
    return store.items.length !== before;
  }

  function hasItem(href, lexiconKey) {
    href       = basename(href);
    lexiconKey = String(lexiconKey || '').trim();
    if (!href || !lexiconKey) return false;
    var store = readStore();
    var items = dedupeItems(store.items);
    for (var i = 0; i < items.length; i++) {
      if (items[i].href === href && items[i].lexiconKey === lexiconKey) return true;
    }
    return false;
  }

  function setPendingJump(payload) {
    try { window.sessionStorage.setItem(KEY_PENDING, JSON.stringify(payload)); } catch (err) {}
  }

  function clearPending() {
    try { window.sessionStorage.removeItem(KEY_PENDING); } catch (err) {}
  }

  function findSentenceByKey(key) {
    if (!key) return null;
    try {
      return doc.querySelector('.sentence[data-lexicon-key="' + String(key).replace(/"/g, '') + '"]');
    } catch (err) { return null; }
  }

  function scrollToSentence(el) {
    if (!el || !el.scrollIntoView) return;
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    catch (err) { try { el.scrollIntoView(true); } catch (err2) {} }
  }

  function clickSentence(el) {
    if (!el) return false;
    try { el.click(); return true; }
    catch (err) {
      try {
        var evt = doc.createEvent('MouseEvents');
        evt.initEvent('click', true, true);
        el.dispatchEvent(evt);
        return true;
      } catch (err2) { return false; }
    }
  }

  function openLexiconIfPossible() {
    var toggle = byId('lexiconToggle');
    var panel  = byId('lexiconPanel');
    if (!toggle || !panel) return;
    try { if (panel.classList && panel.classList.contains('is-open')) return; } catch (err0) {}
    try { toggle.click(); } catch (err1) {}
  }

  function closeReliquaryThen(cb) {
    cb = (typeof cb === 'function') ? cb : function () {};
    var toggle = byId('mirrorToggle');
    var panel  = byId('reliquaryPanel');
    if (!toggle || !panel) { cb(); return; }
    if (!root.classList.contains('reliquary-open')) { cb(); return; }
    var done = false;
    var obs  = null;
    function finish() {
      if (done) return;
      done = true;
      try { if (obs) obs.disconnect(); } catch (err0) {}
      setTimeout(cb, 0);
    }
    try {
      obs = new MutationObserver(function () {
        var closed = (!root.classList.contains('reliquary-open'))
                     && (panel.getAttribute('aria-hidden') === 'true');
        if (closed) finish();
      });
      obs.observe(root,  { attributes: true, attributeFilter: ['class'] });
      obs.observe(panel, { attributes: true, attributeFilter: ['aria-hidden', 'class'] });
    } catch (err1) { obs = null; }
    try { toggle.click(); } catch (err2) { finish(); }
    setTimeout(finish, 720);
  }

  function playHere(lexiconKey, openLexicon) {
    var el = findSentenceByKey(lexiconKey);
    if (!el) return;
    scrollToSentence(el);
    setTimeout(function () {
      var ok = clickSentence(el);
      if (!ok) return;
      if (openLexicon) setTimeout(openLexiconIfPossible, 80);
    }, 60);
  }

  function consumePendingJump() {
    var raw;
    try { raw = window.sessionStorage.getItem(KEY_PENDING); } catch (err0) { raw = null; }
    if (!raw) return;
    var payload = safeJsonParse(raw);
    clearPending();
    if (!payload || !payload.href || !payload.lexiconKey) return;
    var here   = getCurrentFile();
    var target = basename(payload.href);
    if (!here || !target || here !== target) return;
    playHere(payload.lexiconKey, !!payload.openLexicon);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g,  '&#39;');
  }

  function truncate(s, n) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    if (s.length <= n) return s;
    return s.slice(0, Math.max(0, n - 1)).trim() + '\u2026';
  }

  function groupByHref(items) {
    var map = Object.create(null);
    for (var i = 0; i < items.length; i++) {
      var it = normalizeItem(items[i]);
      if (!it) continue;
      if (!map[it.href]) map[it.href] = [];
      map[it.href].push(it);
    }
    var keys = Object.keys(map);
    for (var k = 0; k < keys.length; k++) {
      map[keys[k]].sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    }
    return map;
  }

  function getJourney() {
    return Array.isArray(window.COVENANT_JOURNEY) ? window.COVENANT_JOURNEY : [];
  }

  function getPageTitleByHref(href) {
    var journey = getJourney();
    for (var i = 0; i < journey.length; i++) {
      if (journey[i] && journey[i].href === href) return journey[i].title || href;
    }
    return href;
  }

  function getCurrentHrefForJourney() {
    return getCurrentFile() || '';
  }

  function fitTitlesToSingleLine() {
    var summaries = doc.querySelectorAll('.reliquary-archive summary');
    if (!summaries || !summaries.length) return;
    for (var i = 0; i < summaries.length; i++) {
      var summary  = summaries[i];
      var titleEl  = summary.querySelector('.reliquary-archive-page-title');
      if (!titleEl) continue;
      titleEl.style.fontSize   = '';
      titleEl.style.whiteSpace = 'nowrap';
      var summaryWidth = summary.offsetWidth;
      var padding      = 1.44 * 16;
      var countEl      = summary.querySelector('.reliquary-archive-count');
      var countWidth   = countEl ? countEl.offsetWidth : 0;
      var availWidth   = summaryWidth - padding - countWidth - 10 - 4;
      if (availWidth <= 0) { titleEl.style.whiteSpace = ''; continue; }
      var currentSize = 1.04;
      var minSize     = 0.86;
      titleEl.style.fontSize = currentSize + 'rem';
      var attempts = 0;
      while (titleEl.scrollWidth > availWidth && currentSize > minSize && attempts < 20) {
        currentSize -= 0.02;
        titleEl.style.fontSize = currentSize + 'rem';
        attempts++;
      }
      if (titleEl.scrollWidth > availWidth) titleEl.style.whiteSpace = '';
    }
  }

  // ---------------------------
  // Active item state
  // ---------------------------

  var activeItemHref = null;
  var activeItemKey  = null;

  function setActiveItem(href, key) { activeItemHref = href || null; activeItemKey = key || null; }
  function clearActiveItem()        { activeItemHref = null; activeItemKey = null; }
  function isActiveItem(href, key)  { return activeItemHref === href && activeItemKey === key; }

  // ---------------------------
  // Armed button state
  // ---------------------------

  var armedAction = null;

  function getArmedBtn() {
    if (!armedAction || !activeItemHref || !activeItemKey) return null;
    var host = byId('reliquaryArchive');
    if (!host) return null;
    var safeHref = activeItemHref.replace(/"/g, '');
    var safeKey  = activeItemKey.replace(/"/g, '');
    try {
      return host.querySelector(
        '.reliquary-archive-item-action[data-reliquary-action="' + armedAction + '"]'
        + '[data-reliquary-href="' + safeHref + '"]'
        + '[data-reliquary-key="'  + safeKey  + '"]'
      );
    } catch (err) { return null; }
  }

  function disarmBtn(btn, originalCaption) {
    if (!btn) return;
    btn.classList.remove('is-armed');
    var captionEl = btn.querySelector('.reliquary-archive-item-action-caption');
    if (captionEl && originalCaption) captionEl.textContent = originalCaption;
  }

  function clearArmed() {
    if (!armedAction) return;
    var btn    = getArmedBtn();
    var caption = (armedAction === 'remove') ? 'Remove' : 'Navigate';
    disarmBtn(btn, caption);
    armedAction = null;
  }

  function armBtn(btn, action) {
    if (!btn) return;
    armedAction = action;
    btn.classList.add('is-armed');
    var captionEl = btn.querySelector('.reliquary-archive-item-action-caption');
    if (captionEl) captionEl.textContent = 'Confirm?';
  }

  // ---------------------------
  // Button factory
  // ---------------------------

  function makeActionBtn(action, href, key, glyph, caption, extraClass) {
    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'reliquary-archive-item-action ' + extraClass;
    btn.setAttribute('data-reliquary-action', action);
    btn.setAttribute('data-reliquary-href', href);
    btn.setAttribute('data-reliquary-key', key);
    btn.setAttribute('aria-label', caption);

    var glyphEl = doc.createElement('span');
    glyphEl.className = 'reliquary-archive-item-action-glyph';
    glyphEl.setAttribute('aria-hidden', 'true');
    glyphEl.textContent = glyph;

    var captionEl = doc.createElement('span');
    captionEl.className = 'reliquary-archive-item-action-caption';
    captionEl.setAttribute('aria-hidden', 'true');
    captionEl.textContent = caption;

    btn.appendChild(glyphEl);
    btn.appendChild(captionEl);
    return btn;
  }

  function buildMenuEl(href, key) {
    var menu = doc.createElement('div');
    menu.className = 'reliquary-archive-item-menu';
    menu.setAttribute('aria-hidden', 'false');
    menu.appendChild(makeActionBtn('remove',   href, key, '\u2715', 'Remove',   'reliquary-archive-item-remove'));
    menu.appendChild(makeActionBtn('navigate', href, key, '\u21f2', 'Navigate', 'reliquary-archive-item-navigate'));
    return menu;
  }

  function expandItem(btn, href, key) {
    setActiveItem(href, key);
    btn.classList.add('is-expanded');
    btn.appendChild(buildMenuEl(href, key));
  }

  function collapseActiveItem() {
    if (!activeItemHref || !activeItemKey) return;
    var host = byId('reliquaryArchive');
    if (!host) { clearActiveItem(); clearArmed(); return; }
    var safeHref = activeItemHref.replace(/"/g, '');
    var safeKey  = activeItemKey.replace(/"/g, '');
    var btn = host.querySelector(
      '.reliquary-archive-item.is-expanded'
      + '[data-reliquary-href="' + safeHref + '"]'
      + '[data-reliquary-key="'  + safeKey  + '"]'
    );
    if (btn) {
      btn.classList.remove('is-expanded');
      var menu = btn.querySelector('.reliquary-archive-item-menu');
      if (menu) btn.removeChild(menu);
    }
    armedAction = null;
    clearActiveItem();
  }

  // ---------------------------
  // Render
  // ---------------------------

  function buildItemHtml(href, it) {
    var label = truncate(it.quote || '', 180);
    if (!label) label = '\u00a7 ' + it.lexiconKey;
    var html = [];
    html.push(
      '<button type="button"'
      + ' class="reliquary-archive-item"'
      + ' data-reliquary-action="select"'
      + ' data-reliquary-href="' + escapeHtml(href)           + '"'
      + ' data-reliquary-key="'  + escapeHtml(it.lexiconKey) + '"'
      + '>'
    );
    html.push('<div class="reliquary-archive-item-face">');
    html.push('<div class="reliquary-archive-item-text">' + escapeHtml(label) + '</div>');
    html.push('<div class="reliquary-archive-item-meta">');
    html.push('<span class="reliquary-archive-item-key">\u00a7 ' + escapeHtml(it.lexiconKey) + '</span>');
    html.push('<span class="reliquary-archive-item-page">' + escapeHtml(getPageTitleByHref(href)) + '</span>');
    html.push('</div>');
    html.push('</div>');
    html.push('</button>');
    return html.join('');
  }

  function renderArchive() {
    var host        = byId('reliquaryArchive');
    var placeholder = byId('reliquaryPlaceholder');
    if (!host) return;

    var store = readStore();
    store.items = dedupeItems(store.items);
    writeStore(store);

    var byHref      = groupByHref(store.items);
    var journey     = getJourney();
    var currentHref = getCurrentHrefForJourney();
    var total       = store.items.length;

    if (placeholder) placeholder.style.display = total ? 'none' : '';

    var html = ['<div class="reliquary-archive-index">'];

    for (var i = 0; i < journey.length; i++) {
      var p     = journey[i];
      if (!p || !p.href) continue;
      var href  = String(p.href);
      var title = String(p.title || href);
      var list  = byHref[href] || [];
      var count = list.length;
      var cls   = (currentHref && href === currentHref) ? ' class="is-current"' : '';

      html.push('<details' + cls + ' data-reliquary-href="' + escapeHtml(href) + '">');
      html.push('<summary>');
      html.push('<span class="reliquary-archive-page-title">' + escapeHtml(title) + '</span>');
      html.push('<span class="reliquary-archive-count">' + (count ? ('(' + count + ')') : '') + '</span>');
      html.push('</summary>');
      html.push('<div class="reliquary-archive-items">');
      if (!count) {
        html.push('<div class="reliquary-archive-empty">No saved passages.</div>');
      } else {
        for (var j = 0; j < list.length; j++) html.push(buildItemHtml(href, list[j]));
      }
      html.push('</div>');
      html.push('</details>');
    }

    html.push('</div>');
    host.innerHTML = html.join('');

    try {
      if (currentHref) {
        var det = host.querySelector('details[data-reliquary-href="' + currentHref.replace(/"/g, '') + '"]');
        if (det) det.open = true;
      }
    } catch (err0) {}

    setTimeout(fitTitlesToSingleLine, 0);
  }

  // ---------------------------
  // Navigation / remove actions
  // ---------------------------

  function doNavigate(href, key) {
    clearActiveItem();
    armedAction = null;
    var here   = getCurrentFile();
    var target = basename(href);
    if (here && target && here === target) {
      closeReliquaryThen(function () { playHere(key, true); });
      return;
    }
    setPendingJump({ href: href, lexiconKey: key, openLexicon: true });
    window.location.href = href;
  }

  function doRemove(href, key) {
    clearActiveItem();
    armedAction = null;
    removeItem(href, key);
    renderArchive();
    // Sync citation label + bookmark glyph + quote box if this was the selected passage.
    var sel = getCurrentSelection();
    if (sel && sel.lexiconKey === key && basename(sel.href) === basename(href)) {
      if (_syncCitationState) _syncCitationState();
    }
  }

  // ---------------------------
  // Archive click handling
  // ---------------------------

  function handleArchiveClick(e) {
    var action   = null;
    var actionEl = null;

    var el = (e.target && e.target.nodeType === 1) ? e.target : (e.target ? e.target.parentElement : null);
    while (el) {
      var a = el.getAttribute && el.getAttribute('data-reliquary-action');
      if (a) { action = a; actionEl = el; break; }
      if (el.id === 'reliquaryArchive') break;
      el = el.parentElement;
    }

    if (!action || !actionEl) {
      if (armedAction) { clearArmed(); return; }
      collapseActiveItem();
      return;
    }

    var href = String(actionEl.getAttribute('data-reliquary-href') || '').trim();
    var key  = String(actionEl.getAttribute('data-reliquary-key')  || '').trim();

    if (action === 'navigate' || action === 'remove') {
      e.preventDefault();
      e.stopPropagation();
      if (!href || !key) return;
      if (armedAction === action) {
        clearArmed();
        if (action === 'navigate') doNavigate(href, key);
        else doRemove(href, key);
        return;
      }
      clearArmed();
      armBtn(actionEl, action);
      return;
    }

    if (action === 'select') {
      e.preventDefault();
      e.stopPropagation();
      if (!href || !key) return;
      if (isActiveItem(href, key)) { clearArmed(); collapseActiveItem(); return; }
      clearArmed();
      collapseActiveItem();
      expandItem(actionEl, href, key);
      return;
    }
  }

  function wireArchiveList() {
    var host = byId('reliquaryArchive');
    if (host && host.addEventListener) host.addEventListener('click', handleArchiveClick);

    var lastOpen = root.classList.contains('reliquary-open');
    function sync() {
      var isOpen = root.classList.contains('reliquary-open');
      if (isOpen && !lastOpen)  { clearActiveItem(); armedAction = null; renderArchive(); }
      if (!isOpen && lastOpen)  { clearActiveItem(); armedAction = null; }
      lastOpen = isOpen;
    }
    try {
      var obs = new MutationObserver(sync);
      obs.observe(root, { attributes: true, attributeFilter: ['class'] });
    } catch (err0) {}
  }

  // ---------------------------
  // Quote box flash helpers
  // ---------------------------

  function getQuoteBox() {
    var dc = byId('lexiconDynamicContent');
    return dc ? dc.querySelector('.lexicon-sentence-quote') : null;
  }

  var flashTimer = null;
  
    // Mirror tab consecration pulse on save / remove.
  var pulseTabTimer = null;
  function pulseMirrorTab(type) {
    var btn = byId('mirrorToggle');
    if (!btn) return;
    if (pulseTabTimer) { window.clearTimeout(pulseTabTimer); pulseTabTimer = null; }
    btn.classList.remove('is-reliquary-pulse-save', 'is-reliquary-pulse-remove');
    void btn.offsetWidth; // force reflow so re-triggering works
    var cls = (type === 'save') ? 'is-reliquary-pulse-save' : 'is-reliquary-pulse-remove';
    btn.classList.add(cls);
    pulseTabTimer = window.setTimeout(function () {
      try { btn.classList.remove('is-reliquary-pulse-save', 'is-reliquary-pulse-remove'); } catch (err) {}
      pulseTabTimer = null;
    }, type === 'save' ? 560 : 440);
  }
  
  function flashQuoteBox(type) {
    var box = getQuoteBox();
    if (!box) return;
    if (flashTimer) { window.clearTimeout(flashTimer); flashTimer = null; }
    box.classList.remove('is-consecrating', 'is-removing');
    void box.offsetWidth;
    box.classList.add(type === 'save' ? 'is-consecrating' : 'is-removing');
    flashTimer = window.setTimeout(function () {
      try { if (box) box.classList.remove('is-consecrating', 'is-removing'); } catch (err) {}
      flashTimer = null;
    }, type === 'save' ? 420 : 380);
  }

  // ---------------------------
  // Quote box: wire click/keyboard save toggle
  // Called by lexicon.js after every renderSentenceExplanation.
  // Also exposed as window.COVENANT_RELIQUARY_WIRE_QUOTE_BOX.
  // ---------------------------

  function wireQuoteBox() {
    var box = getQuoteBox();
    if (!box) return;

    // Set initial saved state.
    var sel = getCurrentSelection();
    if (sel) {
      var isSaved = hasItem(sel.href, sel.lexiconKey);
      box.classList.toggle('is-saved', isSaved);
      box.classList.toggle('is-saveable', !isSaved);
      box.setAttribute('data-quote-hint', isSaved ? 'Saved \u2726  \u2014 tap to remove' : 'Tap to save');
      box.setAttribute('aria-label',   isSaved ? 'Remove from Reliquary' : 'Save to Reliquary');
      box.setAttribute('aria-pressed', isSaved ? 'true' : 'false');
    }

    function toggle(e) {
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();

      var currentSel = getCurrentSelection();
      if (!currentSel) return;

      var wasSaved = hasItem(currentSel.href, currentSel.lexiconKey);
      if (wasSaved) {
        removeItem(currentSel.href, currentSel.lexiconKey);
        flashQuoteBox('remove');
        pulseMirrorTab('remove');
      } else {
        addItem(currentSel);
        flashQuoteBox('save');
        pulseMirrorTab('save');
      }

      var nowSaved = !wasSaved;

      // Update quote box visual state.
      if (typeof window.COVENANT_LEXICON_UPDATE_QUOTE_BOX === 'function') {
        window.COVENANT_LEXICON_UPDATE_QUOTE_BOX(nowSaved);
      }

      // Sync citation bookmark glyph.
      if (_syncCitationState) _syncCitationState();

      // Re-render archive if it's open.
      if (root.classList.contains('reliquary-open')) renderArchive();
    }

    box.addEventListener('click', toggle);
    box.addEventListener('keydown', function (e) {
      var k = e && e.key;
      if (k !== 'Enter' && k !== ' ') return;
      toggle(e);
    });
  }

  // Exposed so lexicon.js can call it after every renderSentenceExplanation.
  window.COVENANT_RELIQUARY_WIRE_QUOTE_BOX = wireQuoteBox;

  // ---------------------------
  // Citation bookmark toggle
  // ---------------------------

  function getCurrentSelection() {
    try {
      var cit = byId('citationText');
      if (!cit) return null;
      var key = (cit.dataset && cit.dataset.lexiconKey) ? String(cit.dataset.lexiconKey).trim() : '';
      if (!key) return null;
      var el = findSentenceByKey(key);
      if (!el) return null;
      var quoteAttr = el.getAttribute('data-sentence-text');
      var quote = quoteAttr ? String(quoteAttr).trim() : '';
      if (!quote) {
        var textEl = el.querySelector('.subsection-text');
        if (textEl) quote = String(textEl.textContent || '').replace(/\s+/g, ' ').trim();
      }
      return { href: getCurrentFile(), lexiconKey: key, quote: quote };
    } catch (err) { return null; }
  }

  function wireCitationBookmarkToggle() {
    var el    = byId('citationText');
    var label = byId('citationLabel');
    if (!el) return;

    try { el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0'); } catch (err0) {}

    var pulseTimer = null;
    var lastArmed  = false;

    function pulse() {
      if (pulseTimer) { window.clearTimeout(pulseTimer); pulseTimer = null; }
      el.classList.remove('bookmark-pulse');
      void el.offsetWidth;
      el.classList.add('bookmark-pulse');
      pulseTimer = window.setTimeout(function () {
        try { el.classList.remove('bookmark-pulse'); } catch (err2) {}
        pulseTimer = null;
      }, 280);
    }

    function setArmedState(isArmed) {
      if (!label) return;
      var armed = !!isArmed;
      try { label.classList.toggle('is-armed', armed); } catch (err0) {}
      if (armed && !lastArmed) {
        try {
          label.classList.add('is-armed-wake');
          window.setTimeout(function () {
            try { label.classList.remove('is-armed-wake'); } catch (err2) {}
          }, 480);
        } catch (err1) {}
      }
      if (!armed) { try { label.classList.remove('is-armed-wake'); } catch (err3) {} }
      lastArmed = armed;
    }

    // Flash confirmation message via the citation label's ::after pseudo-element.
    var flashLabelTimer = null;
    function flashLabel(type) {
      if (!label) return;
      if (flashLabelTimer) { window.clearTimeout(flashLabelTimer); flashLabelTimer = null; }
      label.classList.remove('is-reliquary-flash', 'is-reliquary-saved', 'is-reliquary-removed');
      void label.offsetWidth;
      var msg  = (type === 'save') ? 'Saved \u2726' : 'Removed';
      var cls  = (type === 'save') ? 'is-reliquary-saved' : 'is-reliquary-removed';
      label.setAttribute('data-reliquary-flash', msg);
      label.classList.add('is-reliquary-flash', cls);
      flashLabelTimer = window.setTimeout(function () {
        try {
          label.classList.remove('is-reliquary-flash', 'is-reliquary-saved', 'is-reliquary-removed');
          label.removeAttribute('data-reliquary-flash');
        } catch (err) {}
        flashLabelTimer = null;
      }, 1100);
    }

    function setStateFromSelection(sel) {
      setArmedState(!!sel);
      if (!sel) {
        el.classList.remove('is-bookmarked');
        try { el.setAttribute('aria-label', 'Select a passage to mark'); el.setAttribute('aria-pressed', 'false'); } catch (err0) {}
        return;
      }
      var saved = hasItem(sel.href, sel.lexiconKey);
      el.classList.toggle('is-bookmarked', saved);
      try {
        el.setAttribute('aria-label',   saved ? 'Remove from Reliquary' : 'Save to Reliquary');
        el.setAttribute('aria-pressed', saved ? 'true' : 'false');
      } catch (err1) {}
    }

    function sync() { setStateFromSelection(getCurrentSelection()); }

    // Expose sync so doRemove and wireQuoteBox can call it.
    _syncCitationState = sync;

    function toggleSelection() {
      var sel = getCurrentSelection();
      if (!sel) { sync(); return; }
      var wasSaved = hasItem(sel.href, sel.lexiconKey);
      if (wasSaved) removeItem(sel.href, sel.lexiconKey);
      else addItem(sel);
      var type = wasSaved ? 'remove' : 'save';
      flashLabel(type);
      pulseMirrorTab(type);
      // Keep quote box in sync when toggled from the citation label.
      if (typeof window.COVENANT_LEXICON_UPDATE_QUOTE_BOX === 'function') {
        window.COVENANT_LEXICON_UPDATE_QUOTE_BOX(!wasSaved);
      }
      if (root.classList.contains('reliquary-open')) renderArchive();
      sync();
    }

    el.addEventListener('click', function (e) {
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopImmediatePropagation) e.stopImmediatePropagation();
      if (e && e.stopPropagation) e.stopPropagation();
      pulse(); toggleSelection();
    }, true);

    el.addEventListener('keydown', function (e) {
      var k = e && e.key;
      if (k !== 'Enter' && k !== ' ') return;
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopImmediatePropagation) e.stopImmediatePropagation();
      if (e && e.stopPropagation) e.stopPropagation();
      pulse(); toggleSelection();
    }, true);

    try {
      var obs = new MutationObserver(sync);
      obs.observe(el, { attributes: true, attributeFilter: ['data-lexicon-key'] });
    } catch (err3) {}

    window.addEventListener('storage', function (evt) {
      if (!evt || evt.key !== KEY_STORE) return;
      sync();
    });

    sync();
  }

  window.COVENANT_RELIQUARY_ARCHIVE = {
    version: '0.4.13',
    readStore:  readStore,
    writeStore: writeStore,
    addItem:    addItem,
    removeItem: function (href, lexiconKey) { return removeItem(href, lexiconKey); },
    hasItem:    function (href, lexiconKey) { return hasItem(href, lexiconKey); },
    render:     renderArchive,
    setPendingJump: function (href, lexiconKey, openLexicon) {
      setPendingJump({ href: href, lexiconKey: lexiconKey, openLexicon: !!openLexicon });
    }
  };

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', function () {
      consumePendingJump();
      wireArchiveList();
      wireCitationBookmarkToggle();
    });
  } else {
    consumePendingJump();
    wireArchiveList();
    wireCitationBookmarkToggle();
  }

})();
