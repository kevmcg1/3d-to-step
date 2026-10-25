"use strict";
/* Gear Maker — STL / OBJ / STEP export and a tiny ZIP writer.
   Everything works on plain "solids": { name, pos: Float32Array of triangle corners (x,y,z...) }.
   Units are millimeters, +Z is up (so STL/OBJ/STEP open the right way round in CAD and slicers). */
(function(){
const U = GW.U, T = THREE;

/* ------------------------------------------------------------------ zip */
const crcTable = (() => {
  const t = new Uint32Array(256);
  for(let n = 0; n < 256; n++){ let c = n; for(let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = data => { let c = 0xFFFFFFFF; for(let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

GW.Zip = {
  crc32,
  /* files: [{name, data: Uint8Array}] -> Uint8Array (stored, no compression) */
  make(files){
    const enc = new TextEncoder(), chunks = [], central = [];
    let offset = 0;
    const u16 = v => [v & 255, (v >> 8) & 255], u32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    files.forEach(f => {
      const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      const local = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0)]);
      chunks.push(local, name, f.data);
      central.push({ name, crc, size, offset });
      offset += local.length + name.length + size;
    });
    const cdStart = offset;
    central.forEach(c => {
      const h = new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c.crc), ...u32(c.size), ...u32(c.size),
        ...u16(c.name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(c.offset)]);
      chunks.push(h, c.name); offset += h.length + c.name.length;
    });
    const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length), ...u32(offset - cdStart), ...u32(cdStart), ...u16(0)]);
    chunks.push(end);
    const total = chunks.reduce((s, c) => s + c.length, 0), out = new Uint8Array(total);
    let o = 0; chunks.forEach(c => { out.set(c, o); o += c.length; });
    return out;
  }
};

