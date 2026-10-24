"use strict";
/* Gearworks — start-up and the render loop. */
(function(){
const U = GW.U, $ = U.el;

GW.Scene.init($('stage'));
GW.UI.init();
$('openFile').onchange = e => { if(e.target.files[0]) GW.UI.loadProject(e.target.files[0]); e.target.value = ''; };

/* the legend of mouse controls fades once you have used the view */
let legendGone = false;
$('stage').addEventListener('pointerdown', () => { if(!legendGone){ legendGone = true; setTimeout(() => $('legend').classList.add('gone'), 2500); } }, { once: true });

GW.UI.startPair(true);
GW.Scene.fit(true);

let last = performance.now(), seen = -1, readT = 0;
(function loop(now){
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  GW.Anim.update(now);
  GW.Layout.update(dt);
  if(GW.Gears.version !== seen){ seen = GW.Gears.version; GW.Drives.sync(); GW.UI.mark({ fb: 1, sync: 1 }); }
  GW.Drives.update();
  GW.UI.tick();
  const sel = GW.UI.sel(), hg = GW.Scene._helperGroup;
  if(sel && hg){ hg.position.copy(sel.mesh.position); hg.quaternion.copy(sel.rt.quat); }
  if(sel && sel.parentId && now - readT > 400){ readT = now; GW.UI.updateSpeedReadout(sel); }
  GW.Scene.render();
})(last);

window.GW = GW;
})();
