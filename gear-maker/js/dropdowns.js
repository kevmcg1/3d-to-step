// Smooth dropdowns, the same as the Shop Tool Sim's: each select in the sidebars and dialogs gets a button that opens an animated list. The real
// select stays underneath (hidden), so the app keeps reading its value and hearing its change events. Selects that appear later (the properties
// panel is rebuilt for every gear) are picked up as they are added.
(function(){
  let open = null;
  const closeOpen = () => { if(open) open.close(); };
  const dv = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  const di = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
  const SCOPE = '#left, #right, #modal, #bp';
  function enhance(sel){
    if(sel._dd || sel.closest('.vp') || !sel.closest(SCOPE) || sel.multiple) return;
    sel._dd = true;
    const box = document.createElement('div'); box.className = 'dd';
    sel.parentNode.insertBefore(box, sel); box.appendChild(sel);
    sel.classList.add('dd-native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'dd-btn';
    btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
    const lab = (sel.id && document.querySelector('label[for="' + sel.id + '"]')) || null;
    btn.setAttribute('aria-label', sel.getAttribute('aria-label') || (lab ? lab.textContent.trim() : 'Choose'));
    btn.innerHTML = '<span class="dd-t"></span><i class="dd-chev" aria-hidden="true"></i>';
    const list = document.createElement('div'); list.className = 'dd-list'; list.setAttribute('role', 'listbox');
    box.append(btn, list);
    let active = -1;
    const label = () => { const o = sel.options[di.get.call(sel)]; btn.querySelector('.dd-t').textContent = o ? o.textContent : ''; btn.disabled = sel.disabled; };
    const setActive = i => { active = i; [...list.children].forEach((c, k) => c.classList.toggle('on', k === i)); const c = list.children[i]; if(c) c.scrollIntoView({ block: 'nearest' }); };
    const pick = i => {
      const o = sel.options[i];
      if(o && !o.disabled){
        const changed = di.get.call(sel) !== i;
        di.set.call(sel, i); label();
        if(changed){ sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); }
      }
      api.close(); btn.focus({ preventScroll: true });
    };
    const build = () => {
      list.innerHTML = '';
      let group = '';
      [...sel.options].forEach((o, i) => {
        const g = o.parentNode && o.parentNode.tagName === 'OPTGROUP' ? o.parentNode.label : '';
        if(g !== group){ group = g; if(g){ const h = document.createElement('div'); h.className = 'dd-grp'; h.textContent = g; list.appendChild(h); } }
        const it = document.createElement('div'); it.className = 'dd-opt'; it.setAttribute('role', 'option'); it.textContent = o.textContent; it.dataset.i = i;
        it.setAttribute('aria-selected', String(i === di.get.call(sel)));
        if(o.disabled) it.setAttribute('aria-disabled', 'true');
        it.addEventListener('click', () => pick(i));
        it.addEventListener('mousemove', () => { if(active !== i) setActive(i); });
        list.appendChild(it);
      });
    };
    const optAt = i => [...list.querySelectorAll('.dd-opt')].findIndex(x => +x.dataset.i === i);
    const api = {
      open(){
        closeOpen(); build();
        const r = btn.getBoundingClientRect(), below = innerHeight - r.bottom, need = Math.min(260, list.scrollHeight + 8);
        box.classList.toggle('up', below < need && r.top > below);
        box.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); open = api;
        setActive(optAt(di.get.call(sel)));
      },
      close(){ box.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); if(open === api) open = null; }
    };
    btn.addEventListener('click', () => box.classList.contains('open') ? api.close() : api.open());
    btn.addEventListener('keydown', e => {
      const isOpen = box.classList.contains('open'), n = list.querySelectorAll('.dd-opt').length;
      const idx = () => +list.querySelectorAll('.dd-opt')[active].dataset.i;
      if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
        e.preventDefault(); e.stopPropagation();
        if(!isOpen){ api.open(); return; }
        setActive(Math.max(0, Math.min(n - 1, active + (e.key === 'ArrowDown' ? 1 : -1))));
      } else if((e.key === 'Enter' || e.key === ' ') && isOpen){ e.preventDefault(); e.stopPropagation(); pick(idx()); }
      else if(e.key === 'Escape' && isOpen){ e.preventDefault(); e.stopPropagation(); api.close(); }
      else if(e.key === 'Home' && isOpen){ e.preventDefault(); setActive(0); }
      else if(e.key === 'End' && isOpen){ e.preventDefault(); setActive(n - 1); }
      else if(e.key === 'Tab') api.close();
    });
    Object.defineProperty(sel, 'value', { configurable: true, get(){ return dv.get.call(this); }, set(v){ dv.set.call(this, v); label(); } });
    Object.defineProperty(sel, 'selectedIndex', { configurable: true, get(){ return di.get.call(this); }, set(v){ di.set.call(this, v); label(); } });
    sel.addEventListener('change', label);
    new MutationObserver(label).observe(sel, { childList: true, subtree: true, attributes: true, characterData: true });
    label();
  }
  const scan = root => { if(root.nodeType !== 1) return; if(root.matches('select')) enhance(root); root.querySelectorAll && root.querySelectorAll('select').forEach(enhance); };
  scan(document.body);
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(scan))).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('pointerdown', e => { if(open && !e.target.closest('.dd.open')) open.close(); }, true);
  window.addEventListener('blur', closeOpen); window.addEventListener('resize', closeOpen);
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && open){ open.close(); } }, true);
})();
