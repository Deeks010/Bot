// RMS Titanic, built procedurally in the ship frame (bow +z, waterline y 0, port +x): hull halves with painted plating
// and portholes (an emissive mask lights them at night), white superstructure with window rows, four raked buff funnels
// with black tops, masts + Marconi wires, the crow's nest with its bell and binocular locker, lifeboats, dressing flags,
// and a cutaway interior (16 compartments, bulkheads stopping at E deck, boilers, water boxes) for the explanation.
import * as THREE from "three";
import { ctex, rep } from "./paint";
import { Batch, V, box, lam, phong, quad, T, TR } from "./kit";
import { NOINK } from "./ink";
import {
  hwAt, topAt, BOW, STERN, BOAT_DECK, FUNNELS, FOREMAST, MAINMAST, NEST, NEST_Y, BULKHEADS, BH_TOP, KEEL, CZ, LOCKER, BELL, V3, RADIO,
} from "./story";

// ---------------- painted textures ----------------
const ZS0 = -134, ZS1 = BOW, YV0 = KEEL - 1, YV1 = 16.5;
const zOfU = (u: number) => ZS0 + (ZS1 - ZS0) * u;
const PORT_ROWS = [3.2, 5.9, 8.6, 10.9];
/** hull plating 4096 x 512: u = z (stern -> bow), v = y (keel -> 16.5). glow = porthole mask only */
const hullPaint = (glow: boolean) => ctex(glow ? "hullGlow" : "hullCol", 4096, 512, (g, r) => {
  const W = 4096, H = 512, yOf = (y: number) => H - ((y - YV0) / (YV1 - YV0)) * H;
  g.fillStyle = glow ? "#000000" : "#25232b"; g.fillRect(0, 0, W, H);
  if (!glow) {
    g.fillStyle = "#9b3328"; g.fillRect(0, yOf(-0.2), W, H - yOf(-0.2)); // red antifouling below the boot-top
    g.fillStyle = "#161519"; g.fillRect(0, yOf(0.5), W, yOf(-0.2) - yOf(0.5));
    // plating: faint strakes and butts
    g.strokeStyle = "rgba(255,255,255,0.05)"; g.lineWidth = 2;
    for (let y = -8; y < 15; y += 2.2) { g.beginPath(); g.moveTo(0, yOf(y)); g.lineTo(W, yOf(y)); g.stroke(); }
    g.strokeStyle = "rgba(0,0,0,0.25)";
    for (let x = 0; x < W; x += 34 + r() * 6) { g.beginPath(); g.moveTo(x, yOf(14)); g.lineTo(x, yOf(-9)); g.stroke(); }
  }
  for (let px = 0; px < W; px++) {
    const z = zOfU(px / W), top = topAt(z);
    if (!glow) {
      // white superstructure strake above the sheer, gold line at the sheer
      g.fillStyle = "#f2efe6"; g.fillRect(px, 0, 1, yOf(top - 0.05));
      g.fillStyle = "#d9a640"; g.fillRect(px, yOf(top - 0.35), 1, 4);
    }
  }
  // portholes (each row stops short of the ends)
  for (const y of PORT_ROWS) for (let z = -108; z < 112; z += 1.7) {
    if (y > topAt(z) - 1.2 || (y < 6 && Math.abs(z) > 98)) continue;
    const x = ((z - ZS0) / (ZS1 - ZS0)) * W, yy = yOf(y), lit = glow ? r() < 0.82 : true;
    if (!lit) continue;
    g.fillStyle = glow ? (r() < 0.15 ? "#ffd27a" : "#ffe9b8") : "#e9e2cf";
    g.beginPath(); g.ellipse(x, yy, 3.1, 7.5, 0, 0, Math.PI * 2); g.fill();
    if (!glow) { g.fillStyle = "#3a3f55"; g.beginPath(); g.ellipse(x, yy, 2.0, 5.2, 0, 0, Math.PI * 2); g.fill(); }
  }
});
/** white deck-house panels with a row of windows: 1024 x 256 tile = 8 m x 2 m (window row centred) */
const housePaint = (glow: boolean) => ctex(glow ? "houseGlow" : "houseCol", 1024, 256, (g, r) => {
  g.fillStyle = glow ? "#000000" : "#f3f0e7"; g.fillRect(0, 0, 1024, 256);
  if (!glow) { g.fillStyle = "#d9d4c6"; g.fillRect(0, 226, 1024, 30); g.fillStyle = "#e3ddcf"; for (let x = 0; x < 1024; x += 128) g.fillRect(x, 0, 6, 256); }
  for (let i = 0; i < 4; i++) {
    const x = 40 + i * 256;
    if (glow) { if (r() < 0.8) { g.fillStyle = r() < 0.2 ? "#ffcf72" : "#ffe6ad"; g.fillRect(x, 70, 176, 104); } continue; }
    g.fillStyle = "#3b4560"; g.fillRect(x, 70, 176, 104);
    g.fillStyle = "#56627f"; g.fillRect(x + 6, 76, 80, 92);
    g.strokeStyle = "#2a2f3e"; g.lineWidth = 8; g.strokeRect(x, 70, 176, 104); g.beginPath(); g.moveTo(x + 88, 70); g.lineTo(x + 88, 174); g.stroke();
  }
});
const deckPaint = () => ctex("shipDeck", 512, 512, (g, r) => {
  g.fillStyle = "#d8bf94"; g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 32) {
    g.fillStyle = `hsl(36, ${30 + r() * 10}%, ${68 + r() * 8}%)`; g.fillRect(0, y + 2, 512, 28);
    g.fillStyle = "#6e5a44"; g.fillRect(0, y, 512, 2);
    for (let x = r() * 200; x < 512; x += 180 + r() * 120) g.fillRect(x, y, 2, 32);
  }
});
const steelPaint = () => ctex("steelIn", 512, 512, (g) => {
  g.fillStyle = "#c9c2b2"; g.fillRect(0, 0, 512, 512);
  g.fillStyle = "#b3ab99"; for (let x = 0; x < 512; x += 64) g.fillRect(x, 0, 10, 512); // frames
  g.fillStyle = "#a59d8a"; for (let y = 0; y < 512; y += 128) g.fillRect(0, y, 512, 4);
});

