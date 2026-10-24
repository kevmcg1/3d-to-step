"use strict";
/* Gearworks — turns a triangle mesh into a boundary representation that CAD kernels accept.
   1. weld the corners into shared vertices
   2. split the mesh into closed shells (a gear with a hub is a few overlapping solids)
   3. merge neighbouring coplanar triangles into single polygon faces (with holes)
   The STEP writer then emits one planar ADVANCED_FACE per polygon. */
(function(){

const Q = 1e4;                      // weld to 0.1 micron

GW.Brep = {
  weld(pos){
    const map = new Map(), vx = [], tris = [];
    const id = (x, y, z) => {
      const k = Math.round(x * Q) + ',' + Math.round(y * Q) + ',' + Math.round(z * Q);
      let i = map.get(k);
      if(i === undefined){ i = vx.length / 3; map.set(k, i); vx.push(Math.round(x * Q) / Q, Math.round(y * Q) / Q, Math.round(z * Q) / Q); }
      return i;
    };
    for(let i = 0; i < pos.length; i += 9){
      const a = id(pos[i], pos[i+1], pos[i+2]), b = id(pos[i+3], pos[i+4], pos[i+5]), c = id(pos[i+6], pos[i+7], pos[i+8]);
      if(a === b || b === c || a === c) continue;
      tris.push(a, b, c);
    }
    return { V: Float64Array.from(vx), T: Int32Array.from(tris) };
  },

  /* returns [{ V, faces:[{n:[x,y,z], p:[x,y,z], loops:[[v,...],...]}] }] — one entry per closed shell */
  build(pos){
    const { V, T } = GW.Brep.weld(pos);
    const nT = T.length / 3, nV = V.length / 3;
    const ek = (a, b) => a < b ? a * nV + b : b * nV + a;

    /* triangle normals */
    const N = new Float64Array(nT * 3), area = new Float64Array(nT);
    for(let t = 0; t < nT; t++){
      const a = T[t*3], b = T[t*3+1], c = T[t*3+2];
      const ux = V[b*3]-V[a*3], uy = V[b*3+1]-V[a*3+1], uz = V[b*3+2]-V[a*3+2];
      const vx = V[c*3]-V[a*3], vy = V[c*3+1]-V[a*3+1], vz = V[c*3+2]-V[a*3+2];
      const nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx, l = Math.hypot(nx, ny, nz);
      area[t] = l / 2;
      if(l > 0){ N[t*3] = nx/l; N[t*3+1] = ny/l; N[t*3+2] = nz/l; }
    }

    /* edge -> triangles */
    const edges = new Map();
    for(let t = 0; t < nT; t++) for(let e = 0; e < 3; e++){
      const a = T[t*3+e], b = T[t*3+(e+1)%3], k = ek(a, b);
      let l = edges.get(k); if(!l){ l = []; edges.set(k, l); }
      l.push(t);
    }

    /* union-find */
    const parent = new Int32Array(nT).map((_, i) => i);
    const find = x => { while(parent[x] !== x){ parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const union = (a, b) => { a = find(a); b = find(b); if(a !== b) parent[a] = b; };
    const parentShell = new Int32Array(nT).map((_, i) => i);
    const findS = x => { while(parentShell[x] !== x){ parentShell[x] = parentShell[parentShell[x]]; x = parentShell[x]; } return x; };
    const unionS = (a, b) => { a = findS(a); b = findS(b); if(a !== b) parentShell[a] = b; };

    const D = 1e-9;      // area below which a triangle has no usable normal (a sliver)
    const planeOff = new Float64Array(nT);
    for(let t = 0; t < nT; t++) planeOff[t] = N[t*3]*V[T[t*3]*3] + N[t*3+1]*V[T[t*3]*3+1] + N[t*3+2]*V[T[t*3]*3+2];
    const slivers = [];
    edges.forEach(l => {
      if(l.length !== 2) return;                          // only clean 2-triangle edges join shells and faces
      const [s, t] = l;
      unionS(s, t);
      const ds = area[s] < D, dt = area[t] < D;
      if(ds || dt){ if(ds) slivers.push([s, t]); if(dt) slivers.push([t, s]); return; }
      const dot = N[s*3]*N[t*3] + N[s*3+1]*N[t*3+1] + N[s*3+2]*N[t*3+2];
      if(dot > 1 - 1e-10 && Math.abs(planeOff[s] - planeOff[t]) < 3e-4) union(s, t);
    });
    // a sliver takes the face of the neighbour it shares an edge with
    const done = new Uint8Array(nT);
    slivers.forEach(([s, t]) => { if(!done[s] && area[t] >= D){ done[s] = 1; union(s, t); } });

    /* faces: group triangles, find boundary loops */
    const groups = new Map();
    for(let t = 0; t < nT; t++){ const r = find(t); let g = groups.get(r); if(!g){ g = []; groups.set(r, g); } g.push(t); }
    const shells = new Map();
    const out = [];
    groups.forEach(tris => {
      const inGroup = new Set(tris);
      const first = tris.find(t => area[t] >= D);
      if(first === undefined) return;
      const n = [N[first*3], N[first*3+1], N[first*3+2]];
      const p = [V[T[first*3]*3], V[T[first*3]*3+1], V[T[first*3]*3+2]];
      // boundary directed edges
      const next = new Map();
      let nb = 0;
      tris.forEach(t => {
        for(let e = 0; e < 3; e++){
          const a = T[t*3+e], b = T[t*3+(e+1)%3];
          const l = edges.get(ek(a, b));
          let internal = false;
          if(l.length === 2){ const o = l[0] === t ? l[1] : l[0]; if(inGroup.has(o)) internal = true; }
          if(!internal){ let q = next.get(a); if(!q){ q = []; next.set(a, q); } q.push(b); nb++; }
        }
      });
      const loops = [];
      let guard = 0;
      while(next.size && guard++ < 1e7){
        const a0 = next.keys().next().value;
        const loop = [a0];
        let a = a0, ok = true;
        for(let s = 0; s < nb + 2; s++){
          const q = next.get(a);
          if(!q){ ok = false; break; }
          const b = q.pop(); if(!q.length) next.delete(a);
          if(b === a0) break;
          loop.push(b); a = b;
        }
        if(!ok || loop.length < 3) { loops.length = 0; loops.failed = true; break; }
        loops.push(loop);
      }
      if(loops.failed) return;                       // leave this region out; counted below
      // outer loop = positive area about the face normal
      const ax = Math.abs(n[0]) > Math.abs(n[1]) && Math.abs(n[0]) > Math.abs(n[2]) ? 0 : (Math.abs(n[1]) > Math.abs(n[2]) ? 1 : 2);
      const ia = (ax + 1) % 3, ib = (ax + 2) % 3;
      const signed = loop => { let s = 0; for(let i = 0; i < loop.length; i++){ const u = loop[i], v = loop[(i+1)%loop.length]; s += V[u*3+ia]*V[v*3+ib] - V[v*3+ia]*V[u*3+ib]; } return (n[ax] >= 0 ? 1 : -1) * s / 2; };
      const withA = loops.map(l => ({ l, a: signed(l) }));
      const outers = withA.filter(x => x.a > 0), holes = withA.filter(x => x.a <= 0);
      const inside = (pt, loop) => {
        let c = false;
        for(let i = 0, j = loop.length - 1; i < loop.length; j = i++){
          const xi = V[loop[i]*3+ia], yi = V[loop[i]*3+ib], xj = V[loop[j]*3+ia], yj = V[loop[j]*3+ib];
          if(((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) c = !c;
        }
        return c;
      };
      outers.sort((u, v) => v.a - u.a);
      const faces = outers.map(o => ({ n, p, loops: [o.l], t0: first }));
      holes.forEach(h => {
        const pt = [V[h.l[0]*3+ia], V[h.l[0]*3+ib]];
        const owner = faces.slice().reverse().find(f => inside(pt, f.loops[0])) || faces[0];
        if(owner) owner.loops.push(h.l);
      });
      faces.forEach(f => { const s = findS(first); let sh = shells.get(s); if(!sh){ sh = { V, faces: [] }; shells.set(s, sh); out.push(sh); } sh.faces.push(f); });
    });
    return out;
  }
};
})();
