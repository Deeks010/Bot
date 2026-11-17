// Our cast as lit flat sprites in the 3D world (same machinery as the bridge short: a canvas pool keyed by drawing,
// yaw-only billboards shaded by cardShade(), contact blobs, unlit effect cards on the NOINK layer).
import * as THREE from "three";
import {
  Pen, bodyFront, Outfit, Expr, FrontOpts, SHIP_OFFICER, LOOKOUT, AUCTIONEER, RADIO_OP, KID, passenger,
  fxBurst, fxSplash, fxShadow, fxContact, fxKey, fxIce, fxClang, fxBreath, fxWaves, fxJet, fxTwinkle, fxFall,
} from "./toon";
import {
  FPS, SHOTS, V3, LEAD, W, LOOKOUTS, NEST_Y, BOAT_DECK, BELL, CLANGS, blairPos, BLAIR0, LOCKER, RADIO, PODIUM, CUSHION, TRAY_AT, bergAt, hwAt,
  KEEL, clamp01, smooth, topAt, SPILL0,
} from "./story";
import { NOINK } from "./ink";
import { cardShade, blobMaterial, CARD_K } from "./cardshade";
import type { LightName } from "./lights";

// ---------------- canvas pool ----------------
type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number };
export type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; tex?: THREE.CanvasTexture };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, tex, w, h };
};
export class Pool {
  private live = new Map<string, Entry>();
  private free: Entry[] = [];
  private reqs: Req[] = [];
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void) {
    const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw };
    this.reqs.push(r);
    return r;
  }
  flush() {
    const want = new Map<string, Req[]>();
    for (const r of this.reqs) { const l = want.get(r.key); if (l) l.push(r); else want.set(r.key, [r]); }
    for (const [key, e] of this.live) if (!want.has(key)) { this.live.delete(key); this.free.push(e); }
    for (const [key, rs] of want) {
      let e = this.live.get(key);
      if (!e) {
        const r = rs[0], i = this.free.findIndex((x) => x.w === r.w && x.h === r.h);
        e = i >= 0 ? this.free.splice(i, 1)[0] : makeEntry(r.w, r.h);
        const g = e.cv.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.w, e.h); g.setTransform(r.k, 0, 0, r.k, 0, 0);
        r.draw(new Pen(g));
        e.tex.needsUpdate = true;
        this.live.set(key, e);
      }
      for (const r of rs) r.tex = e.tex;
    }
    this.reqs = [];
  }
}

// ---------------- sprite meshes ----------------
const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
export const SU = 0.00216; // metres per design unit: 1000 units = 2.16 m
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
const CARD = new THREE.PlaneGeometry(1, 1);
export class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry = BODY) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.customDepthMaterial = this.dmat;
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = "YXZ"; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}
export class Fx {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.blob = blobMaterial(blank);
    this.mesh = new THREE.Mesh(CARD, this.mat);
    this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  use(soft: boolean) { this.mesh.material = soft ? this.soft : this.mat; }
  bind() {
    const t = this.r?.tex;
    if (!t) return;
    if (this.r!.key.includes("|blob|")) {
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    } else { this.mat.map = t; this.soft.map = t; this.mesh.renderOrder = 4; }
  }
}

// ---------------- placements ----------------
export type Place = { key: string; draw: (p: Pen) => void; x: number; y: number; z: number; scale?: number; mirror?: boolean; yaw?: number; roll?: number; size?: [number, number, number] };
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number; flat?: boolean; rot?: number; soft?: boolean };
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3; sun: THREE.Vector3 };
export type Stage = { places: Place[]; fx: FxPlace[] };

const hh = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const q = (v: number, n = 120) => Math.round(v * n) / n;
const seedOf = (i: number) => ((i * 5 + 3) % 7) + 1;
const tier = (d: number): [number, number, number] =>
  d < 3.2 ? [1800, 3000, 3.0] : d < 6.5 ? [1080, 1800, 1.8] : d < 16 ? [480, 800, 0.8] : d < 60 ? [240, 400, 0.4] : [120, 200, 0.2];
