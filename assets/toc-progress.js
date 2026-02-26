/* Covenant ToC Progress Enhancer (v2)
   - Draws a vertical progress fill inside the ToC track.
   - Adds a sealed-region spine (dashed) beneath the gate to emphasize locked territory.
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

  function ensureFillEl(tocIndex){
    const fill = ensureEl(tocIndex, 'toc-progress-fill');

    fill.style.width = '2px';
    fill.style.borderRadius = '999px';
    fill.style.opacity = '0';
    fill.style.transition = 'height 260ms ease, opacity 180ms ease';
    fill.style.background = 'linear-gradient(to bottom, rgba(201,169,97,0) 0%, rgba(201,169,97,.82) 14%, rgba(201,169,97,.62) 72%, rgba(201,169,97,0) 100%)';
    fill.style.boxShadow = '0 0 12px rgba(201,169,97,.12)';

    return fill;
  }

  function ensureSealedSpineEl(tocIndex){
    const spine = ensureEl(tocIndex, 'toc-sealed-spine');

    spine.style.width = '2px';
    spine.style.borderRadius = '999px';
    spine.style.opacity = '0';
    spine.style.transition = 'height 240ms ease, opacity 180ms ease';

    spine.style.background = 'repeating-linear-gradient(to bottom,
      rgba(44,62,80,.00) 0px,
      rgba(44,62,80,.00) 5px,
      rgba(44,62,80,.26) 5px,
      rgba(44,62,80,.26) 10px)';

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

    gate.style.background = 'linear-gradient(to right,
      rgba(139,0,0,1) 0%,
      rgba(139,0,0,.40) 40%,
      rgba(139,0,0,.00) 100%)';

    return gate;
  }

  function ensureGateSigilEl(tocIndex){
    const sigil = ensureEl(tocIndex, 'toc-gate-sigil');

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

    sigil.style.textShadow = '0 1px 0 rgba(255,255,255,.22), 0 10px 16px rgba(0,0,0,.08)';

    sigil.textContent = '✦';

    return sigil;
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

    const maxH = Math.max(0, indexRect.height - ruleTopPx - ruleBottomPx);

    const nodeCenterY = anchorRect.top + padTopPx + (lineHeightPx / 2);
    let h = nodeCenterY - (indexRect.top + ruleTopPx);
    h = Math.max(0, Math.min(h, maxH));

    // Fill (unlocked progress).
    const fill = ensureFillEl(tocIndex);
    fill.style.left = `${ruleXPx}px`;
    fill.style.top = `${ruleTopPx}px`;
    fill.style.height = `${h}px`;
    fill.style.transform = 'translateX(-1px)';
    fill.style.opacity = (h > 0) ? '1' : '0';

    // Gate + sealed region emphasis (if gate exists).
    const gateEl = $('.toc-gate', tocIndex);
    const hasLocked = !!$('.toc-item--locked', tocIndex);

    const sealedSpine = ensureSealedSpineEl(tocIndex);
    const gateLine = ensureGateEmphasisEl(tocIndex);
    const gateSigil = ensureGateSigilEl(tocIndex);

    if(gateEl && hasLocked){
      const gateRect = gateEl.getBoundingClientRect();
      let gateY = (gateRect.top + (gateRect.height / 2)) - indexRect.top;

      // Clamp gate to within track bounds.
      gateY = Math.max(ruleTopPx, Math.min(gateY, ruleTopPx + maxH));

      const sealedTop = gateY;
      const sealedH = Math.max(0, (ruleTopPx + maxH) - sealedTop);

      sealedSpine.style.left = `${ruleXPx}px`;
      sealedSpine.style.top = `${sealedTop}px`;
      sealedSpine.style.height = `${sealedH}px`;
      sealedSpine.style.transform = 'translateX(-1px)';
      sealedSpine.style.opacity = (sealedH > 8) ? '1' : '0';

      gateLine.style.left = `${ruleXPx}px`;
      gateLine.style.top = `${Math.max(ruleTopPx, gateY - 1)}px`;
      gateLine.style.right = '0.2rem';
      gateLine.style.opacity = '1';

      gateSigil.style.left = `${ruleXPx}px`;
      gateSigil.style.top = `${gateY}px`;
      gateSigil.style.transform = 'translate(-50%, -50%)';
      gateSigil.style.opacity = '1';
    }else{
      sealedSpine.style.opacity = '0';
      gateLine.style.opacity = '0';
      gateSigil.style.opacity = '0';
    }
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