// ---------------- geometry ----------------
/** one side of the hull (s = +1 port, -1 starboard): grid z x levels, smooth normals, uv = (z, y) */
const hullSide = (s: number) => {
  const NZ = 180, LV = [KEEL, -7.5, -4, 0, 4, 8, 1], pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= NZ; i++) {
    const z = ZS0 + ((ZS1 - ZS0) * i) / NZ, top = topAt(z), hw = hwAt(z);
    for (let j = 0; j < LV.length; j++) {
      const y = j === LV.length - 1 ? top : LV[j];
      const k = y < 0 ? 0.86 + 0.14 * (1 + y / -KEEL) : 1; // tumble-in toward the keel
      pos.push(s * hw * k, y, z);
      uv.push((z - ZS0) / (ZS1 - ZS0), (y - YV0) / (YV1 - YV0));
    }
  }
  const L = LV.length;
  for (let i = 0; i < NZ; i++) for (let j = 0; j < L - 1; j++) {
    const a = i * L + j, b = (i + 1) * L + j, c = (i + 1) * L + j + 1, d = i * L + j + 1;
    if (s > 0) idx.push(a, d, c, a, c, b); else idx.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
};
/** the main deck between the two sheer lines */
const topDeck = () => {
  const NZ = 160, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= NZ; i++) {
    const z = ZS0 + ((ZS1 - ZS0) * i) / NZ, y = topAt(z), hw = hwAt(z);
    pos.push(-hw, y, z, hw, y, z); uv.push(-hw / 4, z / 4, hw / 4, z / 4);
  }
  for (let i = 0; i < NZ; i++) { const a = 2 * i; idx.push(a, a + 2, a + 3, a, a + 3, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
};
/** box with separate texture tiling along its length (x or z) and height: uv in metres / (tu, tv) */
const houseBox = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tu = 8, tv = 2, vOff = 0) => {
  const w = x1 - x0, h = y1 - y0, d = z1 - z0, v0 = vOff / tv, v1 = v0 + h / tv;
  const parts = [
    quad(V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1), w / tu, v1, 0, v0),
    quad(V(x1, y0, z0), V(x0, y0, z0), V(x0, y1, z0), V(x1, y1, z0), w / tu, v1, 0, v0),
    quad(V(x0, y0, z0), V(x0, y0, z1), V(x0, y1, z1), V(x0, y1, z0), d / tu, v1, 0, v0),
    quad(V(x1, y0, z1), V(x1, y0, z0), V(x1, y1, z0), V(x1, y1, z1), d / tu, v1, 0, v0),
  ];
  return parts;
};
/** lifeboat: half-ellipsoid hull + gunwale, centred at (x, y = keel, z) */
const boatGeo = (() => {
  const g = new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  g.scale(1.1, 1.0, 4.4); g.translate(0, 1.0, 0);
  return g;
})();
const gunwaleGeo = (() => { const g = new THREE.TorusGeometry(1, 0.09, 6, 24); g.rotateX(Math.PI / 2); g.scale(1.12, 1, 4.42); g.translate(0, 1.0, 0); return g; })();
const bellGeo = (() => {
  const pts = [[0, 0.42], [0.06, 0.41], [0.12, 0.36], [0.15, 0.24], [0.17, 0.12], [0.22, 0.03], [0.25, 0], [0.0, 0]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts.slice(0, 7), 24);
  return g;
})();

