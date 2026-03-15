/* Covenant ToC Progress Enhancer (v3.3)
   The gold binding fill is now handled entirely by CSS (toc.css ::after on .toc-index),
   driven by the --toc-gate-y CSS variable set by toc.js updateGateBindingStop().
   This script handles only the supplementary decorations:
     - .toc-bound-fill   : solid gold fill above the gate
     - .toc-sealed-spine : dark dashed track below the gate
     - .toc-gate-emphasis: gate horizontal line
     - .toc-gate-sigil   : gate sigil marker
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

  function ensureBoundFillEl(tocIndex){
    const fill = ensureEl(tocIndex, 'toc-bound-fill');
    fill.style.width = '2px';
    fill.style.borderRadius = '999px';
    fill.style.opacity = '0';
    fill.style.transition = 'height 240ms ease, opacity 180ms ease';
    // Solid gold fill: fades in at top, solid through body, fades out at bottom
    fill.style.background = 'linear-gradient(to bottom,\n      transparent 0%,\n      rgba(201,169,97,.82) 10%,\n      rgba(201,169,97,.72) 90%,\n      transparent 100%)';
    fill.style.boxShadow = '0 0 4px rgba(201,169,97,.32), 0 0 0 1px rgba(201,169,97,.14)';
    fill.style.borderBottom = '1px solid rgba(0,0,0,.82)';
    return fill;
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
    gate.style.boxShadow = 'none';
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
    const ruleXToken      = (indexStyle.getPropertyValue('--toc-rule-x')      || '.95rem').trim();
    const ruleTopToken    = (indexStyle.getPropertyValue('--toc-rule-top')    || '.3rem').trim();
    const ruleBottomToken = (indexStyle.getPropertyValue('--toc-rule-bottom') || '2.9rem').trim();

    const ruleXPx      = pxFromCssLength(tocIndex, ruleXToken);
    const ruleTopPx    = pxFromCssLength(tocIndex, ruleTopToken);
    const ruleBottomPx = pxFromCssLength(tocIndex, ruleBottomToken);
    const totalH       = tocIndex.offsetHeight;
    const maxH         = Math.max(0, totalH - ruleTopPx - ruleBottomPx);

    // --toc-last-node-offset: px from bottom of .toc-list to last node centre.
    // Subtracting it from maxH aligns both spine elements with .toc-list::before.
    const lastNodeOffsetToken = (indexStyle.getPropertyValue('--toc-last-node-offset') || '0px').trim();
    const lastNodeOffsetPx    = pxFromCssLength(tocIndex, lastNodeOffsetToken);
    const adjustedMaxH        = Math.max(0, maxH - lastNodeOffsetPx);

    const gateEl    = $('.toc-gate', tocIndex);
    const hasLocked = !!$('.toc-item--locked', tocIndex);

    const boundFill   = ensureBoundFillEl(tocIndex);
    const sealedSpine = ensureSealedSpineEl(tocIndex);
    const gateLine    = ensureGateEmphasisEl(tocIndex);
    const gateSigil   = ensureGateSigilEl(tocIndex);

    if(gateEl && hasLocked){
      const gateOffsetTop = gateEl.offsetTop;
      const gateY         = gateOffsetTop + (gateEl.offsetHeight / 2);
      const clampedGateY  = Math.max(ruleTopPx, Math.min(gateY, ruleTopPx + adjustedMaxH));

      // --- Solid gold fill: list top → gate centre ---
      const fillTop = ruleTopPx;
      const fillH   = Math.max(0, clampedGateY - fillTop);

      boundFill.style.left      = `${ruleXPx}px`;
      boundFill.style.top       = `${fillTop}px`;
      boundFill.style.height    = `${fillH}px`;
      boundFill.style.transform = 'translateX(-1px)';
      boundFill.style.opacity   = (fillH > 8) ? '1' : '0';

      // --- Dark dashed void: gate centre → last node ---
      const sealedTop = clampedGateY;
      const sealedH   = Math.max(0, (ruleTopPx + adjustedMaxH) - sealedTop);

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
      // No gate / no locked nodes — full solid gold fill, hide sealed spine
      const fillH = Math.max(0, adjustedMaxH);
      boundFill.style.left      = `${ruleXPx}px`;
      boundFill.style.top       = `${ruleTopPx}px`;
      boundFill.style.height    = `${fillH}px`;
      boundFill.style.transform = 'translateX(-1px)';
      boundFill.style.opacity   = (fillH > 8) ? '1' : '0';

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
