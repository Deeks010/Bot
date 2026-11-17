// The whole short as one three.js scene. Ship frame = world frame (bow +z, waterline y 0, quay on the port side +x).
// Sets are groups toggled per shot: sea (ocean, iceberg, wake, stars), dock (Southampton quay, sheds, crowd), the
// ice-tray table (on the quay), the auction room (on the quay), lifeboats at sea. update(id, f, camera) poses
// everything for shot `id` at frame f (pure function of id + f), like the bridge short.
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ctex, rep, cobbleHD, stoneHD, cloudHD, waterNear, waterFar, facadeHD, roofHD, planksHD, rng } from "./paint";
import { Pen } from "./toon";
import { LIGHTS, LOOK, LightPreset, LightName } from "./lights";
import { TONE, CHAR, LFB, untone } from "./shade";
import { NOINK } from "./ink";
import { Batch, V, box, lam, phong, T, quad } from "./kit";
import { buildShip, ShipParts } from "./ship";
import { Pool, Actor, Fx, stage } from "./cast";
import {
  FPS, SHOTS, ShotDef, V3, camAt, bergAt, shipYaw, floodAt, cutTrim, sinkPose, TRAY_AT, TRAY_CELLS, trayFill, trayTilt, W, SHIP_SPEED, KEEL,
  ROOM, PODIUM, CUSHION, smooth, clamp01,
} from "./story";