export type ShipParts = {
  root: THREE.Group; starboard: THREE.Mesh; interior: THREE.Group; water: THREE.Mesh[]; boatsAll: THREE.Group; flags: THREE.Group;
  glows: THREE.MeshLambertMaterial[]; smokeTops: V3[]; spills: THREE.Mesh[]; locker: THREE.Group; radio: THREE.Group; bell: THREE.Mesh;
};

export const buildShip = (): ShipParts => {
  const root = new THREE.Group();
  // ---- materials ----
  const hullM = lam("hull", () => ({ map: hullPaint(false), emissiveMap: hullPaint(true), emissive: new THREE.Color(0, 0, 0) }), 0.6);
  const houseM = lam("house", () => ({ map: housePaint(false), emissiveMap: housePaint(true), emissive: new THREE.Color(0, 0, 0) }));
  for (const m of [hullM, houseM]) for (const t of [m.map!, m.emissiveMap!]) { t.anisotropy = 16; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; }
  hullM.map!.wrapS = hullM.map!.wrapT = THREE.ClampToEdgeWrapping; hullM.emissiveMap!.wrapS = hullM.emissiveMap!.wrapT = THREE.ClampToEdgeWrapping;
  const whiteM = lam("shipWhite", () => ({ color: "#f1eee6" }));
  const deckM = lam("shipDeckM", () => ({ map: deckPaint() }));
  const buffM = lam("buff", () => ({ color: "#d58a36" }));
  const blackM = lam("funnelTop", () => ({ color: "#1d1b22" }), 0.5);
  const mastM = lam("mast", () => ({ color: "#8c6a50" }));
  const nestM = lam("nest", () => ({ color: "#ece3cc" }));
  const boatM = lam("boat", () => ({ color: "#f4f2ea" }));
  const gunM = lam("gunwale", () => ({ color: "#9a6a42" }));
  const brassM = phong("brass", () => ({ color: "#d6a33e", specular: "#fff0b0", shininess: 50 }));
  const woodM = lam("lockerWood", () => ({ color: "#8a5a34" }));
  const wireM = lam("wire", () => ({ color: "#2a2730" }), 0.3);
  const glows = [hullM, houseM];
  const b = new Batch();
  // ---- hull ----
  const port = new THREE.Mesh(hullSide(1), hullM), starboard = new THREE.Mesh(hullSide(-1), hullM);
  for (const m of [port, starboard]) { m.castShadow = true; m.receiveShadow = true; root.add(m); }
  b.add(topDeck(), deckM);
  // ---- superstructure ----
  const H = (x: number, y0: number, z0: number, y1: number, z1: number, mat: THREE.Material = houseM, vOff = 0) => {
    for (const q of houseBox(-x, y0, z0, x, y1, z1, 8, 2, vOff)) b.add(q, mat);
    b.add(box(-x, y1 - 0.01, z0, x, y1 + 0.12, z1), whiteM);
  };
  H(13.2, 12, -96, 15, 80, houseM, 0.5);   // B deck
  H(12.8, 15, -72, BOAT_DECK, 64, houseM, 0.5); // A deck
  b.add(box(-12.8, BOAT_DECK + 0.121, -72, 12.8, BOAT_DECK + 0.14, 64), deckM); // boat deck planking
  H(8, BOAT_DECK, 52, BOAT_DECK + 2.8, 64, houseM, 0.4); // officers' quarters
  b.add(box(-13.4, BOAT_DECK + 0.6, 62.6, 13.4, BOAT_DECK + 2.2, 64.4), whiteM); // bridge + wings
  b.add(box(-13.4, BOAT_DECK + 2.2, 62.4, 13.4, BOAT_DECK + 2.45, 64.6), whiteM);
  for (const [z0, z1] of [[-64, -46], [-30, -18], [-5, 5], [20, 33]]) H(5.6, BOAT_DECK, z0, BOAT_DECK + 2.5, z1, houseM, 0.25);
  H(9, 14.4, -126, 16.6, -110, houseM, 0.3); // poop house
  b.add(box(-2.5, 15, 104, 2.5, 16.2, 110), whiteM); // windlass house on the forecastle
  // rails along the boat deck and forecastle edges (thin white bars; the ink makes them read)
  for (const s of [-1, 1]) {
    b.add(box(s * 12.75, BOAT_DECK + 1.0, -72, s * 12.65, BOAT_DECK + 1.08, 62.5), whiteM);
    for (let z = -72; z <= 62; z += 2.4) b.add(box(s * 12.73, BOAT_DECK, z - 0.04, s * 12.67, BOAT_DECK + 1.0, z + 0.04), whiteM);
  }
  // ---- funnels: elliptical, raked aft; buff with black tops; dark mouths ----
  FUNNELS.forEach((z) => {
    const m = TR(0, BOAT_DECK + 0.5, z, -0.12, 0, 0);
    const body = new THREE.CylinderGeometry(1, 1, 16.5, 28, 1, true); body.translate(0, 8.25, 0); body.scale(3.1, 1, 4.3);
    const top = new THREE.CylinderGeometry(1, 1, 3.8, 28, 1, true); top.translate(0, 16.5 + 1.9, 0); top.scale(3.12, 1, 4.32);
    const mouth = new THREE.CircleGeometry(1, 28); mouth.rotateX(-Math.PI / 2); mouth.translate(0, 20.0, 0); mouth.scale(3.0, 1, 4.2);
    b.add(body, buffM, m); b.add(top, blackM, m); b.add(mouth, blackM, m);
    const band = new THREE.CylinderGeometry(1, 1, 0.5, 28, 1, true); band.translate(0, 0.25, 0); band.scale(3.25, 1, 4.45);
    b.add(band, buffM, m);
  });
  // ---- masts, wires, stays ----
  const pole = (a: V3, c: V3, r: number, mat: THREE.Material, bt: Batch = b) => {
    const A = V(...a), C = V(...c), g = new THREE.CylinderGeometry(r, r, A.distanceTo(C), 8);
    bt.add(g, mat, new THREE.Matrix4().compose(A.clone().add(C).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), C.clone().sub(A).normalize()), V(1, 1, 1)));
  };
  const FT: V3 = [0, 62, FOREMAST[2] - 1.6], MT: V3 = [0, 58, MAINMAST[2] - 1.4];
  pole(FOREMAST, FT, 0.45, mastM); pole(MAINMAST, MT, 0.42, mastM);
  pole([0, 41, FOREMAST[2] - 0.7], [0, 41, FOREMAST[2] + 2.4], 0.12, mastM); // yard stubs
  for (const dx of [-1.2, 1.2]) pole([dx, 61.5, FT[2]], [dx, 57.5, MT[2]], 0.06, wireM); // Marconi aerial
  pole([0, 60, FT[2]], [0, topAt(128) + 0.3, 128], 0.07, wireM); // fore stay
  pole([0, 56, MT[2]], [0, topAt(-128) + 0.3, -128], 0.07, wireM);
  for (const s of [-1, 1]) { pole([0, 55, FT[2]], [s * hwAt(96), topAt(96), 96], 0.05, wireM); pole([0, 52, MT[2]], [s * hwAt(-98), topAt(-98), -98], 0.05, wireM); }
  // ---- crow's nest: open barrel on the foremast, bell above, binocular locker inside ----
  const barrel = new THREE.CylinderGeometry(1.25, 1.12, 0.88, 24, 1, true); barrel.translate(0, 0.44, 0);
  b.add(barrel, nestM, T(NEST[0], NEST_Y, NEST[2]));
  const rim = new THREE.TorusGeometry(1.25, 0.06, 6, 28); rim.rotateX(Math.PI / 2);
  b.add(rim, gunM, T(NEST[0], NEST_Y + 0.88, NEST[2]));
  const floor = new THREE.CircleGeometry(1.12, 24); floor.rotateX(-Math.PI / 2);
  b.add(floor, deckM, T(NEST[0], NEST_Y + 0.01, NEST[2]));
  const under = new THREE.CircleGeometry(1.12, 24); under.rotateX(Math.PI / 2);
  b.add(under, nestM, T(NEST[0], NEST_Y, NEST[2]));
  pole([0, NEST_Y + 2.6, FOREMAST[2] + 0.3], [BELL[0], BELL[1] + 0.42, BELL[2]], 0.04, wireM);
  const bell = new THREE.Mesh(bellGeo, brassM); bell.position.set(BELL[0], BELL[1], BELL[2]); bell.castShadow = true; root.add(bell);
  pole([BELL[0], BELL[1] + 0.42, BELL[2] - 0.2], [BELL[0], BELL[1] + 0.42, BELL[2] + 0.02], 0.03, wireM);
  // locker: wooden box on the nest wall, glass door showing the binoculars, brass padlock
  const locker = new THREE.Group();
  const L = LOCKER;
  const lb = new THREE.Mesh(box(-0.3, -0.26, -0.14, 0.3, 0.26, 0.14), woodM); locker.add(lb);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.36), new THREE.MeshBasicMaterial({ map: binocularsTex(), toneMapped: true }));
  glass.position.set(0, 0.0, 0.142); glass.layers.set(NOINK); locker.add(glass);
  const frameG = new THREE.Mesh(box(-0.25, -0.21, 0.14, 0.25, 0.21, 0.16), woodM); frameG.visible = false; locker.add(frameG);
  const lock = new THREE.Mesh(box(-0.045, -0.06, 0, 0.045, 0.03, 0.04), brassM); lock.position.set(0.24, -0.02, 0.15); locker.add(lock);
  const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.009, 6, 16, Math.PI), brassM); shackle.position.set(0.24, 0.01, 0.17); locker.add(shackle);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.012, 10), new THREE.MeshBasicMaterial({ color: "#100c08" })); hole.position.set(0.24, -0.025, 0.1905); hole.layers.set(NOINK); locker.add(hole);
  locker.position.set(L[0], L[1], L[2]); locker.rotation.y = -0.55;
  locker.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  root.add(locker);
  // ---- lifeboats (16 in davits) + extra rows for "lifeboats for everyone" ----
  const BZ = [56, 47, 38, 29, -44, -53, -62, -71];
  for (const s of [-1, 1]) for (const z of BZ) {
    b.add(boatGeo, boatM, T(s * 11.6, BOAT_DECK + 0.35, z)); b.add(gunwaleGeo, gunM, T(s * 11.6, BOAT_DECK + 0.35, z));
    for (const dz of [-3.4, 3.4]) b.add(box(s * 12.55, BOAT_DECK, z + dz - 0.1, s * 12.75, BOAT_DECK + 2.6, z + dz + 0.1), blackM);
  }
  const boatsAll = new THREE.Group();
  { const bb = new Batch();
    for (const s of [-1, 1]) for (const x of [8.9, 6.6]) for (let z = 46; z > -78; z -= 9.6) {
      if (Math.abs(x) < 7 && FUNNELS.some((fz) => Math.abs(fz - z) < 7)) continue;
      bb.add(boatGeo, boatM, T(s * x, BOAT_DECK + 2.6 + (x < 7 ? 0 : 0), z)); bb.add(gunwaleGeo, gunM, T(s * x, BOAT_DECK + 2.6, z));
    }
    for (const s of [-1, 1]) for (const z of [20, 11, 2, -7, -16, -25, -34]) { bb.add(boatGeo, boatM, T(s * 11.6, BOAT_DECK + 0.35, z)); bb.add(gunwaleGeo, gunM, T(s * 11.6, BOAT_DECK + 0.35, z)); }
    bb.build(boatsAll); }
  boatsAll.visible = false; root.add(boatsAll);
  // ---- dressing flags (departure day): bow -> foremast -> mainmast -> stern ----
  const flags = new THREE.Group();
  { const pen = new THREE.BufferGeometry();
    pen.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -0.45, 0, 0, 0.45, 0, -1.2, 0], 3)); pen.computeVertexNormals();
    const pts: THREE.Vector3[] = [];
    const seg = (a: V3, c: V3, n: number, sag: number) => { for (let i = 0; i < n; i++) { const u = i / n; pts.push(V(a[0] + (c[0] - a[0]) * u, a[1] + (c[1] - a[1]) * u - sag * 4 * u * (1 - u), a[2] + (c[2] - a[2]) * u)); } };
    seg([0, topAt(129) + 0.5, 129.5], FT, 34, 4); seg(FT, MT, 90, 9); seg(MT, [0, topAt(-131) + 0.5, -131], 30, 4);
    const fm = lam("pennant", () => ({ side: THREE.DoubleSide }));
    const im = new THREE.InstancedMesh(pen, fm, pts.length);
    const cols = ["#d23b3b", "#f3d35a", "#3f6fb5", "#f7f1e1", "#2f8a4f"].map((c) => new THREE.Color(c));
    const m4 = new THREE.Matrix4();
    pts.forEach((p, i) => { im.setMatrixAt(i, m4.compose(p, new THREE.Quaternion(), V(1, 1, 1))); im.setColorAt(i, cols[i % 5]); });
    im.castShadow = true; flags.add(im);
    const fb = new Batch();
    for (let i = 0; i < pts.length - 1; i++) pole([pts[i].x, pts[i].y, pts[i].z], [pts[i + 1].x, pts[i + 1].y, pts[i + 1].z], 0.03, wireM, fb);
    fb.build(flags);
  }
  root.add(flags);
  // ---- radio set (night shot 18): desk, set with dials, lamp ----
  const radio = new THREE.Group();
  { const R = RADIO;
    const desk = new THREE.Mesh(box(-0.8, 0, -0.35, 0.8, 0.78, 0.35), woodM); desk.position.set(R[0], R[1], R[2] - 0.55);
    const set = new THREE.Mesh(box(-0.55, 0, -0.18, 0.55, 0.5, 0.18), lam("radioSet", () => ({ color: "#3a3d47" }))); set.position.set(R[0] - 0.62, R[1] + 0.78, R[2] - 0.62); set.scale.set(0.7, 0.8, 1);
    const dial = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.36), new THREE.MeshBasicMaterial({ map: dialsTex() })); dial.position.set(R[0] - 0.62, R[1] + 0.98, R[2] - 0.439); dial.scale.set(0.7, 0.8, 1); dial.layers.set(NOINK);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.4, 1.2) })); lamp.position.set(R[0] + 0.62, R[1] + 1.12, R[2] - 0.6);
    const lampPole = new THREE.Mesh(box(-0.015, 0, -0.015, 0.015, 0.34, 0.015), blackM); lampPole.position.set(R[0] + 0.62, R[1] + 0.78, R[2] - 0.6);
    radio.add(desk, set, dial, lamp, lampPole);
    radio.traverse((o) => { o.castShadow = true; o.receiveShadow = true; }); }
  radio.visible = false; root.add(radio);
  b.build(root);

  // ---- cutaway interior: back wall (port inner side), tank top, decks, bulkheads, boilers, water ----
  const interior = new THREE.Group();
  const ib = new Batch();
  const steelM = lam("steelInM", () => ({ map: rep(steelPaint(), 1, 1) }));
  const bhM = lam("bulkhead", () => ({ color: "#b8ae99" }));
  const wallM = lam("bulkWall", () => ({ color: "#8a7f72" }));
  const boilerM = lam("boiler", () => ({ color: "#4a4650" }), 0.4);
  const engM = lam("engine", () => ({ color: "#6b6f7a" }), 0.4);
  for (let k = 0; k < CZ.length - 1; k++) {
    const z1 = CZ[k], z0 = CZ[k + 1], zm = (z0 + z1) / 2, hw = Math.max(0.6, hwAt(zm) * 0.93);
    ib.add(quad(V(hw, KEEL, z0), V(hw, KEEL, z1), V(hw, topAt(zm) - 0.2, z1), V(hw, topAt(zm) - 0.2, z0), (z1 - z0) / 8, 2.5).rotateY(0), steelM);
    ib.add(box(-hwAt(zm) * 0.9, KEEL - 0.4, z0, hw, KEEL, z1), bhM);
  }
  // fix the back wall's facing: it must face -x (toward the starboard camera)
  BULKHEADS.forEach((z) => { const hw = hwAt(z) * 0.95; ib.add(box(-hw, KEEL, z - 0.45, hw, BH_TOP, z + 0.45), wallM); });
  for (const y of [8.5]) for (let k = 0; k < CZ.length - 1; k++) {
    const z1 = CZ[k], z0 = CZ[k + 1], hw = hwAt((z0 + z1) / 2) * 0.93;
    if (hw < 1) continue;
    ib.add(box(-hw, y - 0.25, z0 + 0.25, hw, y, z1 - 0.25), bhM);
  }
  // boilers in the boiler rooms (between the forward holds and the engines), engines aft
  for (let k = 5; k <= 10; k++) {
    const z1 = CZ[k], z0 = CZ[k + 1];
    for (const x of [-6.5, -1, 4.5]) for (const zz of [z0 + 4, z1 - 4]) {
      const cyl = new THREE.CylinderGeometry(2.2, 2.2, 5.5, 18); cyl.rotateZ(Math.PI / 2);
      ib.add(cyl, boilerM, T(x, KEEL + 2.6, zz));
    }
  }
  ib.add(box(-6, KEEL, -54, 6, KEEL + 9, -42), engM); ib.add(box(-4, KEEL, -70, 4, KEEL + 7, -58), engM);
  ib.build(interior);
  const water: THREE.Mesh[] = [];
  const wm = lam("floodWater", () => ({ color: "#3d8fe0", emissive: new THREE.Color("#0b2a66") }));
  for (let k = 0; k < CZ.length - 1; k++) {
    const z1 = CZ[k], z0 = CZ[k + 1], hw = Math.max(0.6, hwAt((z0 + z1) / 2) * 0.92);
    const g = box(-hw, 0, z0 + 0.25, hw, 1, z1 - 0.25);
    const m = new THREE.Mesh(g, wm); m.position.y = KEEL; m.scale.y = 0.001; m.visible = false;
    water.push(m); interior.add(m);
  }
  // waterfalls over the tops of the bulkheads (index i = the wall between compartment i and i + 1)
  const spills: THREE.Mesh[] = [];
  const sm = new THREE.MeshBasicMaterial({ color: new THREE.Color("#8fd0ff"), transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  BULKHEADS.forEach((z, i) => {
    const hw = hwAt(z) * 0.9;
    const g = new THREE.PlaneGeometry(2 * hw, 1); g.translate(0, -0.5, 0);
    const m = new THREE.Mesh(g, sm); m.position.set(0, BH_TOP + 0.35, z - 0.45); m.visible = false; m.layers.set(NOINK);
    spills.push(m); interior.add(m);
  });
  interior.visible = false; root.add(interior);
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !m.layers.isEnabled(NOINK)) { m.castShadow = true; m.receiveShadow = true; } });
  const smokeTops: V3[] = FUNNELS.slice(0, 3).map((z) => [0, BOAT_DECK + 0.5 + 20.2, z - 2.4]);
  return { root, starboard, interior, water, boatsAll, flags, glows, smokeTops, spills, locker, radio, bell };
};