/* ------------------------------------------------------------------ collecting solids */
const Export = GW.Export = {

  /* triangles of a mesh in world space (pose 'world') or its own frame (pose 'local') */
  bake(mesh, matrix){
    const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const src = geo.attributes.position.array, out = new Float32Array(src.length), v = new T.Vector3();
    for(let i = 0; i < src.length; i += 3){
      v.set(src[i], src[i + 1], src[i + 2]).applyMatrix4(matrix);
      out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z;
    }
    return out;
  },
  /* an InstancedMesh -> one triangle list */
  bakeInstanced(im, extra){
    const geo = im.geometry.index ? im.geometry.toNonIndexed() : im.geometry;
    const src = geo.attributes.position.array, parts = [], m = new T.Matrix4(), v = new T.Vector3();
    im.updateMatrixWorld(true);
    for(let k = 0; k < im.count; k++){
      im.getMatrixAt(k, m); m.premultiply(im.matrixWorld);
      const out = new Float32Array(src.length);
      for(let i = 0; i < src.length; i += 3){ v.set(src[i], src[i + 1], src[i + 2]).applyMatrix4(m); out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z; }
      parts.push(out);
    }
    const total = parts.reduce((s, p) => s + p.length, 0), all = new Float32Array(total);
    let o = 0; parts.forEach(p => { all.set(p, o); o += p.length; });
    return all;
  },

  /* which gears does a scope cover? */
  gearsFor(scope, selId){
    const G = GW.Gears, sel = G.get(selId);
    if(scope === 'all' || !sel) return G.list.slice();
    if(scope === 'selected') return [sel];
    // 'assembly': everything connected to the selected gear
    const root = G.rootOf(sel);
    return [root].concat(G.descendants(root.id));
  },

  /* scope: 'selected' | 'assembly' | 'all'     pose: 'world' | 'flat' */
  collect(scope, pose, selId, includeDrives){
    const gears = Export.gearsFor(scope, selId).filter(g => g.mesh.visible !== false || true);
    const solids = [];
    if(pose === 'world'){
      gears.forEach(g => { g.mesh.updateMatrixWorld(true); solids.push({ name: Export.safe(g.name), pos: Export.bake(g.mesh, g.mesh.matrixWorld), gear: g }); });
      if(includeDrives){
        gears.forEach(g => {
          const d = GW.Drives.items.get(g.id);
          if(!d || !gears.includes(g.parentId ? GW.Gears.get(g.parentId) : null)) return;
          const arrs = d.parts.map(p => Export.bakeInstanced(p.mesh));
          const total = arrs.reduce((s, a) => s + a.length, 0), all = new Float32Array(total);
          let o = 0; arrs.forEach(a => { all.set(a, o); o += a.length; });
          solids.push({ name: (d.kind === 'chain' ? 'Chain_' : 'Belt_') + Export.safe(g.name), pos: all, drive: true });
        });
      }
    } else {
      // each gear in its own frame, lying flat on the bed, laid out in a row
      let cursor = 0;
      gears.forEach(g => {
        const pos = Export.bake(g.mesh, new T.Matrix4());           // local geometry
        let minZ = Infinity, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for(let i = 0; i < pos.length; i += 3){ minX = Math.min(minX, pos[i]); maxX = Math.max(maxX, pos[i]); minY = Math.min(minY, pos[i+1]); maxY = Math.max(maxY, pos[i+1]); minZ = Math.min(minZ, pos[i+2]); }
        const w = maxX - minX, h = maxY - minY;
        // bevel gears print best big-end down, which is already z = 0; others rest on their lowest face
        const dx = cursor - minX, dy = -(minY + maxY) / 2, dz = -minZ;
        for(let i = 0; i < pos.length; i += 3){ pos[i] += dx; pos[i + 1] += dy; pos[i + 2] += dz; }
        cursor += w + 8;
        solids.push({ name: Export.safe(g.name), pos, gear: g });
      });
    }
    return solids;
  },

  safe: s => String(s || 'gear').replace(/[^A-Za-z0-9_\-]+/g, '_').replace(/^_+|_+$/g, '') || 'gear',

  stats(solids){
    let tris = 0, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    solids.forEach(s => {
      tris += s.pos.length / 9;
      for(let i = 0; i < s.pos.length; i += 3) for(let k = 0; k < 3; k++){ mn[k] = Math.min(mn[k], s.pos[i + k]); mx[k] = Math.max(mx[k], s.pos[i + k]); }
    });
    return { tris, size: solids.length ? [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]] : [0, 0, 0] };
  },

  /* ------------------------------------------------------------------ STL */
  stlBinary(solids, name){
    const tris = solids.reduce((s, x) => s + x.pos.length / 9, 0);
    const buf = new ArrayBuffer(84 + tris * 50), dv = new DataView(buf);
    const head = ('Gear Maker ' + (name || '')).slice(0, 79);
    for(let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i));
    dv.setUint32(80, tris, true);
    let o = 84;
    solids.forEach(s => {
      const p = s.pos;
      for(let i = 0; i < p.length; i += 9){
        const ax = p[i+3]-p[i], ay = p[i+4]-p[i+1], az = p[i+5]-p[i+2], bx = p[i+6]-p[i], by = p[i+7]-p[i+1], bz = p[i+8]-p[i+2];
        let nx = ay*bz - az*by, ny = az*bx - ax*bz, nz = ax*by - ay*bx; const l = Math.hypot(nx, ny, nz) || 1;
        dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true);
        for(let k = 0; k < 9; k++) dv.setFloat32(o + 12 + k * 4, p[i + k], true);
        dv.setUint16(o + 48, 0, true);
        o += 50;
      }
    });
    return new Uint8Array(buf);
  },

  stlAscii(solids, name){
    const out = [];
    const f = v => (+v.toFixed(5)).toString();
    solids.forEach(s => {
      out.push('solid ' + Export.safe(s.name || name));
      const p = s.pos;
      for(let i = 0; i < p.length; i += 9){
        const ax = p[i+3]-p[i], ay = p[i+4]-p[i+1], az = p[i+5]-p[i+2], bx = p[i+6]-p[i], by = p[i+7]-p[i+1], bz = p[i+8]-p[i+2];
        let nx = ay*bz - az*by, ny = az*bx - ax*bz, nz = ax*by - ay*bx; const l = Math.hypot(nx, ny, nz) || 1;
        out.push(` facet normal ${f(nx/l)} ${f(ny/l)} ${f(nz/l)}`, '  outer loop',
          `   vertex ${f(p[i])} ${f(p[i+1])} ${f(p[i+2])}`, `   vertex ${f(p[i+3])} ${f(p[i+4])} ${f(p[i+5])}`, `   vertex ${f(p[i+6])} ${f(p[i+7])} ${f(p[i+8])}`,
          '  endloop', ' endfacet');
      }
      out.push('endsolid ' + Export.safe(s.name || name));
    });
    return new TextEncoder().encode(out.join('\n') + '\n');
  },

  /* ------------------------------------------------------------------ OBJ */
  obj(solids){
    const lines = ['# Gear Maker export — units: millimeters, +Z up'];
    let base = 1;
    const f = v => (+v.toFixed(5)).toString();
    solids.forEach(s => {
      const map = new Map(), verts = [], faces = [], idx = [], p = s.pos;
      for(let i = 0; i < p.length; i += 3){
        const k = Math.round(p[i] * 1e4) + ',' + Math.round(p[i+1] * 1e4) + ',' + Math.round(p[i+2] * 1e4);
        let id = map.get(k);
        if(id === undefined){ id = verts.length; map.set(k, id); verts.push(`v ${f(p[i])} ${f(p[i+1])} ${f(p[i+2])}`); }
        idx.push(id);
      }
      for(let i = 0; i < idx.length; i += 3){
        if(idx[i] === idx[i+1] || idx[i+1] === idx[i+2] || idx[i] === idx[i+2]) continue;
        faces.push(`f ${idx[i] + base} ${idx[i+1] + base} ${idx[i+2] + base}`);
      }
      lines.push('o ' + Export.safe(s.name), ...verts, ...faces);
      base += verts.length;
    });
    return new TextEncoder().encode(lines.join('\n') + '\n');
  },

  /* ------------------------------------------------------------------ STEP (AP214 boundary representation)
     Each region of flat triangles becomes one planar ADVANCED_FACE, each closed shell one
     MANIFOLD_SOLID_BREP. Curved surfaces stay as many small flat faces (a faceted solid). */
  step(solids, name){
    const L = [];
    let id = 0;
    const E = s => { L.push(`#${++id}=${s};`); return id; };
    const f = v => { let s = (+v.toFixed(6)).toString(); if(s === '-0') s = '0'; if(s.indexOf('.') < 0 && s.indexOf('e') < 0) s += '.'; return s; };
    const pname = (name || 'Gear Maker').replace(/[^A-Za-z0-9_\- ]/g, '');
    const appCtx = E("APPLICATION_CONTEXT('core data for automotive mechanical design processes')");
    E(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#${appCtx})`);
    const prodCtx = E(`PRODUCT_CONTEXT('',#${appCtx},'mechanical')`);
    const prod = E(`PRODUCT('${pname}','${pname}','',(#${prodCtx}))`);
    const pdf = E(`PRODUCT_DEFINITION_FORMATION('','',#${prod})`);
    const pdCtx = E(`PRODUCT_DEFINITION_CONTEXT('part definition',#${appCtx},'design')`);
    const pd = E(`PRODUCT_DEFINITION('design','',#${pdf},#${pdCtx})`);
    const pds = E(`PRODUCT_DEFINITION_SHAPE('','',#${pd})`);
    const lenU = E('(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))');
    const angU = E('(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.))');
    const solU = E('(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT())');
    const unc = E(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-04),#${lenU},'distance_accuracy_value','confusion accuracy')`);
    const ctx = E(`(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${unc})) GLOBAL_UNIT_ASSIGNED_CONTEXT((#${lenU},#${angU},#${solU})) REPRESENTATION_CONTEXT('Context3D','3D Context with UNIT and UNCERTAINTY'))`);
    const o = E("CARTESIAN_POINT('',(0.,0.,0.))"), dz = E("DIRECTION('',(0.,0.,1.))"), dx = E("DIRECTION('',(1.,0.,0.))");
    const axis = E(`AXIS2_PLACEMENT_3D('',#${o},#${dz},#${dx})`);

    const dirs = new Map();
    const dir = (x, y, z) => {
      const k = Math.round(x * 1e7) + ',' + Math.round(y * 1e7) + ',' + Math.round(z * 1e7);
      let d = dirs.get(k); if(d === undefined){ d = E(`DIRECTION('',(${f(x)},${f(y)},${f(z)}))`); dirs.set(k, d); }
      return d;
    };
    const breps = [];
    solids.forEach(sol => {
      GW.Brep.build(sol.pos).forEach((shell, si) => {
        const V = shell.V, nV = V.length / 3;
        const cps = new Map(), vps = new Map(), ecs = new Map();
        const cp = v => { let c = cps.get(v); if(c === undefined){ c = E(`CARTESIAN_POINT('',(${f(V[v*3])},${f(V[v*3+1])},${f(V[v*3+2])}))`); cps.set(v, c); } return c; };
        const vp = v => { let c = vps.get(v); if(c === undefined){ c = E(`VERTEX_POINT('',#${cp(v)})`); vps.set(v, c); } return c; };
        const edge = (a, b) => {
          const lo = Math.min(a, b), hi = Math.max(a, b), k = lo * nV + hi;
          let ec = ecs.get(k);
          if(ec === undefined){
            const dx = V[hi*3]-V[lo*3], dy = V[hi*3+1]-V[lo*3+1], dz = V[hi*3+2]-V[lo*3+2], len = Math.hypot(dx, dy, dz) || 1e-9;
            const vec = E(`VECTOR('',#${dir(dx / len, dy / len, dz / len)},${f(len)})`);
            const line = E(`LINE('',#${cp(lo)},#${vec})`);
            ec = E(`EDGE_CURVE('',#${vp(lo)},#${vp(hi)},#${line},.T.)`); ecs.set(k, ec);
          }
          return E(`ORIENTED_EDGE('',*,*,#${ec},${a === lo ? '.T.' : '.F.'})`);
        };
        const faceIds = [];
        shell.faces.forEach(face => {
          const bounds = face.loops.map((loop, li) => {
            const oes = loop.map((v, i) => edge(v, loop[(i + 1) % loop.length]));
            let list = ''; for(let i = 0; i < oes.length; i++) list += (i ? (i % 12 === 0 ? ',\n' : ',') : '') + '#' + oes[i];
            const el = E(`EDGE_LOOP('',(${list}))`);
            return E(li === 0 ? `FACE_OUTER_BOUND('',#${el},.T.)` : `FACE_BOUND('',#${el},.T.)`);
          });
          const n = face.n;
          // any direction at right angles to the normal
          const ax = Math.abs(n[0]) < 0.6 ? [1, 0, 0] : [0, 1, 0];
          let rx = n[1]*ax[2]-n[2]*ax[1], ry = n[2]*ax[0]-n[0]*ax[2], rz = n[0]*ax[1]-n[1]*ax[0];
          const rl = Math.hypot(rx, ry, rz); rx /= rl; ry /= rl; rz /= rl;
          const pc = E(`CARTESIAN_POINT('',(${f(face.p[0])},${f(face.p[1])},${f(face.p[2])}))`);
          const ap = E(`AXIS2_PLACEMENT_3D('',#${pc},#${dir(n[0], n[1], n[2])},#${dir(rx, ry, rz)})`);
          const pl = E(`PLANE('',#${ap})`);
          faceIds.push(E(`ADVANCED_FACE('',(${bounds.map(b => '#' + b).join(',')}),#${pl},.T.)`));
        });
        let list = '';
        for(let i = 0; i < faceIds.length; i++) list += (i ? (i % 12 === 0 ? ',\n' : ',') : '') + '#' + faceIds[i];
        const cs = E(`CLOSED_SHELL('',(${list}))`);
        breps.push(E(`MANIFOLD_SOLID_BREP('${Export.safe(sol.name)}${si ? '_' + (si + 1) : ''}',#${cs})`));
      });
    });
    const rep = E(`ADVANCED_BREP_SHAPE_REPRESENTATION('',(#${axis},${breps.map(b => '#' + b).join(',')}),#${ctx})`);
    E(`SHAPE_DEFINITION_REPRESENTATION(#${pds},#${rep})`);
    const header = [
      'ISO-10303-21;', 'HEADER;',
      "FILE_DESCRIPTION(('Gear Maker gear export'),'2;1');",
      `FILE_NAME('${pname}.step','${new Date().toISOString().slice(0, 19)}',('Gear Maker'),(''),'Gear Maker','Gear Maker','');`,
      "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));", 'ENDSEC;', 'DATA;'
    ];
    return new TextEncoder().encode(header.join('\n') + '\n' + L.join('\n') + '\nENDSEC;\nEND-ISO-10303-21;\n');
  },

  /* ------------------------------------------------------------------ build a download */
  /* opts: {format:'stl'|'stla'|'obj'|'step', scope, pose, zip, name} -> [{name, data(Uint8Array), mime}] */
  files(opts, selId){
    const solids = Export.collect(opts.scope, opts.pose, selId, opts.drives !== false && opts.pose === 'world');
    if(!solids.length) return [];
    const base = Export.safe(opts.name || 'gear-maker');
    const ext = { stl: 'stl', stla: 'stl', obj: 'obj', step: 'step' }[opts.format];
    const one = list => {
      const nm = list.length === 1 ? list[0].name : base;
      if(opts.format === 'stl') return [{ name: nm + '.stl', data: Export.stlBinary(list, nm), mime: 'model/stl' }];
      if(opts.format === 'stla') return [{ name: nm + '.stl', data: Export.stlAscii(list, nm), mime: 'model/stl' }];
      if(opts.format === 'obj') return [{ name: nm + '.obj', data: Export.obj(list), mime: 'text/plain' }];
      return [{ name: nm + '.step', data: Export.step(list, nm), mime: 'application/step' }];
    };
    if(opts.split && solids.length > 1){
      const files = [];
      solids.forEach(s => files.push(...one([s])));
      return files;
    }
    return one(solids);
  },

  download(files, zipName){
    const save = (name, blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    };
    if(files.length > 1) save(zipName + '.zip', new Blob([GW.Zip.make(files.map(f => ({ name: f.name, data: f.data })))], { type: 'application/zip' }));
    else save(files[0].name, new Blob([files[0].data], { type: files[0].mime }));
  }
};
})();