const SMOKE = () => ctex("smoke", 256, 256, (g) => {
  const p = new Pen(g);
  for (const [x, y, r, c] of [[90, 150, 60, "#8f8d96"], [150, 120, 70, "#a3a1aa"], [170, 165, 55, "#8f8d96"], [120, 100, 50, "#b4b2ba"]] as const) p.ell(x, y, r, r * 0.85, c, 0);
});
const DOT = () => ctex("starDot", 64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,0.9)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
/** star reflections on calm water: sparse soft dots in the blue channel (1024 tile = 60 m) */
const STAR_WATER = () => ctex("starWater", 1024, 1024, (g, r) => {
  g.fillStyle = "#000"; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 70; i++) {
    const x = r() * 1024, y = r() * 1024, s = 1.5 + r() * 2;
    g.fillStyle = `rgba(0,0,255,${0.35 + 0.4 * r()})`; g.beginPath(); g.ellipse(x, y, s * 1.3, s, 0, 0, Math.PI * 2); g.fill();
  }
});
const FOAM = () => ctex("foam", 256, 1024, (g, r) => {
  g.fillStyle = "rgba(0,0,0,0)"; g.clearRect(0, 0, 256, 1024);
  for (let i = 0; i < 220; i++) {
    const x = 128 + (r() - 0.5) * 200 * (0.4 + 0.6 * r()), y = r() * 1024, w = 6 + r() * 20, h = 20 + r() * 70;
    g.fillStyle = `rgba(235,244,255,${0.25 + 0.5 * r()})`; g.beginPath(); g.ellipse(x, y, w, h, 0, 0, Math.PI * 2); g.fill();
  }
});
const WALLPAPER = () => ctex("wallpaper", 512, 512, (g, r) => {
  g.fillStyle = "#2f5a4a"; g.fillRect(0, 0, 512, 512);
  g.fillStyle = "#3b6b58";
  for (let y = 0; y < 512; y += 64) for (let x = (y / 64) % 2 ? 32 : 0; x < 512; x += 64) {
    g.beginPath(); g.moveTo(x, y - 14); g.lineTo(x + 10, y); g.lineTo(x, y + 14); g.lineTo(x - 10, y); g.fill();
  }
  g.fillStyle = "#264a3c"; for (let x = 0; x < 512; x += 128) g.fillRect(x, 0, 3, 512);
  void r;
});
const PAINTING = (kind: number) => ctex("painting" + kind, 512, 384, (g) => {
  g.fillStyle = "#8a5a2a"; g.fillRect(0, 0, 512, 384);
  g.fillStyle = "#c9a24a"; g.fillRect(14, 14, 484, 356);
  if (kind === 0) {
    const sky = g.createLinearGradient(0, 30, 0, 250); sky.addColorStop(0, "#5c86c7"); sky.addColorStop(1, "#cfe0f0");
    g.fillStyle = sky; g.fillRect(30, 30, 452, 230);
    g.fillStyle = "#3a6ea0"; g.fillRect(30, 250, 452, 104);
    g.fillStyle = "#1d1b22"; g.beginPath(); g.moveTo(80, 236); g.lineTo(440, 236); g.lineTo(420, 262); g.lineTo(100, 262); g.fill();
    g.fillStyle = "#f2efe6"; g.fillRect(140, 220, 250, 16);
    g.fillStyle = "#d58a36"; for (const x of [180, 230, 280, 330]) g.fillRect(x, 170, 22, 50);
    g.fillStyle = "#1d1b22"; for (const x of [180, 230, 280, 330]) g.fillRect(x, 170, 22, 12);
  } else {
    g.fillStyle = "#e8d9b8"; g.fillRect(30, 30, 452, 324);
    g.fillStyle = "#6a4a3a"; g.beginPath(); g.ellipse(256, 170, 70, 90, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#2e2a36"; g.fillRect(170, 250, 172, 104);
  }
  g.strokeStyle = "#241726"; g.lineWidth = 10; g.strokeRect(5, 5, 502, 374);
});

type Mats = Record<string, THREE.Material>;
const D = 4; // quay top (m above the water)

export class World {
  root = new THREE.Group();
  private pool = new Pool();
  private actors: Actor[] = [];
  private fxs: Fx[] = [];
  private hemi: THREE.HemisphereLight; private sun: THREE.DirectionalLight;
  private sky: THREE.Mesh; private skyMat: THREE.ShaderMaterial;
  private stars: THREE.Points; private starMat: THREE.PointsMaterial;
  private fog = new THREE.Fog("#bccbec", 25, 420);
  private WU: Record<string, THREE.IUniform>; private waterM: THREE.MeshLambertMaterial;
  private sunCache = new Map<number, THREE.Vector3>();
  private clouds: THREE.Mesh[] = [];
  private ship: ShipParts; private shipFrame = new THREE.Group();
  private berg: THREE.Mesh; private wake: THREE.Mesh; private wakeTex: THREE.Texture; private bowWave: THREE.Mesh[] = [];
  private dock = new THREE.Group(); private traySet = new THREE.Group(); private room = new THREE.Group(); private seaBoats = new THREE.Group();
  private tray = new THREE.Group(); private trayWater: THREE.Mesh[] = []; private spill: THREE.Mesh[] = []; private stream: THREE.Mesh;
  private smoke: { m: THREE.Mesh; mat: THREE.MeshLambertMaterial; top: V3; k: number }[] = [];
  private lanterns: THREE.Mesh[] = [];
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private sph = new THREE.Sphere();

  constructor() {
    const R = this.root, M: Mats = {};
    // ---- sky + stars + light ----
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() },
        c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, e: { value: new THREE.Vector4() } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 c0, c1, c2, c3, c4; uniform vec4 e; varying vec3 vP;
        void main(){ float el = asin(clamp(normalize(vP).y, -1.0, 1.0));
          vec3 c = mix(c0, c1, smoothstep(0.0, e.x, el));
          c = mix(c, c2, smoothstep(e.x, e.y, el));
          c = mix(c, c3, smoothstep(e.y, e.z, el));
          c = mix(c, c4, smoothstep(e.z, e.w, el));
          gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), this.skyMat);
    this.sky.renderOrder = -1; this.sky.frustumCulled = false; this.sky.layers.set(NOINK);
    R.add(this.sky);
    { const r = rng(7), n = 2600, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const u = r(), el = Math.asin(0.03 + 0.97 * u ** 0.8), az = r() * Math.PI * 2, d = 2800;
        pos.set([d * Math.cos(el) * Math.cos(az), d * Math.sin(el), d * Math.cos(el) * Math.sin(az)], i * 3);
        const k = 0.5 + 1.6 * r() ** 3, warm = r();
        col.set([k * (0.85 + 0.15 * warm), k * 0.9, k * (1.05 - 0.15 * warm)], i * 3);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      this.starMat = new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, vertexColors: true, map: DOT(), transparent: true, depthWrite: false, fog: false });
      this.stars = new THREE.Points(g, this.starMat); this.stars.frustumCulled = false; this.stars.layers.set(NOINK); this.stars.renderOrder = -0.9;
      this.stars.onBeforeRender = (rd) => { const rt = rd.getRenderTarget(); this.starMat.size = 4.2 * ((rt ? rt.height : rd.domElement.height) / 1920); };
      R.add(this.stars); }
    this.hemi = new THREE.HemisphereLight("#cfe6ff", "#6c5c8c", 1.1);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.6);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(4096, 4096);
    R.add(this.hemi, this.sun, this.sun.target);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3, d = 1500 + (i % 3) * 150;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: cloudHD(i % 4), color: new THREE.Color(1.1, 1.1, 1.1), transparent: true, depthWrite: false, fog: false }));
      const w = 330 + (i % 4) * 80;
      m.position.set(Math.cos(a) * d, 260 + (i % 4) * 90, Math.sin(a) * d); m.scale.set(w, w / 2, 1);
      m.layers.set(NOINK); this.clouds.push(m); R.add(m);
    }

    // ---- ocean ----
    const wNear = waterNear(), wFar = waterFar(), sw = STAR_WATER();
    for (const t of [wNear, wFar, sw]) { t.colorSpace = THREE.NoColorSpace; t.anisotropy = 16; t.needsUpdate = true; }
    this.WU = {
      wNearC: { value: new THREE.Color() }, wMidC: { value: new THREE.Color() }, wFarC: { value: new THREE.Color() },
      wCrest: { value: new THREE.Color() }, wTrough: { value: new THREE.Color() }, wGlint: { value: new THREE.Color() },
      wShade: { value: new THREE.Vector3(0.5, 0.56, 0.72) }, wNearTex: { value: wNear }, wFarTex: { value: wFar }, wStarTex: { value: sw },
      wFlow: { value: new THREE.Vector2() }, wCalm: { value: 0 }, wAlpha: { value: 1 },
    };
    this.waterM = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: false });
    this.waterM.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.WU);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWP;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", WATER_DECL).replace("#include <map_fragment>", WATER_COL)
        .replace("#include <lights_fragment_begin>", "float sunVis = 1.0;\n" + LFB)
        .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\n  reflectedLight.directDiffuse = diffuseColor.rgb * mix(wShade, vec3(1.0), sunVis);\n  reflectedLight.indirectDiffuse = vec3(0.0);")
        .replace("#include <opaque_fragment>", "#include <opaque_fragment>\n  gl_FragColor.a = wAlpha;");
    };
    this.waterM.customProgramCacheKey = () => "ocean2";
    const ocean = new THREE.Mesh(quad(V(-6000, 0, 6000), V(6000, 0, 6000), V(6000, 0, -6000), V(-6000, 0, -6000)), this.waterM);
    ocean.receiveShadow = true; ocean.renderOrder = 2; R.add(ocean);

    // ---- the ship (in a frame group that yaws during the swing) ----
    this.ship = buildShip();
    this.shipFrame.add(this.ship.root); R.add(this.shipFrame);
    // iceberg: displaced icosphere, faceted, lives in the ship frame
    { const g = mergeVertices(new THREE.IcosahedronGeometry(1, 2)), p = g.attributes.position as THREE.BufferAttribute, r = rng(11);
      const bumps = Array.from({ length: 9 }, () => [V(r() - 0.5, r() * 0.6, r() - 0.5).normalize(), 0.15 + 0.3 * r()] as const);
      for (let i = 0; i < p.count; i++) {
        const v = V(p.getX(i), p.getY(i), p.getZ(i)).normalize();
        let k = 1 + 0.12 * Math.sin(v.x * 7 + v.z * 5) + 0.08 * Math.sin(v.y * 11 + v.x * 3) + 0.06 * Math.sin(v.z * 13 - v.y * 6);
        for (const [d, a] of bumps) k += a * Math.max(0, v.dot(d) - 0.6) * 2.5;
        const peak = v.y > 0 ? 1 + 0.55 * Math.max(0, v.y - 0.3) * (0.6 + 0.4 * Math.sin(v.x * 4)) : 1;
        p.setXYZ(i, v.x * k, v.y * k * peak, v.z * k);
      }
      const ng = g.toNonIndexed(); ng.computeVertexNormals(); ng.scale(10, 10, 15); ng.translate(0, 1.5, 0);
      this.berg = new THREE.Mesh(ng, lam("ice", () => ({ color: "#cfeaf6" }), 0.5));
      this.berg.castShadow = true; this.berg.receiveShadow = true; this.shipFrame.add(this.berg); }
    // wake (flat foam strip behind the stern) + bow waves
    this.wakeTex = FOAM(); this.wakeTex.wrapT = THREE.RepeatWrapping; this.wakeTex.repeat.set(1, 3);
    this.wake = new THREE.Mesh(new THREE.PlaneGeometry(26, 420), new THREE.MeshBasicMaterial({ map: this.wakeTex, transparent: true, depthWrite: false, opacity: 0.6, fog: true }));
    this.wake.rotation.x = -Math.PI / 2; this.wake.position.set(0, 0.05, -134 - 210); this.wake.layers.set(NOINK); this.wake.renderOrder = 3;
    this.shipFrame.add(this.wake);
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 70), new THREE.MeshBasicMaterial({ map: this.wakeTex, transparent: true, depthWrite: false, opacity: 0.55 }));
      m.rotation.set(-Math.PI / 2, 0, s * 0.2); m.position.set(s * 9, 0.06, 95); m.layers.set(NOINK); m.renderOrder = 3;
      this.bowWave.push(m); this.shipFrame.add(m);
    }
    // smoke from the three working funnels
    const smokeT = SMOKE();
    for (const top of this.ship.smokeTops) for (let k = 0; k < 6; k++) {
      const mat = new THREE.MeshLambertMaterial({ map: smokeT, transparent: true, depthWrite: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); m.layers.set(NOINK);
      this.smoke.push({ m, mat, top, k: k / 6 }); this.shipFrame.add(m);
    }

    // ---- dock: quay, bollards, gangway, sheds, a crane ----
    const b = new Batch();
    M.cobble = lam("cobbleHD", () => ({ map: cobbleHD() }));
    M.wall = lam("quayWall", () => ({ map: stoneHD("quayHD", ["#bfb3a2", "#b4a896", "#c8bdad", "#ab9f8d"], "#8d8170") }));
    M.iron = phong("ironD", () => ({ color: "#3d414c", specular: "#8a8a8a", shininess: 60 }));
    M.wood = lam("gangWood", () => ({ color: "#9a6a42" }));
    M.white = lam("gangWhite", () => ({ color: "#f1eee6" }));
    M.red = lam("craneRed", () => ({ color: "#a8463a" }));
    const quayTop = new THREE.Mesh(quad(V(16.6, D, 300), V(320, D, 300), V(320, D, -300), V(16.6, D, -300), 76, 150), M.cobble);
    (M.cobble as THREE.MeshLambertMaterial).map!.wrapS = (M.cobble as THREE.MeshLambertMaterial).map!.wrapT = THREE.RepeatWrapping;
    quayTop.receiveShadow = true; this.dock.add(quayTop);
    b.add(quad(V(16.6, -8, 300), V(16.6, -8, -300), V(16.6, D, -300), V(16.6, D, 300), 150, 3), M.wall);
    b.add(box(16.6, D, -300, 17.4, D + 0.35, 300), M.wall);
    for (let z = -120; z <= 120; z += 12) { const c = new THREE.CylinderGeometry(0.28, 0.32, 0.7, 12); b.add(c, M.iron, T(18.2, D + 0.35, z)); }
    // gangway from the quay up to a door in the port side
    { const a = V(19.2, D, 7.5), c = V(14.2, 9.8, 7.5), len = a.distanceTo(c), mid = a.clone().add(c).multiplyScalar(0.5);
      const q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), c.clone().sub(a).normalize());
      b.add(box(-len / 2, -0.12, -1.0, len / 2, 0, 1.0), M.wood, new THREE.Matrix4().compose(mid, q, V(1, 1, 1)));
      for (const s of [-1, 1]) b.add(box(-len / 2, 0.95, s * 1.0 - 0.04, len / 2, 1.02, s * 1.0 + 0.04), M.white, new THREE.Matrix4().compose(mid, q, V(1, 1, 1)));
      b.add(box(13.9, 8.6, 6.0, 14.05, 11.2, 9.0), lam("door", () => ({ color: "#2b2730" }))); }
    // sheds (brick) with roofs, behind the crowd; one wall faces the tray table
    { const fac = facadeHD("shedL", 40, 11, { wall: "#c9b49a", shutter: "#4f6e5a", door: true, brick: true });
      const fac2 = facadeHD("shedS", 40, 11, { wall: "#c9b49a", shutter: "#4f6e5a", door: true, brick: true });
      const Mf = lam("shedFac", () => ({ map: fac })), Ms = lam("shedFac2", () => ({ map: fac2 }));
      for (const [z0, z1] of [[-150, -40], [-36, 60]]) {
        b.add(quad(V(46, D, z1), V(46, D, z0), V(46, D + 11, z0), V(46, D + 11, z1), (z1 - z0) / 40, 1), Mf);
        b.add(quad(V(86, D, z0), V(86, D, z1), V(86, D + 11, z1), V(86, D + 11, z0), (z1 - z0) / 40, 1), Ms);
        b.add(quad(V(86, D, z1), V(46, D, z1), V(46, D + 11, z1), V(86, D + 11, z1), 1, 1), Mf);
        b.add(quad(V(46, D, z0), V(86, D, z0), V(86, D + 11, z0), V(46, D + 11, z0), 1, 1), Mf);
        const Mr = lam("shedRoof", () => ({ map: rep(roofHD("#7a4a3e", true), 4, 4) }));
        for (const s of [-1, 1]) {
          const xe = s < 0 ? 45 : 87, ridge = V(66, D + 17, 0);
          b.add(s < 0 ? quad(V(xe, D + 11, z1), V(xe, D + 11, z0), V(66, ridge.y, z0), V(66, ridge.y, z1), 8, 3) : quad(V(xe, D + 11, z0), V(xe, D + 11, z1), V(66, ridge.y, z1), V(66, ridge.y, z0), 8, 3), Mr);
        }
        for (const z of [z0, z1]) { const tg = new THREE.BufferGeometry(); const sgn = z === z0 ? -1 : 1;
          const pts = sgn > 0 ? [46, D + 11, z, 86, D + 11, z, 66, D + 17, z] : [86, D + 11, z, 46, D + 11, z, 66, D + 17, z];
          tg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)); tg.computeVertexNormals(); tg.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2)); b.add(tg, Mf); }
      } }
    // a dockside crane
    b.add(box(28, D, 70, 30, D + 26, 72), M.red); b.add(box(16, D + 24, 70.3, 44, D + 25.4, 71.7), M.red);
    b.add(box(28.5, D + 26, 70.5, 29.5, D + 29, 71.5), M.red);
    b.build(this.dock);
    this.dock.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    R.add(this.dock);

    // ---- the ice cube tray on a table in front of the shed (shot 14) ----
    { const tb = new Batch(), Tz = TRAY_AT;
      const tw = lam("tableWood", () => ({ map: rep(planksHD(), 0.5, 0.5) }));
      tb.add(box(Tz[0] - 0.65, D + 0.74, Tz[2] - 0.6, Tz[0] + 0.65, D + 0.8, Tz[2] + 0.6), tw);
      for (const [dx, dz] of [[-0.55, -0.5], [0.55, -0.5], [-0.55, 0.5], [0.55, 0.5]]) tb.add(box(Tz[0] + dx - 0.04, D, Tz[2] + dz - 0.04, Tz[0] + dx + 0.04, D + 0.74, Tz[2] + dz + 0.04), M.wood);
      // tap on a post: pipe up behind the tray end, spout over the first cells
      tb.add(box(Tz[0] - 0.42, D, Tz[2] - 0.47, Tz[0] - 0.36, D + 1.32, Tz[2] - 0.41), M.iron);
      tb.add(box(Tz[0] - 0.42, D + 1.26, Tz[2] - 0.47, Tz[0] - 0.06, D + 1.32, Tz[2] - 0.41), M.iron);
      tb.add(box(Tz[0] - 0.085, D + 1.2, Tz[2] - 0.47, Tz[0] - 0.035, D + 1.32, Tz[2] - 0.41), M.iron);
      const knob = new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12); tb.add(knob, M.red, T(Tz[0] - 0.39, D + 1.36, Tz[2] - 0.44));
      tb.build(this.traySet);
      // the tray: 2 x 8 cells (16, like the compartments), pivots about its far end
      const TW = 0.22, TL = 0.66, TH = 0.05, trayM = lam("tray", () => ({ color: "#e9f2f7" }));
      const tg = new Batch();
      tg.add(box(-TW / 2, 0, -TL / 2, TW / 2, 0.008, TL / 2), trayM);
      for (const s of [-1, 1]) { tg.add(box(s * TW / 2 - 0.006, 0, -TL / 2, s * TW / 2 + 0.006, TH, TL / 2), trayM); tg.add(box(-TW / 2, 0, s * TL / 2 - 0.006, TW / 2, TH, s * TL / 2 + 0.006), trayM); }
      tg.add(box(-0.004, 0, -TL / 2, 0.004, TH * 0.75, TL / 2), trayM);
      for (let c = 1; c < TRAY_CELLS; c++) { const z = -TL / 2 + (c * TL) / TRAY_CELLS; tg.add(box(-TW / 2, 0, z - 0.004, TW / 2, TH * 0.72, z + 0.004), trayM); }
      tg.build(this.tray);
      const wM = lam("trayWater", () => ({ color: "#6fb6f0", emissive: new THREE.Color("#10305a") }));
      for (let c = 0; c < TRAY_CELLS; c++) for (const s of [-1, 1]) {
        const z0 = -TL / 2 + (c * TL) / TRAY_CELLS + 0.006, z1 = z0 + TL / TRAY_CELLS - 0.012;
        const m = new THREE.Mesh(box(s < 0 ? -TW / 2 + 0.006 : 0.005, 0, z0, s < 0 ? -0.005 : TW / 2 - 0.006, 1, z1), wM);
        m.position.y = 0.008; m.scale.y = 0.0001; this.trayWater.push(m); this.tray.add(m);
      }
      for (let c = 1; c < TRAY_CELLS; c++) {
        const z = -TL / 2 + (c * TL) / TRAY_CELLS;
        const m = new THREE.Mesh(box(-TW / 2 + 0.01, TH * 0.6, z - 0.008, TW / 2 - 0.01, TH * 0.78, z + 0.012), wM); m.visible = false;
        this.spill.push(m); this.tray.add(m);
      }
      // pivot at the far end so the near (tap) end dips as it fills
      this.tray.position.set(Tz[0], Tz[1], Tz[2] + TL / 2); this.tray.children.forEach((c) => c.position.z -= TL / 2);
      this.traySet.add(this.tray);
      this.stream = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 1, 10), wM); this.stream.visible = false; this.traySet.add(this.stream);
      this.traySet.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
      R.add(this.traySet); }

    // ---- the auction room (no ceiling; the camera never looks up) ----
    { const rb = new Batch(), x0 = ROOM[0], x1 = ROOM[0] + 16, zA = -8, zB = 8, H = 6.5;
      const wp = lam("wallpaper", () => ({ map: rep(WALLPAPER(), 1, 1) }));
      const wpTex = (wp as THREE.MeshLambertMaterial).map!; wpTex.wrapS = wpTex.wrapT = THREE.RepeatWrapping;
      const panel = lam("wainscot", () => ({ color: "#6b4228" }));
      const floor = lam("roomFloor", () => ({ map: rep(planksHD(), 4, 4) }));
      rb.add(box(x0, D, zA, x1, D + 0.02, zB), floor);
      rb.add(quad(V(x1, D, zA), V(x1, D, zB), V(x1, D + H, zB), V(x1, D + H, zA), 4, 1.6), wp);
      rb.add(quad(V(x1, D, zB), V(x0, D, zB), V(x0, D + H, zB), V(x1, D + H, zB), 4, 1.6), wp);
      rb.add(quad(V(x0, D, zA), V(x1, D, zA), V(x1, D + H, zA), V(x0, D + H, zA), 4, 1.6), wp);
      rb.add(quad(V(x0, D, zB), V(x0, D, 1.2), V(x0, D + H, 1.2), V(x0, D + H, zB), 1.7, 1.6), wp);
      rb.add(quad(V(x0, D, -1.2), V(x0, D, zA), V(x0, D + H, zA), V(x0, D + H, -1.2), 1.7, 1.6), wp);
      rb.add(quad(V(x0, D + 3.2, 1.2), V(x0, D + 3.2, -1.2), V(x0, D + H, -1.2), V(x0, D + H, 1.2), 0.6, 0.8), wp);
      rb.add(box(x0 - 0.12, D, -1.2, x0 + 0.02, D + 3.2, 1.2), lam("roomDoor", () => ({ color: "#5a3520" })));
      rb.add(box(x0, D, zA, x0 + 0.1, D + 1.1, zB), panel);
      rb.add(box(x1 - 0.1, D, zA, x1, D + 1.1, zB), panel); rb.add(box(x0, D, zB - 0.1, x1, D + 1.1, zB), panel); rb.add(box(x0, D, zA, x1, D + 1.1, zA + 0.1), panel);
      // back-wall paintings: the ship and a portrait
      const p0 = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8), lam("paint0", () => ({ map: PAINTING(0) })));
      p0.position.set(x1 - 0.06, D + 3.4, -4.0); p0.rotation.y = -Math.PI / 2; this.room.add(p0);
      const p1 = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), lam("paint1", () => ({ map: PAINTING(1) })));
      p1.position.set(x1 - 0.06, D + 3.3, 3.8); p1.rotation.y = -Math.PI / 2; this.room.add(p1);
      // podium in front of the auctioneer, cushion on a pedestal for the key
      const P = PODIUM, C = CUSHION;
      rb.add(box(P[0] - 0.95, D, P[2] - 0.65, P[0] - 0.35, D + 1.18, P[2] + 0.65), panel);
      rb.add(box(P[0] - 1.02, D + 1.18, P[2] - 0.72, P[0] - 0.3, D + 1.24, P[2] + 0.72), lam("podiumTop", () => ({ color: "#8a5a34" })));
      rb.add(box(C[0] - 0.22, D, C[2] - 0.22, C[0] + 0.22, D + 0.95, C[2] + 0.22), lam("pedestal", () => ({ color: "#efe7d6" })));
      const cush = new THREE.SphereGeometry(1, 20, 10); cush.scale(0.3, 0.08, 0.3);
      rb.add(cush, lam("cushion", () => ({ color: "#b8222e" })), T(C[0], D + 1.0, C[2]));
      // chairs for the bidders
      const chairM = lam("chair", () => ({ color: "#7a4a2c" }));
      for (const x of [203.6, 205.6, 207.4]) for (const z of [-3.6, -1.9, -0.2, 1.5, 3.2]) {
        rb.add(box(x - 0.24, D + 0.44, z - 0.24, x + 0.24, D + 0.5, z + 0.24), chairM);
        rb.add(box(x - 0.3, D + 0.5, z - 0.24, x - 0.25, D + 1.05, z + 0.24), chairM);
        for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) rb.add(box(x + dx - 0.025, D, z + dz - 0.025, x + dx + 0.025, D + 0.44, z + dz + 0.025), chairM);
      }
      rb.build(this.room);
      this.room.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
      R.add(this.room); }

    // ---- lifeboats at sea (shots 15-16): white boats with a lantern each ----
    { const sb = new Batch(), boatM = lam("boat", () => ({ color: "#f4f2ea" })), gunM = lam("gunwale", () => ({ color: "#9a6a42" }));
      const g = new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); g.scale(1.1, 0.8, 4.4); g.translate(0, 0.45, 0);
      const gw = new THREE.TorusGeometry(1, 0.09, 6, 24); gw.rotateX(Math.PI / 2); gw.scale(1.12, 1, 4.42); gw.translate(0, 0.45, 0);
      for (const [x, z, yaw] of SEA_BOATS) {
        const m = new THREE.Matrix4().compose(V(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), V(1, 1, 1));
        sb.add(g, boatM, m); sb.add(gw, gunM, m);
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.8, 1.2) }));
        l.position.set(x + Math.sin(yaw) * 3.4, 1.3, z + Math.cos(yaw) * 3.4); l.layers.set(NOINK); this.lanterns.push(l); this.seaBoats.add(l);
      }
      sb.build(this.seaBoats);
      R.add(this.seaBoats); }
  }

  /** camera-relative sun, frozen per shot */
  private shotSun(id: number, s: ShotDef, L: LightPreset) {
    let v = this.sunCache.get(id);
    if (v) return v;
    let fx = 0, fz = 0;
    for (let f = s.a; f < s.b; f += 3) {
      const c = camAt(id, f), x = c.look[0] - c.pos[0], z = c.look[2] - c.pos[2], n = Math.hypot(x, z) || 1;
      fx += x / n; fz += z / n;
    }
    const n = Math.hypot(fx, fz) || 1; fx /= n; fz /= n;
    const az = THREE.MathUtils.degToRad(s.sunAz ?? L.az), el = THREE.MathUtils.degToRad(s.sunEl ?? L.el);
    const hx = fx * Math.cos(az) - fz * Math.sin(az), hz = fz * Math.cos(az) + fx * Math.sin(az);
    v = new THREE.Vector3(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)).normalize();
    this.sunCache.set(id, v);
    return v;
  }
  private actor(i: number) { while (this.actors.length <= i) this.actors.push(new Actor(this.root)); return this.actors[i]; }
  private fx(i: number) { while (this.fxs.length <= i) this.fxs.push(new Fx(this.root)); return this.fxs[i]; }

  update(id: number, f: number, cam: THREE.PerspectiveCamera, scene: THREE.Scene) {
    const t = f / FPS, s = SHOTS[id - 1], L = LIGHTS[s.light], K = LOOK[s.light], night = s.light === "night";
    // ---- camera ----
    const c = camAt(id, f);
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(c.roll);
    cam.fov = c.fov; cam.near = 0.05; cam.far = 7000; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const focus = V(...c.look), dist = cam.position.distanceTo(focus);
    cam.layers.enable(NOINK);
    // ---- sets ----
    const sea = s.set === "sea" || s.set === "nest" || s.set === "cut" || s.set === "after";
    this.dock.visible = s.set === "dock" || s.set === "tray" || s.set === "room";
    this.traySet.visible = s.set === "tray";
    this.room.visible = s.set === "room";
    this.seaBoats.visible = id === 15 || id === 16;
    const sh = this.ship;
    this.shipFrame.visible = s.set !== "after" && s.set !== "tray" && s.set !== "room";
    sh.flags.visible = !!s.dressed;
    sh.boatsAll.visible = !!s.boats;
    sh.radio.visible = id === 18;
    const cut = s.set === "cut";
    sh.interior.visible = cut; sh.starboard.visible = !cut;
    // ship pose: yaw in the aerial of the swing, trim in the cutaway, the sinking
    this.shipFrame.rotation.set(0, id === 9 && f < 1027 ? shipYaw(t) : 0, 0);
    sh.root.rotation.set(0, 0, 0); sh.root.position.set(0, 0, 0);
    if (cut && id === 13) sh.root.rotation.x = THREE.MathUtils.degToRad(cutTrim(t));
    if (id === 15) { const p = sinkPose(t); sh.root.rotation.x = p.pitch; sh.root.position.y = p.dy; }
    for (let k = 0; k < sh.water.length; k++) {
      const lv = floodAt(k, t), w = sh.water[k];
      w.visible = cut && lv > KEEL + 0.05; w.scale.y = Math.max(0.001, lv - KEEL);
    }
    if (cut) sh.interior.traverse((o) => { (o as THREE.Mesh).receiveShadow = false; });
    sh.spills.forEach((m, i) => {
      const lvUp = floodAt(i, t), lvDn = floodAt(i + 1, t);
      const on = cut && i >= 4 && lvUp > 5.2 && lvDn < 6.0 && lvDn > KEEL + 0.02;
      m.visible = on;
      if (on) { const top = 5.35; m.position.y = top; m.scale.y = Math.max(0.1, top - lvDn); }
    });
    // windows glow at night
    for (const m of sh.glows) { if (night) m.emissive.setRGB(1.7, 1.25, 0.62); else m.emissive.setRGB(0, 0, 0); }
    // iceberg (ship frame) + wake
    const bp = bergAt(t);
    this.berg.visible = s.set === "sea" && id >= 1 && id <= 10 && !(id === 1);
    this.berg.position.set(bp[0], 0, bp[2]); this.berg.rotation.y = 0.6;
    const moving = !!s.moving;
    this.wake.visible = moving; for (const m of this.bowWave) m.visible = moving;
    this.wakeTex.offset.y = (-t * SHIP_SPEED) / 140;
    // ---- light rig ----
    const sunDir = this.shotSun(id, s, L);
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    const Rr = THREE.MathUtils.clamp(dist * 1.15 + 7, 12, 260);
    this.sun.position.copy(focus).addScaledVector(sunDir, 600); this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera;
    sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.near = 20; sc.far = 1400; sc.updateProjectionMatrix();
    this.sun.shadow.bias = L.bias; this.sun.shadow.normalBias = L.normalBias * (Rr / 12);
    TONE.uLitCol.value.set(...L.lit); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term; TONE.uBounce.value.set(...K.bounce); TONE.uSat.value = K.sat;
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad;
    CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
    // ---- sky, stars, fog, clouds ----
    const su = this.skyMat.uniforms;
    K.sky.c.forEach((h, i) => untone(h, su["c" + i].value));
    const e = K.sky.e.map((deg) => THREE.MathUtils.degToRad(deg));
    su.e.value.set(e[1], e[2], e[3], e[4]);
    this.sky.position.copy(cam.position); this.stars.position.copy(cam.position);
    this.stars.visible = night;
    untone(L.fog, this.fog.color); this.fog.near = L.fogNear; this.fog.far = L.fogFar;
    if (s.set === "room") { this.fog.near = 400; this.fog.far = 2000; }
    scene.fog = this.fog; scene.background = null;
    for (let i = 0; i < this.clouds.length; i++) {
      const m = this.clouds[i]; m.visible = !night;
      m.lookAt(cam.position.x, m.position.y, cam.position.z);
      (m.material as THREE.MeshBasicMaterial).map = cloudHD(i % 4, s.light === "golden" ? LOOK.golden.cloud : LOOK.day.cloud);
    }
    // ---- ocean ----
    const Wu = this.WU, wc = K.water;
    untone(wc.near, Wu.wNearC.value); untone(wc.mid, Wu.wMidC.value); untone(wc.far, Wu.wFarC.value);
    untone(wc.crest, Wu.wCrest.value); untone(wc.trough, Wu.wTrough.value); untone(wc.glint, Wu.wGlint.value);
    Wu.wShade.value.set(...wc.shade);
    Wu.wFlow.value.set(0, moving ? SHIP_SPEED * t : 0.25 * t);
    Wu.wCalm.value = night ? 1 : 0;
    const alpha = cut ? 0.42 : 1;
    Wu.wAlpha.value = alpha; this.waterM.transparent = alpha < 1; this.waterM.depthWrite = alpha >= 1;
    // ---- smoke ----
    for (const sm of this.smoke) {
      const u = (t * (moving ? 0.22 : 0.09) + sm.k) % 1, sz = 6 + u * 16;
      sm.m.visible = this.shipFrame.visible && id !== 15 && !cut;
      sm.m.position.set(sm.top[0] + u * 3, sm.top[1] + u * 9 + 4 * u * u, sm.top[2] - u * (moving ? 70 : 20));
      sm.m.scale.set(sz, sz, 1); sm.m.quaternion.copy(cam.quaternion);
      sm.mat.opacity = (night ? 0.5 : 0.8) * (1 - u) ** 1.2;
      sm.mat.color.set(night ? "#7a84a8" : "#ffffff");
    }
    // ---- the tray ----
    if (s.set === "tray") {
      this.tray.rotation.x = trayTilt(t);
      for (let c = 0; c < TRAY_CELLS; c++) for (let k = 0; k < 2; k++) {
        const m = this.trayWater[c * 2 + k], lv = trayFill(c, t);
        m.visible = lv > 0.01; m.scale.y = Math.max(0.0001, 0.034 * lv);
      }
      for (let c = 1; c < TRAY_CELLS; c++) { const u = trayFill(c, t); this.spill[c - 1].visible = u > 0.04 && u < 0.85; }
      const pour = t > W.fill - 0.25 && t < 52.2;
      this.stream.visible = pour;
      if (pour) { const top = TRAY_AT[1] + 1.2 - 0.82, len = top - 0.03; this.stream.scale.y = len; this.stream.position.set(TRAY_AT[0] - 0.06, TRAY_AT[1] + 0.03 + len / 2, TRAY_AT[2] - 0.44); }
    }
    for (const l of this.lanterns) l.visible = this.seaBoats.visible;
    // ---- cast + effects ----
    const right = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0);
    const st = stage(id, f, { pos: cam.position, right, sun: sunDir });
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    let ai = 0;
    const used: Actor[] = [];
    for (const p of st.places) {
      const sc2 = p.scale ?? 1;
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y + 1.1 * sc2, p.z), 3.5))) continue;
      const a = this.actor(ai++);
      const [w, h, k] = p.size ?? [300, 500, 0.5];
      a.r = this.pool.req(p.key, w, h, k, p.draw);
      a.mesh.visible = true;
      a.mesh.position.set(p.x, p.y, p.z);
      a.mesh.rotation.set(0, p.yaw ?? Math.atan2(cam.position.x - p.x, cam.position.z - p.z), p.roll ?? 0);
      a.mesh.scale.set(p.mirror ? -sc2 : sc2, sc2, sc2);
      a.mesh.castShadow = L.actorShadow;
      used.push(a);
    }
    for (let i = ai; i < this.actors.length; i++) this.actors[i].mesh.visible = false;
    let fi = 0;
    const fused: Fx[] = [];
    for (const p of st.fx) {
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y, p.z), Math.max(p.w, p.h)))) continue;
      const e = this.fx(fi++);
      e.r = this.pool.req(p.key, p.cw, p.ch, 1, p.draw);
      e.use(!!p.soft);
      e.mesh.visible = true;
      e.mesh.position.set(p.x, p.y, p.z);
      if (p.flat) e.mesh.rotation.set(-Math.PI / 2, 0, p.rot ?? 0);
      else { e.mesh.quaternion.copy(cam.quaternion); e.mesh.rotateZ(p.rot ?? 0); }
      e.mesh.scale.set(p.w, p.h, 1);
      fused.push(e);
    }
    for (let i = fi; i < this.fxs.length; i++) this.fxs[i].mesh.visible = false;
    this.pool.flush();
    for (const a of used) a.bind();
    for (const e of fused) e.bind();
    void clamp01; void smooth; void CUSHION;
    return focus;
  }
}