const SUN = new THREE.Vector3(0.5, 0.75, -0.4).normalize();
const tmp = new THREE.Vector3();
let LNAME: LightName = "day";
const light2D = (cam: CamInfo) => {
  const sx = SUN.dot(cam.right), sy = -SUN.y;
  return Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) * (Math.PI / 4);
};
const LID = [0.5, 1, 1, 0.5];
const lidAt = (t: number, i: number, swaps: number[] = []) => {
  const f = Math.round(t * FPS);
  for (const ts of swaps) { const k = f - Math.round((ts - LEAD) * FPS) + 1; if (k >= 0 && k < 4) return LID[k]; }
  let s = Math.round(-60 * hh(i, 9));
  for (let n = 0; s <= f && n < 400; n++) {
    const k = f - s;
    if (k >= 0 && k < 4) return LID[k];
    s += Math.round(15 + 54 * hh(i * 31 + n, 13));
  }
  return 0;
};
const fkey = (o: object) => JSON.stringify(o, (_k, v) => (typeof v === "number" ? q(v) : v));
type Who = { i: number; o: Outfit; okey: string };
const person = (cam: CamInfo, who: Who, x: number, y: number, z: number, fo: FrontOpts, scale = 1): Place => {
  const d = cam.pos.distanceTo(tmp.set(x, y + 1.2 * scale, z)) / scale;
  const [w, h, k] = tier(d);
  const light = light2D(cam), seed = seedOf(who.i);
  const f2: FrontOpts = { ...fo, light, seed };
  return { key: `F|${who.okey}|${fkey(f2)}`, x, y, z, scale, draw: (p) => bodyFront(p, who.o, f2), size: [w, h, k] };
};
const CONTACT: Record<LightName, [number, number, number]> = { day: [0.2, 0.21, 0.33], golden: [0.24, 0.2, 0.33], night: [0.3, 0.3, 0.45] };
const TAIL: [number, number, number] = [0.42, 0.44, 0.62];
const toSrgb = (v: number) => { const c = clamp01(v); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
const hexOf = (c: [number, number, number], k: number) => "#" + c.map((v) => Math.round(255 * toSrgb(1 - (1 - v) * k)).toString(16).padStart(2, "0")).join("");
const blob = (out: Stage, x: number, y: number, z: number, sc = 1, k = 1) => {
  const hl = Math.hypot(SUN.x, SUN.z) || 1, ox = -SUN.x / hl, oz = -SUN.z / hl, rot = Math.atan2(-ox, -oz);
  if (LNAME === "day") {
    const el = Math.asin(Math.min(0.99, Math.max(0.1, SUN.y)));
    const len = Math.min(2.4, Math.max(0.5, 1.6 / Math.tan(el))) * sc, h = len + 0.55 * sc, c = 0.3 * h;
    const tc = hexOf(TAIL, k);
    out.fx.push({ key: `blob|shadow|${tc}`, cw: 128, ch: 256, draw: (p) => fxShadow(p, tc), x: x + ox * c, y: y + 0.018, z: z + oz * c, w: 0.72 * sc, h, flat: true, rot });
  }
  const cc = hexOf(CONTACT[LNAME], k);
  out.fx.push({ key: `blob|contact|${cc}`, cw: 128, ch: 128, draw: (p) => fxContact(p, cc), x, y: y + 0.022, z, w: 0.52 * sc, h: 0.4 * sc, flat: true, rot });
};

// ---------------- who is where ----------------
const T = (f: number) => f / FPS;
const PASS = [0, 1, 2, 3, 4, 5].map((v) => passenger(v));
const pas = (i: number): Who => ({ i: i + 300, o: PASS[i % 6], okey: `p${i % 6}` });
const CHEER: [number, number][] = [[W.unluckily, -1]];
void CHEER;

/** the crowd on the quay (departure day) and passengers along the port rail of the boat deck */
const quayCrowd = (cam: CamInfo, t: number, out: Stage, cheer: boolean) => {
  for (let i = 0; i < 64; i++) {
    const x = 19.0 + (i % 8) * 1.75 + hh(i) * 1.2, z = -34 + Math.floor(i / 8) * 9.5 + hh(i, 2) * 5;
    if (Math.abs(z - BLAIR0[2] - 3) < 5.5 && x < 24.5) continue; // keep Blair's path from the gangway clear
    const kid = i % 7 === 3, who: Who = kid ? { i: i + 200, o: KID, okey: "kid" } : pas(i);
    const wave = (i % 3 !== 1) ? q(Math.sin(t * (cheer ? 9 : 4.5) + i * 1.3), 30) : undefined;
    const hop = cheer && kid ? Math.max(0, Math.sin(t * 7 + i)) * 0.16 : 0;
    const expr: Expr = cheer ? (["grin", "laugh", "smile_closed", "relief_open"] as Expr[])[i % 4] : (["smile", "smile_closed", "grin"] as Expr[])[i % 3];
    out.places.push(person(cam, who, x, 4 + hop, z, { mode: "stand", expr, wave, blink: lidAt(t, i + 40) }, kid ? 0.72 : 1));
    blob(out, x, 4, z, kid ? 0.72 : 1, hop > 0 ? 0.6 : 1);
  }
};
const railPassengers = (cam: CamInfo, t: number, out: Stage, side: 1 | -1, zs: number[], expr: (i: number) => Expr, wave = false) => {
  zs.forEach((z, i) => {
    const x = side * (11.9 - 0.5 * hh(i, 3));
    if (Math.abs(z - 38) < 4.6 || Math.abs(z - 47) < 4.6) { /* between the boats */ }
    out.places.push(person(cam, pas(i + 50), x, BOAT_DECK + 0.14, z, { mode: "stand", expr: expr(i), wave: wave && i % 2 ? q(Math.sin(t * 6 + i), 30) : undefined, blink: lidAt(t, i + 60) }));
    blob(out, x, BOAT_DECK + 0.14, z);
  });
};
const lookouts = (cam: CamInfo, t: number, out: Stage, id: number) => {
  LOOKOUTS.forEach((p, i) => {
    if (cam.pos.z < p[2] - 0.3) return; // the lens is behind them: billboards would face it
    let expr: Expr = "neutral", wave: number | undefined, tilt = 0;
    const shiver = id === 5 || id === 6 ? 1.2 * Math.sin(t * 38 + i * 2) : 0;
    if (id === 1) expr = i ? "nervous" : "neutral";
    if (id === 5) expr = t < W.squinting - LEAD ? (i ? "neutral" : "stern") : "squint";
    if (id === 7) expr = t < W.spot - LEAD ? "squint" : "shock";
    if (id === 8) {
      expr = "shock";
      if (i === 0 && t >= W.iceberg2 - LEAD) { expr = "shout"; wave = q(Math.sin(t * 14), 30); }
      if (i === 1 && t < W.iceberg2 - LEAD) { wave = q(-0.6 + 0.9 * Math.max(...CLANGS.map((c) => Math.exp(-(((t - c) * 9) ** 2)))), 30); }
    }
    const swaps = id === 5 ? [W.squinting] : id === 7 ? [W.spot] : [];
    out.places.push(person(cam, { i: 400 + i, o: LOOKOUT(i), okey: `lk${i}` }, p[0], p[1], p[2], { mode: "stand", expr, wave, tilt: tilt + shiver, blink: lidAt(t, 400 + i, swaps), facing: i ? -1 : 1 }));
    if (id === 5 || id === 6 || id === 7) { // frosty breath every ~1.6 s
      const u = ((t + i * 0.8) % 1.6) / 1.2;
      if (u < 1) out.fx.push({ key: `breath${q(u, 30)}`, cw: 300, ch: 300, draw: (pp) => fxBreath(pp, q(u, 30)), x: p[0] + (i ? 0.25 : -0.25), y: p[1] + 1.55, z: p[2] + 0.35, w: 0.55, h: 0.55, soft: true, rot: i ? 0 : Math.PI });
    }
  });
};

export const stage = (id: number, f: number, cam: CamInfo): Stage => {
  const out: Stage = { places: [], fx: [] };
  const s = SHOTS[id - 1], t = T(f);
  LNAME = s.light;
  SUN.copy(cam.sun).normalize();
  switch (id) {
    case 1: {
      if (f >= 57) {
        lookouts(cam, t, out, 1);
        // the missing key: a dashed outline floating where the binoculars should be
        const u = smooth((f - 60) / 8);
        out.fx.push({ key: "keyDash", cw: 600, ch: 260, draw: (p) => fxKey(p, true), x: 0, y: NEST_Y + 2.25 + 0.05 * Math.sin(t * 3), z: 101.9, w: 0.75 * u, h: 0.325 * u, rot: -0.12 });
      }
      break;
    }
    case 2: {
      quayCrowd(cam, t, out, t > W.unsinkable - LEAD);
      railPassengers(cam, t, out, 1, [52, 43.5, 34, 25, 12, 0, -10, -22, -40, -48.5, -57.5, -66.5], () => "smile_closed", true);
      break;
    }
    case 3: {
      quayCrowd(cam, t, out, false);
      // passengers queueing along the quay behind Blair (inside the narrow 9:16 view down the hull)
      for (let i = 0; i < 16; i++) {
        const x = 18.4 + (i % 3) * 1.25 + hh(i, 7) * 0.5, z = -22 + Math.floor(i / 3) * 4.6 + hh(i, 8) * 1.6;
        out.places.push(person(cam, pas(i + 20), x, 4, z, { mode: "stand", expr: (["smile", "neutral", "smile_closed"] as Expr[])[i % 3], blink: lidAt(t, i + 20) }));
        blob(out, x, 4, z);
      }
      const p = blairPos(t), walking = t > W.walked - 0.1 && t < W.walked + 3.1;
      const phase = walking ? ((t - W.walked) * 0.9) % 1 : 0;
      const nudge = Math.max(0, 1 - Math.abs(t - W.bumped - 0.08) / 0.25);
      out.places.push(person(cam, { i: 500, o: SHIP_OFFICER, okey: "blair" }, p[0], 4, p[2],
        { mode: walking ? "stroll" : "stand", phase: q(phase, 60), expr: t < W.bumped - LEAD ? "nervous" : "sad", prop: "suitcase", tilt: -9 * nudge, blink: lidAt(t, 500, [W.bumped]) }));
      blob(out, p[0], 4, p[2]);
      // the officer who takes his place points him down the gangway
      if (t < W.walked + 0.4) {
        out.places.push(person(cam, { i: 501, o: { ...SHIP_OFFICER, moustache: "#3a2a20" }, okey: "off2" }, 17.6, 4, 9.6,
          { mode: "stand", expr: "stern", wave: t > W.bumped - LEAD ? q(-0.8, 30) : undefined, blink: lidAt(t, 501), facing: -1 }));
        blob(out, 17.6, 4, 9.6);
      }
      if (f >= 396) { // the key peeking out of his pocket, with a glint
        const k = smooth((f - 398) / 6);
        out.fx.push({ key: "key", cw: 600, ch: 260, draw: (pp) => fxKey(pp), x: p[0] + 0.2, y: 4.92 + 0.02 * Math.sin(t * 9), z: p[2] + 0.12, w: 0.26, h: 0.113, rot: 1.25 });
        if (k > 0 && f < 420) out.fx.push({ key: `tw${q(Math.sin(((f - 398) / 22) * Math.PI), 20)}`, cw: 200, ch: 200, draw: (pp) => fxTwinkle(pp, Math.max(0.05, q(Math.sin(((f - 398) / 22) * Math.PI), 20))), x: p[0] + 0.3, y: 5.0, z: p[2] + 0.2, w: 0.3, h: 0.3 });
      }
      break;
    }
    case 4: {
      // the empty keyhole: a little "?" glint on "binoculars"
      if (t > W.binoculars - LEAD) {
        const u = clamp01((t - W.binoculars) / 0.4);
        out.fx.push({ key: `tw${q(Math.sin(u * Math.PI), 20)}`, cw: 200, ch: 200, draw: (pp) => fxTwinkle(pp, Math.max(0.05, q(Math.sin(u * Math.PI), 20))), x: LOCKER[0] + 0.12, y: LOCKER[1] + 0.02, z: LOCKER[2] + 0.25, w: 0.16, h: 0.16 });
      }
      break;
    }
    case 5: case 7: lookouts(cam, t, out, id); break;
    case 6: if (f < 735) { /* camera is behind them */ } break;
    case 8: {
      lookouts(cam, t, out, 8);
      for (const c of CLANGS) if (t >= c && t < c + 0.3) {
        const u = (t - c) / 0.3;
        out.fx.push({ key: `clang${q(u, 30)}`, cw: 500, ch: 500, draw: (pp) => fxClang(pp, q(u, 30)), x: BELL[0], y: BELL[1] + 0.2, z: BELL[2] + 0.1, w: 0.9, h: 0.9 });
      }
      break;
    }
    case 9: {
      if (f >= 1027) {
        [[-9.5, 84], [-8.0, 87.5], [-10.2, 90.5], [-6.2, 82.5]].forEach(([x, z], i) => { const y = topAt(z);
          out.places.push(person(cam, pas(i + 70), x, y, z, { mode: "stand", expr: i % 2 ? "shock" : "nervous", blink: lidAt(t, i + 70) })); });
        // ice chunks breaking off and falling onto the forward deck and into the sea
        const b = bergAt(t);
        for (let i = 0; i < 9; i++) {
          const t0 = W.scrapes + i * 0.13, u = t - t0;
          if (u < 0 || u > 1.6) continue;
          const z0 = b[2] + 2 - i * 2.2, x0 = -(hwAt(z0) + 2.5), vy = 2 + 3 * hh(i), vx = 2.5 + 2 * hh(i, 1);
          const y = 17 + 4 * hh(i, 2) + vy * u - 4.9 * u * u, x = x0 + vx * u * (i % 3 ? 1 : -0.6);
          const floor = x > -hwAt(z0) ? topAt(z0) : 0;
          const yy = Math.max(floor + 0.3, y);
          out.fx.push({ key: `ice${i % 4}`, cw: 300, ch: 260, draw: (pp) => fxIce(pp, i % 4), x, y: yy, z: z0, w: 0.9 + 0.6 * hh(i, 4), h: 0.78 + 0.5 * hh(i, 4), rot: u * 3 * (i % 2 ? 1 : -1) });
          if (floor === 0 && y < 0.6 && u < 1.2) { const v = clamp01((u - (vy + Math.sqrt(vy * vy + 2 * 4.9 * 16)) / 9.8) / 0.6); if (v > 0) out.fx.push({ key: `splash${q(v, 30)}`, cw: 800, ch: 800, draw: (pp) => fxSplash(pp, q(v, 30)), x, y: 1.3, z: z0, w: 3.6, h: 3.6 }); }
        }
        for (let k = 0; k < 3; k++) {
          const tc = W.scrapes + k * 0.5; if (t < tc || t > tc + 0.25) continue;
          const u = (t - tc) / 0.25, zc = bergAt(tc)[2] - 4;
          out.fx.push({ key: `burst${q(u, 30)}`, cw: 500, ch: 500, draw: (pp) => fxBurst(pp, q(u, 30), "#e9f6ff"), x: -hwAt(zc) - 0.6, y: 5, z: zc, w: 6, h: 6 });
        }
      }
      break;
    }
    case 10: {
      // passengers on the forward well deck at the starboard rail, ice chunks on the planks around them
      [[-1.84, 85.42], [-4.08, 85.07], [-4.34, 87.1], [-6.25, 87.14], [-6.2, 89.56]].forEach(([x, z], i) => {
        const y = topAt(z);
        out.places.push(person(cam, pas(i + 70), x, y, z, { mode: "stand", expr: (["relief", "relief_open", "relief", "smile_closed", "relief_open"] as Expr[])[i], blink: lidAt(t, i + 70) }));
        blob(out, x, y, z);
      });
      [[-3.0, 84.2, 0], [-5.6, 86.4, 1], [-2.6, 86.9, 2], [-7.4, 88.3, 3], [-4.9, 89.4, 1]].forEach(([x, z, k]) => out.fx.push({ key: `ice${k}`, cw: 300, ch: 260, draw: (pp) => fxIce(pp, k), x, y: topAt(z) + 0.25, z, w: 0.6, h: 0.52 }));
      break;
    }
    case 11: {
      // water bursting in through the gash along the starboard bow (the near hull plates are cut away)
      [124, 112, 99, 86, 72, 58].forEach((z, i) => {
        if (t < W.unluckily - 0.1 + i * 0.05) return;
        const u = ((t * 2.2 + i * 0.37) % 1);
        out.fx.push({ key: `jet${q(u, 30)}`, cw: 400, ch: 200, draw: (pp) => fxJet(pp, q(u, 30)), x: -hwAt(z) * 0.9 + 2.6, y: -2.0, z, w: 7, h: 3.5, rot: -0.08 });
      });
      break;
    }
    case 13: {
      // water topping the wall between the forward five and the next compartment
      if (t > SPILL0) {
        const u = q((t * 1.6) % 1, 30), k = smooth((t - SPILL0) / 0.4);
        out.fx.push({ key: `fall${u}`, cw: 400, ch: 600, draw: (pp) => fxFall(pp, u), x: -hwAt(54) * 0.8, y: 3.0 - 1.0 * k, z: 52.4, w: 4.4 * k, h: 6.6 * k });
      }
      break;
    }
    case 14: {
      const tz = TRAY_AT;
      const expr: Expr = t < W.fill - LEAD ? "smile" : t < W.spills - LEAD ? "grin" : "shock";
      out.places.push(person(cam, { i: 600, o: KID, okey: "kid" }, tz[0] - 0.85, 4, tz[2] - 0.55, { mode: "stand", expr, blink: lidAt(t, 600, [W.spills]) }, 0.72));
      blob(out, tz[0] - 0.85, 4, tz[2] - 0.55, 0.72);
      break;
    }
    case 15: case 16: {
      // survivors in the lifeboats (seated, small), facing the lens
      const boats: [number, number, number][] = [[-120, 30, 0.4], [-95, -20, -0.3], [-70, 60, 0.9], [-60, -60, 0.2], [-40, 20, -0.8], [-52, -6, 0.5]];
      boats.forEach(([x, z, yaw], bi) => {
        for (let k = 0; k < 3; k++) {
          const dz = (k - 1) * 2.3, px = x + Math.sin(yaw) * dz, pz = z + Math.cos(yaw) * dz;
          const expr: Expr = id === 15 ? "shock" : (["sad", "neutral", "sad"] as Expr[])[k];
          out.places.push(person(cam, pas(bi * 3 + k + 80), px, 0.12, pz, { mode: "sit", expr, blink: lidAt(t, bi * 3 + k + 80) }));
        }
      });
      break;
    }
    case 17: {
      const zs = [55, 41, 31, 15, 6, -3, -21, -30, -48];
      zs.forEach((z, i) => {
        const x = (i % 2 ? 1 : -1) * 4.2;
        out.places.push(person(cam, pas(i + 100), x, BOAT_DECK + 0.14, z, { mode: "stand", expr: (["smile_closed", "grin", "smile"] as Expr[])[i % 3], blink: lidAt(t, i + 100) }));
        blob(out, x, BOAT_DECK + 0.14, z);
      });
      break;
    }
    case 18: {
      out.places.push(person(cam, { i: 700, o: RADIO_OP, okey: "radio" }, RADIO[0] + 0.15, RADIO[1] + 0.05, RADIO[2] - 1.15, { mode: "sit", expr: "smile", blink: lidAt(t, 700) }));
      for (let k = 0; k < 2; k++) {
        const u = q((t * 0.9 + k * 0.5) % 1, 30);
        out.fx.push({ key: `waves${u}`, cw: 400, ch: 400, draw: (pp) => fxWaves(pp, u), x: RADIO[0] - 0.62, y: RADIO[1] + 1.55 + k * 0.55, z: RADIO[2] - 0.62, w: 1.1, h: 1.1, soft: true });
      }
      break;
    }
    case 19: {
      // auctioneer: gavel up, a 1-frame strike on "sold"
      const n = (t - W.sold) * FPS, k = n >= -11 && n < -7 ? 1 - smooth((n + 11) / 4) : n >= -7 && n < 0 ? 0 : 1;
      out.places.push(person(cam, { i: 800, o: AUCTIONEER, okey: "auct" }, PODIUM[0] + 0.25, 4.02, PODIUM[2], { mode: "stand", expr: t < W.sold - LEAD ? "grin" : "laugh", prop: ["gavel", q(k, 30)], blink: lidAt(t, 800, [W.sold]) }));
      if (t >= W.sold && t < W.sold + 5 / FPS) { const u = (t - W.sold) / (5 / FPS); out.fx.push({ key: `burst${q(u, 30)}`, cw: 500, ch: 500, draw: (pp) => fxBurst(pp, q(u, 30)), x: PODIUM[0] - 0.55, y: 5.35, z: PODIUM[2] - 0.35, w: 1.1, h: 1.1 }); }
      let i = 0;
      for (const x of [203.6, 205.6, 207.4]) for (const z of [-3.6, -1.9, -0.2, 1.5, 3.2]) {
        const expr: Expr = t < W.ninety - LEAD ? (["neutral", "smile", "stern", "smile_closed"] as Expr[])[i % 4] : t < W.notbad - LEAD ? "shock" : (["shock", "relief_open", "grin"] as Expr[])[i % 3];
        if (cam.pos.distanceTo(tmp.set(x, 5, z)) > 2.6) out.places.push(person(cam, pas(i + 120), x + 0.02, 4.02, z, { mode: "sit", expr, blink: lidAt(t, i + 120, [W.ninety]) }));
        i++;
      }
      // the key on its cushion, standing up for the camera, a slow glint
      out.fx.push({ key: "key", cw: 600, ch: 260, draw: (pp) => fxKey(pp), x: CUSHION[0], y: 5.16, z: CUSHION[2], w: 0.36, h: 0.156, rot: 0.15 });
      if (f >= 1992) { const u = ((f - 1992) % 40) / 40; out.fx.push({ key: `tw${q(Math.sin(u * Math.PI), 20)}`, cw: 200, ch: 200, draw: (pp) => fxTwinkle(pp, Math.max(0.05, q(Math.sin(u * Math.PI), 20))), x: CUSHION[0] + 0.12, y: 5.24, z: CUSHION[2] - 0.05, w: 0.2, h: 0.2 }); }
      break;
    }
  }
  void KEEL;
  return out;
};
