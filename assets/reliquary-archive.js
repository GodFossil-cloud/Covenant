/*! Covenant Reliquary Archive v0.3.5 (aria-label: simplify to 'Remove?') */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;

  var KEY_PENDING = 'covenant_reliquary_pending_v1';
  var KEY_STORE = 'covenant_reliquary_v1';

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

    return {
      version: 1,
      items: items
    };
  }

  function writeStore(store) {
    try { window.localStorage.setItem(KEY_STORE, JSON.stringify(store)); } catch (err) {}
  }

  function normalizeItem(item) {
    if (!item || typeof item !== 'object') return null;

    var href = String(item.href || '').trim();
    var lexiconKey = String(item.lexiconKey || '').trim();
    if (!href || !lexiconKey) return null;

    var quote = String(item.quote || '').trim();
    var createdAt = (typeof item.createdAt === 'number' && isFinite(item.createdAt)) ? item.createdAt : Date.now();

    return {
      href: basename(href),
      lexiconKey: lexiconKey,
      quote: quote,
      createdAt: createdAt
    };
  }

  function dedupeItems(items) {
    var seen = Object.create(null);
    var out = [];

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
    href = basename(href);
    lexiconKey = String(lexiconKey || '').trim();
    if (!href || !lexiconKey) return false;

    var store = readStore();
    var before = Array.isArray(store.items) ? store.items.length : 0;

    var out = [];
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
    href = basename(href);
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
    } catch (err) {
      return null;
    }
  }

  function scrollToSentence(el) {
    if (!el || !el.scrollIntoView) return;
    try {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (err) {
      try { el.scrollIntoView(true); } catch (err2) {}
    }
  }

  function clickSentence(el) {
    if (!el) return false;
    try {
      el.click();
      return true;
    } catch (err) {
      try {
        var evt = doc.createEvent('MouseEvents');
        evt.initEvent('click', true, true);
        el.dispatchEvent(evt);
        return true;
      } catch (err2) {
        return false;
      }
    }
  }

  function openLexiconIfPossible() {
    var toggle = byId('lexiconToggle');
    var panel = byId('lexiconPanel');
    if (!toggle || !panel) return;

    try {
      if (panel.classList && panel.classList.contains('is-open')) return;
    } catch (err0) {}

    try { toggle.click(); } catch (err1) {}
  }

  function closeReliquaryThen(cb) {
    cb = (typeof cb === 'function') ? cb : function () {};

    var toggle = byId('mirrorToggle');
    var panel = byId('reliquaryPanel');

    if (!toggle || !panel) {
      cb();
      return;
    }

    if (!root.classList.contains('reliquary-open')) {
      cb();
      return;
    }

    var done = false;
    var obs = null;

    function finish() {
      if (done) return;
      done = true;
      try { if (obs) obs.disconnect(); } catch (err0) {}
      setTimeout(cb, 0);
    }

    try {
      obs = new MutationObserver(function () {
        var closed = (!root.classList.contains('reliquary-open')) && (panel.getAttribute('aria-hidden') === 'true');
        if (closed) finish();
      });
      obs.observe(root, { attributes: true, attributeFilter: ['class'] });
      obs.observe(panel, { attributes: true, attributeFilter: ['aria-hidden', 'class'] });
    } catch (err1) {
      obs = null;
    }

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

      if (openLexicon) {
        setTimeout(openLexiconIfPossible, 80);
      }
    }, 60);
  }

  function consumePendingJump() {
    var raw;
    try { raw = window.sessionStorage.getItem(KEY_PENDING); } catch (err0) { raw = null; }
    if (!raw) return;

    var payload = safeJsonParse(raw);
    clearPending();

    if (!payload || !payload.href || !payload.lexiconKey) return;

    var here = getCurrentFile();
    var target = basename(payload.href);
    if (!here || !target || here !== target) return;

    playHere(payload.lexiconKey, !!payload.openLexicon);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function truncate(s, n) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    if (s.length <= n) return s;
    return s.slice(0, Math.max(0, n - 1)).trim() + '…';
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
    var here = getCurrentFile();
    return here || '';
  }

  function renderArchive() {
    var host = byId('reliquaryArchive');
    var placeholder = byId('reliquaryPlaceholder');
    if (!host) return;

    var store = readStore();
    store.items = dedupeItems(store.items);
    writeStore(store);

    var byHref = groupByHref(store.items);
    var journey = getJourney();
    var currentHref = getCurrentHrefForJourney();

    var total = store.items.length;

    if (placeholder) {
      placeholder.style.display = total ? 'none' : '';
    }

    var html = [];
    html.push('<div class="reliquary-archive-index">');

    for (var i = 0; i < journey.length; i++) {
      var p = journey[i];
      if (!p || !p.href) continue;

      var href = String(p.href);
      var title = String(p.title || href);
      var list = byHref[href] || [];
      var count = list.length;

      var isCurrent = (currentHref && href === currentHref);
      var cls = isCurrent ? ' class="is-current"' : '';

      html.push('<details' + cls + ' data-reliquary-href="' + escapeHtml(href) + '">');
      html.push('<summary>');
      html.push('<span class="reliquary-archive-page-title">' + escapeHtml(title) + '</span>');
      html.push('<span class="reliquary-archive-count">' + (count ? ('(' + count + ')') : '') + '</span>');
      html.push('</summary>');

      html.push('<div class="reliquary-archive-items">');

      if (!count) {
        html.push('<div class="reliquary-archive-empty">No saved passages.</div>');
      } else {
        for (var j = 0; j < list.length; j++) {
          var it = list[j];
          var label = truncate(it.quote || '', 180);
          if (!label) label = '§ ' + it.lexiconKey;

          html.push(
            '<button'
              + ' type="button"'
              + ' class="reliquary-archive-item"'
              + ' data-reliquary-action="open"'
              + ' data-reliquary-href="' + escapeHtml(href) + '"'
              + ' data-reliquary-key="' + escapeHtml(it.lexiconKey) + '"'
              + '>'
          );
          html.push('<div class="reliquary-archive-item-text">' + escapeHtml(label) + '</div>');
          html.push('<div class="reliquary-archive-item-meta">');
          html.push('<span class="reliquary-archive-item-key">§ ' + escapeHtml(it.lexiconKey) + '</span>');
          html.push('<span class="reliquary-archive-item-page">' + escapeHtml(getPageTitleByHref(href)) + '</span>');
          html.push('</div>');
          html.push('</button>');
        }
      }

      html.push('</div>');
      html.push('</details>');
    }

    html.push('</div>');

    host.innerHTML = html.join('');

    try {
      if (currentHref) {
        var currentDetails = host.querySelector('details[data-reliquary-href="' + currentHref.replace(/"/g, '') + '"]');
        if (currentDetails) currentDetails.open = true;
      }
    } catch (err0) {}
  }

  function handleArchiveClick(e) {
    var btn = closestSafe(e.target, '[data-reliquary-action="open"]');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    var href = String(btn.getAttribute('data-reliquary-href') || '').trim();
    var key = String(btn.getAttribute('data-reliquary-key') || '').trim();
    if (!href || !key) return;

    var here = getCurrentFile();
    var target = basename(href);

    if (here && target && here === target) {
      closeReliquaryThen(function () {
        playHere(key, true);
      });
      return;
    }

    setPendingJump({ href: href, lexiconKey: key, openLexicon: true });
    window.location.href = href;
  }

  function wire() {
    var host = byId('reliquaryArchive');
    if (host && host.addEventListener) {
      host.addEventListener('click', handleArchiveClick);
    }

    var lastOpen = root.classList.contains('reliquary-open');

    function sync() {
      var isOpen = root.classList.contains('reliquary-open');
      if (isOpen && !lastOpen) {
        renderArchive();
      }
      lastOpen = isOpen;
    }

    try {
      var obs = new MutationObserver(sync);
      obs.observe(root, { attributes: true, attributeFilter: ['class'] });
    } catch (err0) {}
  }

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

      return {
        href: getCurrentFile(),
        lexiconKey: key,
        quote: quote
      };
    } catch (err) {
      return null;
    }
  }

  function wireSaveButton() {
    var btn = byId('lexiconReliquarySaveBtn');
    if (!btn) return;

    var originalLabel = 'Save to Reliquary';
    var savedLabel = 'Saved';
    var removedLabel = 'Removed from Reliquary';

    var transientTimer = null;
    var isTransient = false;

    function clearTransient() {
      if (transientTimer) {
        clearTimeout(transientTimer);
        transientTimer = null;
      }
      isTransient = false;
    }

    function setLabel(text) {
      var labelEl = btn.querySelector('.lexicon-reliquary-save-label');
      if (!labelEl) return;
      labelEl.textContent = String(text || '');
    }

    function setAriaLabel(text) {
      btn.setAttribute('aria-label', String(text || ''));
    }

    function setMode(mode) {
      btn.classList.remove('is-saved');
      btn.classList.remove('is-removed');

      if (mode === 'saved') {
        btn.classList.add('is-saved');
        setLabel(savedLabel);
        setAriaLabel('Remove?');
        return;
      }

      if (mode === 'removed') {
        btn.classList.add('is-removed');
        setLabel(removedLabel);
        setAriaLabel('Removed from Reliquary');
        return;
      }

      setLabel(originalLabel);
      setAriaLabel('Save to Reliquary');
    }

    function hideControl() {
      clearTransient();
      btn.hidden = true;
      btn.disabled = true;
      setMode('save');
    }

    function showControl() {
      btn.hidden = false;
      btn.disabled = false;
    }

    function updateSaveButtonState() {
      if (isTransient) return;

      var sel = getCurrentSelection();
      if (!sel) {
        hideControl();
        return;
      }

      showControl();

      if (hasItem(sel.href, sel.lexiconKey)) {
        setMode('saved');
      } else {
        setMode('save');
      }
    }

    function handleClick() {
      if (isTransient) return;

      var sel = getCurrentSelection();
      if (!sel) {
        hideControl();
        return;
      }

      var alreadySaved = hasItem(sel.href, sel.lexiconKey);

      if (!alreadySaved) {
        var ok = addItem(sel);
        if (!ok) return;

        if (root.classList.contains('reliquary-open')) {
          renderArchive();
        }

        updateSaveButtonState();
        return;
      }

      var removed = removeItem(sel.href, sel.lexiconKey);
      if (!removed) {
        updateSaveButtonState();
        return;
      }

      if (root.classList.contains('reliquary-open')) {
        renderArchive();
      }

      clearTransient();
      isTransient = true;
      setMode('removed');

      transientTimer = setTimeout(function () {
        clearTransient();
        updateSaveButtonState();
      }, 1200);
    }

    btn.addEventListener('click', function (e) {
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      handleClick();
    });

    var citEl = byId('citationText');
    if (citEl) {
      try {
        var citObs = new MutationObserver(updateSaveButtonState);
        citObs.observe(citEl, { attributes: true, attributeFilter: ['data-lexicon-key'] });
      } catch (err0) {}
    }

    var lexiconPanel = byId('lexiconPanel');
    if (lexiconPanel) {
      try {
        var panelObs = new MutationObserver(function () {
          var open = lexiconPanel.classList.contains('is-open');
          if (open) setTimeout(updateSaveButtonState, 50);
        });
        panelObs.observe(lexiconPanel, { attributes: true, attributeFilter: ['class'] });
      } catch (err1) {}
    }

    updateSaveButtonState();
  }

  window.COVENANT_RELIQUARY_ARCHIVE = {
    version: '0.3.5',
    readStore: readStore,
    writeStore: writeStore,
    addItem: addItem,
    removeItem: function (href, lexiconKey) { return removeItem(href, lexiconKey); },
    hasItem: function (href, lexiconKey) { return hasItem(href, lexiconKey); },
    render: renderArchive,
    setPendingJump: function (href, lexiconKey, openLexicon) {
      setPendingJump({ href: href, lexiconKey: lexiconKey, openLexicon: !!openLexicon });
    }
  };

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', function () {
      consumePendingJump();
      wire();
      wireSaveButton();
    });
  } else {
    consumePendingJump();
    wire();
    wireSaveButton();
  }

})();
