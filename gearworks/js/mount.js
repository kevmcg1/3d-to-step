"use strict";
/* Gearworks — where a child gear sits relative to its parent, and how it
   must turn when the parent turns.

   Every gear keeps a "base frame" (position + orientation, z = shaft) in g.rt.
   A mesh link adds:  q_child = qC0 + kappa * (q_parent - qP0)
   where q is the turn angle in radians (or slide distance in mm for a rack).
   qP0 / qC0 are the reference angles at which the parent has a tooth exactly
   on the contact line and the child has a gap there, so the teeth always
   interleave instead of colliding. */
(function(){
const U = GW.U, Calc = GW.Calc, T = THREE;
const X = new T.Vector3(1, 0, 0), Y = new T.Vector3(0, 1, 0), Z = new T.Vector3(0, 0, 1);

const frame = g => ({
  O: g.rt.pos, Q: g.rt.quat,
  ex: X.clone().applyQuaternion(g.rt.quat),
  ey: Y.clone().applyQuaternion(g.rt.quat),
  k:  Z.clone().applyQuaternion(g.rt.quat)
});
// angle of a world direction measured in a gear's (unturned) base frame
const angleIn = (g, dir) => {
  const l = dir.clone().applyQuaternion(g.rt.quat.clone().invert());
  return Math.atan2(l.y, l.x);
};
const count = g => g.type === 'worm' ? g.starts : g.z;
// where, in a gear's own frame, its material tooth centres sit
const toothOffset = g => (g.type === 'internal' || g.type === 'splinehub') ? Math.PI / g.z : 0;
const basisQuat = (x, y, z) => new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z));
const alignZ = k => new T.Quaternion().setFromUnitVectors(Z, k);
const rackPitch = g => Math.PI * g.m;

