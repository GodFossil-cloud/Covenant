/*! Covenant Reliquary Archive v0.1.0 (pending passage replay) */
(function () {
  'use strict';

  var doc = document;

  var KEY_PENDING = 'covenant_reliquary_pending_v1';

  function byId(id) { return doc.getElementById(id); }

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

    var el = findSentenceByKey(payload.lexiconKey);
    if (!el) return;

    scrollToSentence(el);

    setTimeout(function () {
      var ok = clickSentence(el);
      if (!ok) return;

      if (payload.openLexicon) {
        setTimeout(openLexiconIfPossible, 80);
      }
    }, 60);
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', consumePendingJump);
  } else {
    consumePendingJump();
  }

})();