/** lifeboats on the calm sea after the sinking: [x, z, yaw] */
export const SEA_BOATS: [number, number, number][] = [[-120, 30, 0.4], [-95, -20, -0.3], [-70, 60, 0.9], [-150, 75, -0.6], [-60, -60, 0.2], [-175, -10, 1.2], [-40, 20, -0.8], [-130, -55, 0.6], [-52, -6, 0.5]];

const WATER_DECL = `#include <common>
varying vec3 vWP;
uniform vec3 wNearC, wMidC, wFarC, wCrest, wTrough, wGlint, wShade;
uniform sampler2D wNearTex, wFarTex, wStarTex;
uniform vec2 wFlow;
uniform float wCalm, wAlpha;`;
const WATER_COL = `
  vec3 wV = vWP - cameraPosition;
  float wd = length(wV);
  float wDep = asin(clamp(-wV.y / wd, 0.0, 1.0));
  float wf = 1.0 - smoothstep(0.0, 0.42, wDep);
  vec3 wc = mix(mix(wNearC, wMidC, smoothstep(0.0, 0.55, wf)), wFarC, smoothstep(0.55, 1.0, wf));
  vec2 wp = vWP.xz + wFlow;
  vec4 mk = mix(texture2D(wNearTex, wp / 8.0), texture2D(wFarTex, wp / 40.0 + 0.37), smoothstep(25.0, 90.0, wd));
  float calm = 1.0 - 0.92 * wCalm;
  wc = mix(wc, wTrough, mk.g * 0.6 * calm);
  wc = mix(wc, wCrest, mk.r * 0.7 * calm);
  wc = mix(wc, wGlint, mk.b * (0.3 + 0.5 * wf) * calm);
  float st = texture2D(wStarTex, wp / 150.0).b * smoothstep(40.0, 160.0, wd) * (1.0 - smoothstep(600.0, 1400.0, wd)) * wCalm;
  wc = mix(wc, wGlint, st * 0.38);
  diffuseColor.rgb = wc;`;