const Mount = GW.Mount = {
  frame, angleIn,

  /* A free gear: its pose comes straight from its own settings. */
  placeRoot(g){
    g.rt.pos.set(g.px, g.py, g.pz);
    g.rt.quat.setFromEuler(new T.Euler(U.rad(g.rx), U.rad(g.ry), U.rad(g.rz), 'XYZ'));
    g.rt.link = null;
  },

  /* A meshed / shaft-mounted gear: place C relative to P and return the link maths. */
  place(P, C){
    const FP = frame(P);
    const psi = U.rad(C.meshAngle);
    const e = FP.ex.clone().multiplyScalar(Math.cos(psi)).addScaledVector(FP.ey, Math.sin(psi));
    const off = C.shaftOffset || 0;

    if(C.linkKind === 'same shaft' || Mount.kindOf(P, C) === 'spline'){
      C.rt.pos.copy(P.rt.pos).addScaledVector(FP.k, off);
      C.rt.quat.copy(P.rt.quat);
      return { kind: C.linkKind === 'same shaft' ? 'shaft' : 'spline', mode: 'ratio', kappa: 1, qP0: 0, qC0: U.rad(C.shaftPhase) };
    }
    const kind = Mount.kindOf(P, C);
    const ratioLink = (kappa, aP, aC) => ({
      kind, mode: 'ratio', kappa,
      qP0: aP - toothOffset(P),
      qC0: aC - toothOffset(C) - Math.PI / count(C)
    });

    switch(kind){
      case 'ext': case 'cyc': {
        const d = (kind === 'cyc' ? P.m * (P.z + C.z) / 2 : Calc.centerDistance(P, C, false).a) + C.meshOffset;
        C.rt.pos.copy(P.rt.pos).addScaledVector(e, d).addScaledVector(FP.k, off);
        C.rt.quat.copy(P.rt.quat);
        return ratioLink(-P.z / C.z, angleIn(P, e), angleIn(C, e.clone().negate()));
      }
      case 'ring': {
        const d = Calc.centerDistance(P, C, true).a + C.meshOffset;
        const ringIsP = P.type === 'internal';
        C.rt.pos.copy(P.rt.pos).addScaledVector(e, ringIsP ? d : -d).addScaledVector(FP.k, off);
        C.rt.quat.copy(P.rt.quat);
        const a = angleIn(P, e);
        return ratioLink(P.z / C.z, a, angleIn(C, e));
      }
      case 'chain': case 'belt': {
        const rP = Calc.pitchR(P), rC = Calc.pitchR(C);
        const d = Math.max(rP + rC + C.meshOffset, (rP + rC) * 0.6);
        C.rt.pos.copy(P.rt.pos).addScaledVector(e, d).addScaledVector(FP.k, off);
        C.rt.quat.copy(P.rt.quat);
        return { kind, mode: 'ratio', kappa: P.z / C.z, qP0: 0, qC0: 0, dist: d, dir: e.clone() };
      }
      case 'ell': {
        const d = 2 * P.majorA + C.meshOffset;
        C.rt.pos.copy(P.rt.pos).addScaledVector(e, d).addScaledVector(FP.k, off);
        C.rt.quat.copy(P.rt.quat);
        return { kind, mode: 'ell', aP: angleIn(P, e), aC: angleIn(C, e.clone().negate()), a: P.majorA, ecc: P.ecc };
      }
      case 'rack': return Mount.placeRack(P, C, e, FP, off);
      case 'bevel': {
        const sg = U.rad(C.shaftAngle);
        const dP = Math.atan2(Math.sin(sg), C.z / P.z + Math.cos(sg));
        const hP = Calc.pitchR(P) / Math.tan(U.rad(P.cone)), hC = Calc.pitchR(C) / Math.tan(U.rad(C.cone));
        const apex = P.rt.pos.clone().addScaledVector(FP.k, hP);
        const uP = FP.k.clone().negate();
        const uC = uP.clone().multiplyScalar(Math.cos(sg)).addScaledVector(e, Math.sin(sg));
        const kC = uC.clone().negate();
        C.rt.pos.copy(apex).addScaledVector(kC, -hC).addScaledVector(kC, off);
        C.rt.quat.copy(alignZ(kC));
        const w = uP.clone().multiplyScalar(Math.cos(dP)).addScaledVector(e, Math.sin(dP));
        const s = Math.sign(FP.k.clone().cross(w).dot(kC.clone().cross(w))) || -1;
        return ratioLink(s * P.z / C.z, angleIn(P, w), angleIn(C, w));
      }
      case 'crown': {
        const crownIsP = P.type === 'crown';
        let pin, crown, kPin, kCrown, Pc, dirPin, dirCrown;
        if(crownIsP){
          const rho = Calc.pitchR(P) + off;
          const rC = Calc.pitchR(C) + C.x * C.m + C.meshOffset;
          C.rt.pos.copy(P.rt.pos).addScaledVector(e, rho).addScaledVector(FP.k, rC);
          C.rt.quat.copy(alignZ(e));
          Pc = P.rt.pos.clone().addScaledVector(e, rho);
          kPin = e.clone(); kCrown = FP.k.clone(); dirCrown = e.clone(); dirPin = FP.k.clone().negate();
          pin = C; crown = P;
        } else {
          const rP = Calc.pitchR(P) + P.x * P.m + C.meshOffset;
          const rho = Calc.pitchR(C) + off;
          const kC = e.clone();
          C.rt.pos.copy(P.rt.pos).addScaledVector(kC, -rP).addScaledVector(FP.k, -rho);
          C.rt.quat.copy(alignZ(kC));
          Pc = P.rt.pos.clone().addScaledVector(kC, -rP);
          kPin = FP.k.clone(); kCrown = kC; dirCrown = FP.k.clone(); dirPin = kC.clone().negate();
          pin = P; crown = C;
        }
        const OPin = crownIsP ? C.rt.pos : P.rt.pos, OCrown = crownIsP ? P.rt.pos : C.rt.pos;
        const s = Math.sign(kPin.clone().cross(Pc.clone().sub(OPin)).dot(kCrown.clone().cross(Pc.clone().sub(OCrown)))) || 1;
        const aP = angleIn(P, crownIsP ? dirCrown : dirPin), aC = angleIn(C, crownIsP ? dirPin : dirCrown);
        return ratioLink(s * P.z / C.z, aP, aC);
      }
      case 'worm': return Mount.placeWorm(P, C, e, FP, off);
    }
    throw new Error('cannot place ' + P.type + ' with ' + C.type);
  },

  kindOf(P, C){ return GW.Compat.kindOf(P.type, C.type); },

  placeRack(P, C, e, FP, off){
    const rackIsC = C.type === 'rack';
    if(rackIsC){
      // pinion P is the parent: the rack lies on the side the contact direction points to
      const rP = Calc.pitchR(P) + P.x * P.m + C.meshOffset;
      const yR = e.clone().negate(), zR = FP.k.clone(), xR = yR.clone().cross(zR);
      C.rt.pos.copy(P.rt.pos).addScaledVector(e, rP).addScaledVector(FP.k, off);
      C.rt.quat.copy(basisQuat(xR, yR, zR));
      const p = rackPitch(C), L = C.z * p;
      return { kind: 'rack', mode: 'ratio', kappa: Calc.pitchR(P), qP0: angleIn(P, e), qC0: U.mod(L / 2, p), slide: true, p };
    }
    // rack R is the parent, pinion C rolls along its +y side
    const yR = FP.ey.clone(), zR = FP.k.clone(), xR = FP.ex.clone();
    const rC = Calc.pitchR(C) + C.x * C.m + C.meshOffset;
    C.rt.pos.copy(P.rt.pos).addScaledVector(yR, rC).addScaledVector(zR, off);
    C.rt.quat.copy(P.rt.quat);
    const p = rackPitch(P), L = P.z * p, rr = Calc.pitchR(C);
    return { kind: 'rack', mode: 'ratio', kappa: 1 / rr, qP0: U.mod(L / 2, p), qC0: angleIn(C, yR.clone().negate()), p };
  },

  placeWorm(P, C, e, FP, off){
    const wormIsP = P.type === 'worm';
    const worm = wormIsP ? P : C, wheel = wormIsP ? C : P;
    const R = Calc.pitchR(wheel);
    const a = worm.wormDia / 2 + R + C.meshOffset;
    let kWorm, kWheel, dirW, dirWorm;
    if(wormIsP){
      const w = e.clone();
      kWheel = FP.k.clone().cross(w).normalize();
      C.rt.pos.copy(P.rt.pos).addScaledVector(w, a).addScaledVector(FP.k, -off);
      C.rt.quat.copy(alignZ(kWheel));
      kWorm = FP.k.clone(); dirW = w.clone().negate(); dirWorm = w.clone();
    } else {
      kWorm = FP.k.clone().cross(e).normalize();
      C.rt.pos.copy(P.rt.pos).addScaledVector(e, a).addScaledVector(kWorm, off);
      C.rt.quat.copy(alignZ(kWorm));
      kWheel = FP.k.clone(); dirW = e.clone(); dirWorm = e.clone().negate();
    }
    const sh = worm.hand === 'left' ? -1 : 1;
    const lead = worm.starts * Math.PI * worm.m;
    const denom = kWheel.clone().cross(dirW).dot(kWorm) || 1;
    const rw = -sh * lead / (2 * Math.PI * R * denom);       // d(wheel)/d(worm)
    const cLocal = -off;                                        // contact point along the worm axis
    const aWorm = angleIn(worm, dirWorm) - sh * 2 * Math.PI * cLocal / lead;
    const aWheel = angleIn(wheel, dirW) - Math.PI / wheel.z;
    return wormIsP
      ? { kind: 'worm', mode: 'ratio', kappa: rw, qP0: aWorm, qC0: aWheel }
      : { kind: 'worm', mode: 'ratio', kappa: 1 / rw, qP0: aWheel, qC0: aWorm };
  },

  /* turn angle (or slide) of the child for a given parent angle */
  follow(link, qP){
    if(link.mode === 'ell'){
      const a = link.a, e = link.ecc;
      const phiA = U.wrapPi(link.aP - qP);
      if(e < 1e-6) return link.aC + phiA;
      const rA = a * (1 - e * e) / (1 - e * Math.cos(phiA)), rB = 2 * a - rA;
      const c = U.clamp((1 - a * (1 - e * e) / rB) / e, -1, 1);
      return link.aC + (phiA >= 0 ? 1 : -1) * Math.acos(c);
    }
    return link.qC0 + link.kappa * (qP - link.qP0);
  }
};
})();
