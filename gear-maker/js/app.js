"use strict";
/* Gear Maker — start-up and the render loop. */
(function(){
const U = GW.U, $ = U.el;

GW.Scene.init($('stage'));
GW.UI.init();
$('openFile').onchange = e => { if(e.target.files[0]) GW.UI.loadProject(e.target.files[0]); e.target.value = ''; };

/* the legend of mouse controls fades once you have used the view */
let legendGone = false;
$('stage').addEventListener('pointerdown', () => { if(!legendGone){ legendGone = true; setTimeout(() => $('legend').classList.add('gone'), 2500); } }, { once: true });

GW.Labels.init($('stage'));
GW.UI.startPair(true);
GW.Scene.fit(true);
GW.History.reset();
/* the first fit ran before the page had finished laying out: fit again once it has, until the person moves the camera */
let moved = false;
$('stage').addEventListener('pointerdown', () => { moved = true; }, { once: true });
$('stage').addEventListener('wheel', () => { moved = true; }, { once: true, passive: true });
[150, 600, 1400].forEach(ms => setTimeout(() => { if(!moved) GW.Scene.fit(true); }, ms));
window.addEventListener('resize', () => { if(!moved) GW.Scene.fit(true); });

let last = performance.now(), seen = -1, readT = 0;
(function loop(now){
  requestAnimationFrame(loop);
  if(document.hidden) return;
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  GW.Anim.update(now);
  GW.Layout.update(dt);
  if(GW.Gears.version !== seen){ seen = GW.Gears.version; GW.Drives.sync(); GW.UI.mark({ fb: 1, sync: 1 }); }
  GW.Drives.update();
  GW.UI.tick();
  const sel = GW.UI.sel(), hg = GW.Scene._helperGroup;
  if(sel && hg){ hg.position.copy(sel.mesh.position); hg.quaternion.copy(sel.rt.quat); }
  if(sel && sel.parentId && now - readT > 400){ readT = now; GW.UI.updateSpeedReadout(sel); }
  GW.Scene.followInset();
  GW.Scene.render(now);
})(last);

/* Dev tool: press the backtick key (`) to open the automatic tester (devtest.js, loaded on first use).
   ?dev=quick | standard | thorough | problems | free opens it and starts that run by itself. */
(() => {
  let loading = false;
  const load = then => {
    if (window.GWDev) return then(window.GWDev);
    if (loading) return; loading = true;
    const sc = document.createElement('script'); sc.src = 'devtest.js?v=1';
    sc.onload = () => { loading = false; window.GWDev && then(window.GWDev); };
    sc.onerror = () => { loading = false; GW.UI.toast('Could not load the dev tool (devtest.js)'); };
    document.head.appendChild(sc);
  };
  addEventListener('keydown', e => {
    if (e.key !== '`' || !e.isTrusted || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target; if (t && (t.tagName === 'TEXTAREA' || t.isContentEditable || (t.tagName === 'INPUT' && /^(text|number|search|email|url|tel|password)$/.test(t.type)))) return;
    e.preventDefault(); e.stopPropagation(); load(d => d.toggle());
  }, true);
  const auto = /[?&]dev=(quick|standard|thorough|problems|free)\b/.exec(location.search);
  if (auto) setTimeout(() => load(d => { d.toggle(true); const m = document.getElementById('dtMode'); if (m) m.value = auto[1]; const go = document.querySelector('#gwdev [data-a=start]'); if (go) go.click(); }), 2500);
})();

window.GW = GW;
})();