const binocularsTex = () => ctex("binoculars", 440, 360, (g) => {
  g.fillStyle = "#2c3a52"; g.fillRect(0, 0, 440, 360);
  g.fillStyle = "rgba(190,220,255,0.25)"; g.beginPath(); g.moveTo(0, 0); g.lineTo(150, 0); g.lineTo(0, 150); g.fill();
  const ink = "#1a1420";
  for (const x of [150, 290]) {
    g.fillStyle = "#3a3330"; g.strokeStyle = ink; g.lineWidth = 10;
    g.beginPath(); g.roundRect(x - 55, 120, 110, 170, 26); g.fill(); g.stroke();
    g.fillStyle = "#c79a3a"; g.beginPath(); g.ellipse(x, 290, 50, 22, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = "#6f8fb8"; g.beginPath(); g.ellipse(x, 290, 30, 12, 0, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = "#3a3330"; g.fillRect(200, 160, 40, 40); g.strokeRect(200, 160, 40, 40);
  g.strokeStyle = "#e8e0cc"; g.lineWidth = 18; g.strokeRect(9, 9, 422, 342);
  g.strokeStyle = ink; g.lineWidth = 6; g.strokeRect(2, 2, 436, 356);
});
const dialsTex = () => ctex("dials", 512, 200, (g) => {
  g.fillStyle = "#2f323b"; g.fillRect(0, 0, 512, 200);
  for (const [x, c] of [[90, "#f3e6c0"], [230, "#f3e6c0"], [370, "#f3e6c0"]] as const) {
    g.fillStyle = c; g.beginPath(); g.arc(x, 100, 48, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#1a1420"; g.lineWidth = 8; g.stroke();
    g.beginPath(); g.moveTo(x, 100); g.lineTo(x + 30, 70); g.stroke();
  }
  g.fillStyle = "#ff6a3a"; g.beginPath(); g.arc(470, 60, 16, 0, Math.PI * 2); g.fill();
});
