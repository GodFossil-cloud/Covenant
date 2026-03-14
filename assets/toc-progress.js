/* Covenant ToC Progress Enhancer (v3)
   The gold binding fill is now handled entirely by CSS (toc.css ::after on .toc-index),
   driven by the --toc-gate-y CSS variable set by toc.js updateGateBindingStop().
   This script handles only the supplementary decorations: sealed spine, gate line, gate sigil.
   The .toc-progress-fill element is retained but kept permanently hidden to avoid conflicts.
*/

(()=>{
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function ensureEl(tocIndex, className){
    let el = $(`.${className}`, tocIndex);
    if(el) return el;
    el = document.createElement('div');
    el.className = className;
    el.setAttribute('aria-hidden','true');
    el.style.position = 'absolute';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '1';
    tocIndex.insertBefore(el, tocIndex.firstChild);
    return el;
  }

  function ensureSealedSpineEl(tocIndex){
    const spine = ensureEl(tocIndex, 'toc-sealed-spine');
    spine.style.width = '2px';
    spine.style.borderRadius = '999px';
    spine.style.opacity = '0';
    spine.style.transition = 'height 240ms ease, opacity 180ms ease';
    spine.style.background = 'repeating-linear-gradient(to bottom,\n      rgba(44,62,80,.00) 0px,\n      rgba(44,62,80,.00) 5px,\n      rgba(44,62,80,.26) 5px,\n      rgba(44,62,80,.26) 10px)';
    spine.style.boxShadow = '0 0 0 1px rgba(255,255,255,.08)';
    return spine;
  }

  function ensureGateEmphasisEl(tocIndex){
    const gate = ensureEl(tocIndex, 'toc-gate-emphasis');
    gate.style.height = '2px';
    gate.style.opacity = '0';
    gate.style.transition = 'opacity 180ms ease';
    gate.style.borderRadius = '999px';
    gate.style.boxShadow = '0 0 0 1px rgba(255,255,255,.06), 0 0 18px rgba(139,0,0,.10)';
    gate.style.background = 'linear-gradient(to right,\n      rgba(139,0,0,1) 0%,\n      rgba(139,0,0,.40) 40%,\n      rgba(139,0,0,.00) 100%)';
    return gate;
  }

  function ensureGateSigilEl(tocIndex){
    const sigil = ensureEl(tocIndex, 'toc-gate-sigil');
    sigil.style.zIndex = '-1';
    sigil.style.width = '18px';
    sigil.style.height = '18px';
    sigil.style.display = 'grid';
    sigil.style.placeItems = 'center';
    sigil.style.opacity = '0';
    sigil.style.transition = 'opacity 180ms ease';
    sigil.style.color = '#8b0000';
    sigil.style.fontFamily = "'Noto Sans Symbols 2','Noto Sans Symbols','Segoe UI Symbol','Apple Symbols',serif";
    sigil.style.fontSize = '14px';
    sigil.style.lineHeight = '1';
    sigil.style.textShadow = 'none';
    sigil.textContent = '\u2726';
    return sigil;
  }

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

  function computeDecorations(){
    const dyn = document.getElementById('tocDynamicContent');
    if(!dyn) return;
    const tocIndex = $('.toc-index', dyn);
    if(!tocIndex) return;

    markGroupsAndDividers(dyn);

    const indexStyle = window.getComputedStyle(tocIndex);
    const ruleXToken   = (indexStyle.getPropertyValue('--toc-rule-x')     || '.95rem').trim();
    const ruleTopToken = (indexStyle.getPropertyValue('--toc-rule-top')   || '.3rem').trim();
    const ruleBottomToken = (indexStyle.getPropertyValue('--toc-rule-bottom') || '2.9rem').trim();

    const ruleXPx      = pxFromCssLength(tocIndex, ruleXToken);
    const ruleTopPx    = pxFromCssLength(tocIndex, ruleTopToken);
    const ruleBottomPx = pxFromCssLength(tocIndex, ruleBottomToken);
    const totalH       = tocIndex.offsetHeight;
    const maxH         = Math.max(0, totalH - ruleTopPx - ruleBottomPx);

    // Read --toc-gate-y as set by toc.js (getBoundingClientRect-based, viewport-relative).
    // For decorations (sealed spine, gate line) we only need approximate placement;
    // we convert it to an offset-relative value by adding the panel body scroll offset.
    const gateEl   = $('.toc-gate', tocIndex);
    const hasLocked = !!$('.toc-item--locked', tocIndex);

    const sealedSpine = ensureSealedSpineEl(tocIndex);
    const gateLine    = ensureGateEmphasisEl(tocIndex);
    const gateSigil   = ensureGateSigilEl(tocIndex);

    if(gateEl && hasLocked){
      // Use offsetTop for decorations — scroll-stable.
      const gateOffsetTop = gateEl.offsetTop;
      const gateY = gateOffsetTop + (gateEl.offsetHeight / 2);
      const clampedGateY = Math.max(ruleTopPx, Math.min(gateY, ruleTopPx + maxH));

      const sealedTop = clampedGateY;
      const sealedH   = Math.max(0, (ruleTopPx + maxH) - sealedTop);

      sealedSpine.style.left      = `${ruleXPx}px`;
      sealedSpine.style.top       = `${sealedTop}px`;
      sealedSpine.style.height    = `${sealedH}px`;
      sealedSpine.style.transform = 'translateX(-1px)';
      sealedSpine.style.opacity   = (sealedH > 8) ? '1' : '0';

      gateLine.style.left    = `${ruleXPx}px`;
      gateLine.style.top     = `${Math.max(ruleTopPx, clampedGateY - 1)}px`;
      gateLine.style.right   = '0.2rem';
      gateLine.style.opacity = '1';

      gateSigil.style.left      = `${ruleXPx}px`;
      gateSigil.style.top       = `${clampedGateY}px`;
      gateSigil.style.transform = 'translate(-50%, -50%)';
      gateSigil.style.opacity   = '1';
    } else {
      sealedSpine.style.opacity = '0';
      gateLine.style.opacity    = '0';
      gateSigil.style.opacity   = '0';
    }
  }

  function schedule(){
    window.requestAnimationFrame(() => { computeDecorations(); });
  }

  function boot(){
    const dyn = document.getElementById('tocDynamicContent');
    if(dyn){
      const obs = new MutationObserver(schedule);
      obs.observe(dyn, { childList:true, subtree:true });
    }
    const html = document.documentElement;
    const htmlObs = new MutationObserver(() => {
      if(html.classList.contains('toc-open') || html.classList.contains('toc-opening')) schedule();
    });
    htmlObs.observe(html, { attributes:true, attributeFilter:['class'] });
    window.addEventListener('resize', () => {
      if(html.classList.contains('toc-open')) schedule();
    }, { passive:true });
    if(window.visualViewport){
      window.visualViewport.addEventListener('resize', () => {
        if(html.classList.contains('toc-open')) schedule();
      }, { passive:true });
    }
    const body = document.querySelector('.toc-panel-body');
    if(body){
      body.addEventListener('scroll', () => { schedule(); }, { passive:true });
    }
    schedule();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
