/* Covenant ToC Progress Enhancer (v1)
   - Draws a vertical progress fill inside the ToC track.
   - Adds subtle dividers between Prelude / Articles / Rites groups when present.

   NOTE: This script is intentionally small and DOM-driven.
   It does not change journey gating or navigation rules; it only enhances the ToC presentation.
*/

(()=>{
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function pxFromCssLength(contextEl, cssLength){
    const v = (cssLength || '').trim();
    if(!v) return 0;

    const probe = document.createElement('div');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.height = v;

    contextEl.appendChild(probe);
    const px = probe.getBoundingClientRect().height || 0;
    probe.remove();
    return px;
  }

  function ensureFillEl(tocIndex){
    let fill = $('.toc-progress-fill', tocIndex);
    if(fill) return fill;

    fill = document.createElement('div');
    fill.className = 'toc-progress-fill';
    fill.setAttribute('aria-hidden','true');

    fill.style.position = 'absolute';
    fill.style.pointerEvents = 'none';
    fill.style.zIndex = '1';
    fill.style.width = '2px';
    fill.style.borderRadius = '999px';
    fill.style.opacity = '0';
    fill.style.transition = 'height 260ms ease, opacity 180ms ease';
    fill.style.background = 'linear-gradient(to bottom, rgba(201,169,97,0) 0%, rgba(201,169,97,.82) 14%, rgba(201,169,97,.62) 72%, rgba(201,169,97,0) 100%)';
    fill.style.boxShadow = '0 0 12px rgba(201,169,97,.12)';

    tocIndex.insertBefore(fill, tocIndex.firstChild);
    return fill;
  }

  function markGroupsAndDividers(root){
    const groups = $$('.toc-group', root);
    if(!groups.length) return;

    const wanted = [
      { key:'prelude', label:'prelude' },
      { key:'articles', label:'articles' },
      { key:'rites', label:'rites' }
    ];

    for(const g of groups){
      const tab = $('.toc-group-title .toc-tab', g);
      if(!tab) continue;
      const name = (tab.textContent || '').trim().toLowerCase();
      const hit = wanted.find(w => name === w.label);
      if(!hit) continue;
      g.classList.add(`toc-group--${hit.key}`);

      // Insert a single subtle divider before Articles and Rites (Prelude is first).
      if(hit.key === 'articles' || hit.key === 'rites'){
        const prev = g.previousElementSibling;
        const already = prev && prev.classList && prev.classList.contains('toc-soft-divider');
        if(!already){
          const div = document.createElement('div');
          div.className = 'toc-soft-divider';
          div.setAttribute('aria-hidden','true');
          div.style.height = '1px';
          div.style.margin = '0.95rem 0 1.05rem 1.65rem';
          div.style.background = 'linear-gradient(to right, rgba(44,62,80,.00), rgba(44,62,80,.18), rgba(44,62,80,.00))';
          div.style.boxShadow = '0 0 0 1px rgba(255,255,255,.08)';
          g.parentNode.insertBefore(div, g);
        }
      }
    }
  }

  function computeProgress(){
    const dyn = document.getElementById('tocDynamicContent');
    if(!dyn) return;

    const tocIndex = $('.toc-index', dyn);
    if(!tocIndex) return;

    markGroupsAndDividers(dyn);

    const items = $$('.toc-item', tocIndex);
    if(!items.length) return;

    // Anchor: prefer current, else last unlocked, else first.
    const current = $('.toc-item--current', tocIndex);
    const lastUnlocked = [...items].reverse().find(it => !it.classList.contains('toc-item--locked'));
    const anchor = current || lastUnlocked || items[0];

    const btn = $('.toc-item-btn, .toc-locked-btn', anchor) || anchor;
    const btnStyle = window.getComputedStyle(btn);

    const fontSizePx = parseFloat(btnStyle.fontSize) || 16;
    const lineHeightPx = (btnStyle.lineHeight === 'normal') ? (fontSizePx * 1.2) : (parseFloat(btnStyle.lineHeight) || (fontSizePx * 1.2));
    const padTopPx = parseFloat(btnStyle.paddingTop) || 0;

    const anchorRect = anchor.getBoundingClientRect();
    const indexRect = tocIndex.getBoundingClientRect();

    const indexStyle = window.getComputedStyle(tocIndex);
    const ruleXToken = (indexStyle.getPropertyValue('--toc-rule-x') || '.95rem').trim();
    const ruleTopToken = (indexStyle.getPropertyValue('--toc-rule-top') || '.3rem').trim();
    const ruleBottomToken = (indexStyle.getPropertyValue('--toc-rule-bottom') || '2.9rem').trim();

    const ruleXPx = pxFromCssLength(tocIndex, ruleXToken);
    const ruleTopPx = pxFromCssLength(tocIndex, ruleTopToken);
    const ruleBottomPx = pxFromCssLength(tocIndex, ruleBottomToken);

    const nodeCenterY = anchorRect.top + padTopPx + (lineHeightPx / 2);
    let h = nodeCenterY - (indexRect.top + ruleTopPx);

    const maxH = Math.max(0, indexRect.height - ruleTopPx - ruleBottomPx);
    h = Math.max(0, Math.min(h, maxH));

    const fill = ensureFillEl(tocIndex);
    fill.style.left = `${ruleXPx}px`;
    fill.style.top = `${ruleTopPx}px`;
    fill.style.height = `${h}px`;
    fill.style.transform = 'translateX(-1px)';
    fill.style.opacity = '1';
  }

  function schedule(){
    window.requestAnimationFrame(()=>{
      computeProgress();
    });
  }

  function boot(){
    const dyn = document.getElementById('tocDynamicContent');
    if(dyn){
      const obs = new MutationObserver(schedule);
      obs.observe(dyn, { childList:true, subtree:true });
    }

    const html = document.documentElement;
    const htmlObs = new MutationObserver(()=>{
      if(html.classList.contains('toc-open') || html.classList.contains('toc-opening')) schedule();
    });
    htmlObs.observe(html, { attributes:true, attributeFilter:['class'] });

    window.addEventListener('resize', ()=>{
      if(html.classList.contains('toc-open')) schedule();
    }, { passive:true });

    if(window.visualViewport){
      window.visualViewport.addEventListener('resize', ()=>{
        if(html.classList.contains('toc-open')) schedule();
      }, { passive:true });
    }

    // Initial attempt (harmless if ToC hasn't rendered yet).
    schedule();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
