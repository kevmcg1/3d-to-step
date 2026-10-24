"use strict";
/* Gearworks — roller chains and timing belts joining sprocket / pulley pairs.
   They are drawn from instanced parts that slide round the pitch path every frame,
   and baked into ordinary triangles when you export. */
(function(){
const U = GW.U, T = THREE;

const MATS = {
  chain: new T.MeshStandardMaterial({ color: 0x8e96a1, metalness: 0.8, roughness: 0.35 }),
  plate: new T.MeshStandardMaterial({ color: 0xb4bcc6, metalness: 0.75, roughness: 0.4 }),
  belt:  new T.MeshStandardMaterial({ color: 0x24262b, metalness: 0.0, roughness: 0.85 })
};

const Drives = GW.Drives = {
  items: new Map(),     // child gear id -> drive

  signature(P, C){
    const L = C.rt.link;
    return [C.id, L.kind, P.z, C.z, P.chainPitch, P.rollerDia, P.beltPitch, P.grooveDepth, Math.round(L.dist * 100), P.thick, C.thick].join('|');
  },

  sync(){
    const live = new Set();
    GW.Gears.list.forEach(C => {
      const P = C.parentId ? GW.Gears.get(C.parentId) : null;
      if(!P || C.linkKind !== 'mesh' || !C.rt.link || !(C.rt.link.kind === 'chain' || C.rt.link.kind === 'belt')) return;
      live.add(C.id);
      const sig = Drives.signature(P, C), cur = Drives.items.get(C.id);
      if(cur && cur.sig === sig) return;
      if(cur) Drives.dispose(C.id);
      Drives.items.set(C.id, Drives.create(P, C, sig));
    });
    Array.from(Drives.items.keys()).forEach(id => { if(!live.has(id)) Drives.dispose(id); });
  },

  dispose(id){
    const d = Drives.items.get(id);
    if(!d) return;
    GW.Scene.drives.remove(d.group);
    d.group.traverse(o => { if(o.geometry) o.geometry.dispose(); });
    Drives.items.delete(id);
  },

  create(P, C, sig){
    const L = C.rt.link, group = new T.Group();
    const rP = GW.Calc.pitchR(P), rC = GW.Calc.pitchR(C);
    const path = GW.Prof.loopPath(rP, rC, L.dist);
    const pitch = L.kind === 'chain' ? P.chainPitch : P.beltPitch;
    const n = Math.max(6, Math.round(path.len / pitch)), sp = path.len / n;
    const width = Math.max(1, Math.min(P.thick, C.thick));
    const d = { sig, group, path, n, sp, kind: L.kind, P, C, parts: [], width };
    if(L.kind === 'chain'){
      const dr = P.rollerDia, rollerLen = Math.max(width * 0.62, 1);
      const roller = new T.CylinderGeometry(dr / 2, dr / 2, rollerLen, 20, 1); roller.rotateX(Math.PI / 2);
      const plate = new T.BoxGeometry(sp, dr * 0.95, Math.max(dr * 0.16, 0.5));
      const pin = new T.CylinderGeometry(dr * 0.2, dr * 0.2, rollerLen + 2 * Math.max(dr * 0.16, 0.5) + 0.6, 10); pin.rotateX(Math.PI / 2);
      const mR = new T.InstancedMesh(roller, MATS.chain, n), mP = new T.InstancedMesh(plate, MATS.plate, 2 * n), mN = new T.InstancedMesh(pin, MATS.plate, n);
      d.parts = [{ mesh: mR, kind: 'roller' }, { mesh: mP, kind: 'plate' }, { mesh: mN, kind: 'pin' }];
      d.plateZ = rollerLen / 2 + Math.max(dr * 0.16, 0.5) / 2;
    } else {
      const toothH = Math.max(P.grooveDepth * 0.85, 0.4), back = Math.max(P.beltPitch * 0.35, 0.9);
      const tooth = new T.BoxGeometry(pitch * 0.46, toothH, width * 0.94);
      const bk = new T.BoxGeometry(sp * 1.02, back, width * 0.94);
      d.parts = [{ mesh: new T.InstancedMesh(tooth, MATS.belt, n), kind: 'tooth' }, { mesh: new T.InstancedMesh(bk, MATS.belt, n), kind: 'back' }];
      d.toothH = toothH; d.back = back;
    }
    d.parts.forEach(p => { p.mesh.frustumCulled = false; group.add(p.mesh); });
    GW.Scene.drives.add(group);
    return d;
  },

  /* move every part to its place for the current turn angle */
  update(){
    Drives.items.forEach(d => {
      const P = d.P, C = d.C;
      if(!P.rt || !C.rt.link) return;
      const kP = new T.Vector3(0, 0, 1).applyQuaternion(P.rt.quat);
      const ex = C.rt.pos.clone().sub(P.rt.pos); ex.addScaledVector(kP, -ex.dot(kP)).normalize();
      const ey = kP.clone().cross(ex);
      const zMid = C.rt.pos.clone().sub(P.rt.pos).dot(kP) / 2;
      const base = P.rt.pos.clone().addScaledVector(kP, zMid);
      const s0 = (P.rt.q / (2 * Math.PI)) * P.z * (d.kind === 'chain' ? P.chainPitch : P.beltPitch);
      const m = new T.Matrix4(), pos = new T.Vector3(), X = new T.Vector3(), Y = new T.Vector3();
      const place = (mesh, i, x, y, tx, ty, nx, ny, off, zoff) => {
        // local frame: X along motion, Y along outward normal
        X.copy(ex).multiplyScalar(tx).addScaledVector(ey, ty);
        Y.copy(ex).multiplyScalar(nx).addScaledVector(ey, ny);
        pos.copy(base).addScaledVector(ex, x).addScaledVector(ey, y).addScaledVector(Y, off).addScaledVector(kP, zoff || 0);
        m.makeBasis(X, Y, kP).setPosition(pos);
        mesh.setMatrixAt(i, m);
      };
      d.parts.forEach(part => {
        const mesh = part.mesh;
        for(let i = 0; i < d.n; i++){
          const a = d.path.at(s0 + i * d.sp), b = d.path.at(s0 + (i + 1) * d.sp);
          if(part.kind === 'roller') place(mesh, i, a.x, a.y, a.tx, a.ty, a.nx, a.ny, 0, 0);
          else if(part.kind === 'pin') place(mesh, i, a.x, a.y, a.tx, a.ty, a.nx, a.ny, 0, 0);
          else if(part.kind === 'plate'){
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
            const tx = dx / l, ty = dy / l;
            place(mesh, 2 * i, mx, my, tx, ty, -ty, tx, 0, d.plateZ);
            place(mesh, 2 * i + 1, mx, my, tx, ty, -ty, tx, 0, -d.plateZ);
          }
          else if(part.kind === 'back') {
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
            place(mesh, i, mx, my, dx / l, dy / l, -dy / l, dx / l, d.back / 2 + 0.1, 0);
          }
          else if(part.kind === 'tooth') place(mesh, i, a.x, a.y, a.tx, a.ty, a.nx, a.ny, -d.toothH / 2 + 0.05, 0);
        }
        mesh.instanceMatrix.needsUpdate = true;
      });
      d.group.updateMatrixWorld(true);
    });
  }
};
})();
