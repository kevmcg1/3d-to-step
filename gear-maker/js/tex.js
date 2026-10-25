"use strict";
/* Gear Maker — surface textures: machined (turned) metal, brushed aluminum, and the layer lines of a 3D print.
   Small procedural bump + roughness maps, made once and shared. The meshes carry simple planar UVs so the
   marks line up the way the real process leaves them. Nothing here is loaded from the network. */
(function(){
const T = THREE;
const Tex = GW.Tex = {
  SURFACES: { smooth: 'Smooth', turned: 'Machined (turned)', brushed: 'Machined (brushed)', layers: '3D printed (layer lines)' },
  _maps: {},
  ok: () => typeof document !== 'undefined' && !!document.createElement,

  /* a 128 x 128 height map: grooves run along the rows (turned, layers) or down the columns (brushed) */
  maps(kind){
    if(Tex._maps[kind] || !Tex.ok()) return Tex._maps[kind] || null;
    const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d'), im = x.createImageData(N, N);
    const c2 = document.createElement('canvas'); c2.width = c2.height = N;
    const x2 = c2.getContext('2d'), im2 = x2.createImageData(N, N);        // roughness: mostly 1, a little lower in the grooves' lows
    let seed = kind === 'layers' ? 5 : kind === 'brushed' ? 9 : 3;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const rowN = Array.from({ length: N }, () => rnd()), colN = Array.from({ length: N }, () => rnd());
    for(let j = 0; j < N; j++) for(let i = 0; i < N; i++){
      let h;
      if(kind === 'layers'){ const t = (j % 8) / 8; h = 0.5 + 0.5 * Math.sin(t * Math.PI) * (0.9 + 0.1 * rowN[j]) - 0.12 * Math.abs(Math.sin(i * 0.19 + j * 0.05)) * rnd(); }
      else if(kind === 'brushed'){ h = 0.5 + 0.28 * (colN[i] - 0.5) * 2 + 0.12 * (rnd() - 0.5) + 0.1 * Math.sin(i * 1.7 + colN[(i * 7) % N] * 6); }
      else { h = 0.5 + 0.3 * (rowN[j] - 0.5) * 2 + 0.2 * Math.sin(j * 1.3) + 0.06 * (rnd() - 0.5); }     // turned: fine grooves
      h = Math.max(0, Math.min(1, h));
      const v = Math.round(h * 255), k = (j * N + i) * 4; im.data[k] = im.data[k + 1] = im.data[k + 2] = v; im.data[k + 3] = 255;
      const rv = Math.round(205 + 50 * h); im2.data[k] = im2.data[k + 1] = im2.data[k + 2] = rv; im2.data[k + 3] = 255;
    }
    x.putImageData(im, 0, 0); x2.putImageData(im2, 0, 0);
    const bump = new T.CanvasTexture(c); bump.wrapS = bump.wrapT = T.RepeatWrapping; bump.anisotropy = 2;
    const rough = new T.CanvasTexture(c2); rough.wrapS = rough.wrapT = T.RepeatWrapping; rough.anisotropy = 2;
    return (Tex._maps[kind] = { bump, rough, scale: kind === 'layers' ? 1.2 : kind === 'brushed' ? 0.22 : 0.3 });
  },

  /* planar UVs that make the marks run the way the process leaves them */
  uv(geo, kind){
    const pos = geo.attributes.position; if(!pos) return;
    const n = pos.count, uv = new Float32Array(n * 2);
    for(let i = 0; i < n; i++){
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      let u, v;
      if(kind === 'layers'){ u = (x + y) * 0.07; v = z / 3.2; }                     // one ridge per 0.2 mm layer
      else if(kind === 'brushed'){ u = x * 0.9 + z * 0.4; v = y * 0.045; }          // fine parallel streaks
      else { u = (x * 0.13 + y * 0.07 + z * 0.11); v = Math.hypot(x, y) / 3; }      // concentric tool marks
      uv[i * 2] = u; uv[i * 2 + 1] = v;
    }
    geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
    geo._uvKind = kind;
  },

  /* put the chosen surface on a gear's material (and give its mesh the UVs it needs) */
  apply(g, geo, mat){
    const kind = g.surface && Tex.SURFACES[g.surface] && g.surface !== 'smooth' ? g.surface : null;
    mat = mat || g.mesh.material; geo = geo || g.mesh.geometry;
    if(!kind || !Tex.ok()){
      if(!kind && (mat.bumpMap || mat.roughnessMap)){ mat.bumpMap = null; mat.roughnessMap = null; mat.needsUpdate = true; }
      return;
    }
    const m = Tex.maps(kind); if(!m) return;
    if(geo._uvKind !== kind) Tex.uv(geo, kind);
    if(mat.bumpMap !== m.bump){ mat.bumpMap = m.bump; mat.roughnessMap = m.rough; mat.needsUpdate = true; }
    mat.bumpScale = m.scale;
  }
};
})();
