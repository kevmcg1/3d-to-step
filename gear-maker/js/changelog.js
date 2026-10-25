// The version chip under the logo, and the What's new list it opens (from js/version.js).
(function(){
  const V = window.__GM; if(!V) return;
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const chip = document.getElementById('verChip');
  if(chip){
    chip.textContent = 'v' + V.version + ' · What’s new';
    chip.title = 'Version ' + V.version + ' and the changelog';
    chip.addEventListener('click', () => {
      const UI = window.GW && GW.UI; if(!UI) return;
      UI.openModal('<div class="mhead"><h3>What’s new</h3><button class="iconbtn" id="mClose" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
        '<div class="mbody cl"><p class="cl-sub">Gear Maker · version ' + esc(V.version) + ' · alpha testing</p>' +
        V.changelog.map((e, i) => '<h4>v' + esc(e.v) + (e.date ? ' <small>' + esc(e.date) + '</small>' : '') + (i === 0 ? ' <em>current</em>' : '') + '</h4><p class="cl-t">' + esc(e.title) + '</p><ul>' + e.items.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>').join('') + '</div>');
      document.getElementById('mClose').onclick = UI.closeModal;
    });
  }
})();
