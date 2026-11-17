// Timeline of "The Key That Sank the Titanic": shots timed to the voice (voice/words.json), story physics (iceberg
// path in the ship's frame, the turn, compartment flooding, the ice-tray analogy, the sinking) and the camera grammar of
// the bridge short: symmetric smootherstep glides, creeping push-ins on every hold, hard cuts on big reframes, 7-frame
// flip kicks on impacts. Ship frame: bow toward +z, waterline y = 0, port side +x (the quay side), starboard -x.
import type { LightName } from "./lights";
export const FPS = 30;
export const TOTAL = 2072;
export type V3 = [number, number, number];

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 4;
export const lin = (pts: [number, number][], x: number) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return pts[pts.length - 1][1];
};

// ---------------- voice cues (s, word onsets from words.json) ----------------
export const W = {
  missing: 1.99, key0: 2.22, unsinkable: 8.12, officer: 9.74, bumped: 11.39, walked: 12.41, key1: 13.28, pocket: 14.12,
  locker: 16.24, binoculars: 17.12, lookouts: 19.25, nest: 20.22, squinting: 20.81, freezing: 21.83,
  flat: 23.72, waves: 24.55, iceberg: 25.75, spot: 27.75, s37: 28.74, three: 30.14, rings: 30.45, bell: 30.96, iceberg2: 31.33,
  swings: 32.76, almost: 33.3, scrapes: 34.36, luckily: 35.93, unluckily: 37.41, sixteen: 40.56, four: 42.85, scrape: 44.05,
  five: 44.59, walls: 45.33, up: 47.42, tray: 48.73, fill: 49.28, spills: 50.37, next1: 51.04, next2: 52.04, gone: 54.76,
  fifteen: 55.53, lifeboats: 58.9, radio: 60.58, keyq: 62.28, sold: 64.01, ninety: 65.0, notbad: 66.41, trip: 68.29,
};
/** reactions land 0-3 frames before the word */
export const LEAD = 2 / FPS;

// ---------------- ship geometry (shared by ship.ts / world.ts / cast.ts) ----------------
export const HW = 14; // half beam (m)
/** half width of the hull at z (plan outline): fine bow from z 60 to the stem at 130, rounded cruiser stern */
export const hwAt = (z: number) => {
  if (z > 60) return HW * Math.max(0, 1 - ((z - 60) / 70) ** 2) ** 0.8;
  if (z < -88) return HW * Math.sqrt(Math.max(0, 1 - ((z + 88) / 46) ** 2));
  return HW;
};
export const BOW = 130, STERN = -130;
/** hull top (sheer line): rises to the forecastle and the poop */
export const topAt = (z: number) => 12 + 3 * smooth((z - 78) / 16) + 2.2 * smooth((-z - 92) / 14);
export const BOAT_DECK = 18;
export const FUNNELS = [40, 14, -12, -38];
export const FOREMAST: V3 = [0, 15, 100];
export const MAINMAST: V3 = [0, 14.2, -104];
export const NEST_Y = 29; // crow's nest floor
export const NEST: V3 = [0, NEST_Y, 101.1];
export const LOOKOUTS: V3[] = [[-0.52, NEST_Y, 101.45], [0.55, NEST_Y, 101.35]];
/** bulkheads (z) between the 16 watertight compartments; the forward five are opened by the scrape */
export const BULKHEADS = [112, 97, 82, 68, 54, 40, 24, 8, -8, -24, -40, -56, -72, -88, -104];
export const BH_TOP = 5; // they stop at E deck, well below the top of the hull
export const KEEL = -9.5;
/** compartment k spans z from CZ[k + 1] to CZ[k] (k = 0 is the forepeak) */
export const CZ = [BOW, ...BULKHEADS, STERN];
/** water level (y) in compartment k during the cutaway / sinking shots */
export const SPILL0 = 46.2; // water starts to top the walls (on "didn't go all the way up")
export const floodAt = (k: number, t: number) => {
  if (t < W.unluckily - 0.3) return KEEL;
  const over = BH_TOP + 1.3;
  if (k >= 5) {
    // the walls stop at E deck: once the bow is down, water spills over into the next compartment, and the next
    const spill = t - (SPILL0 + 0.5) - (k - 5) * 1.1;
    return KEEL + (over - KEEL) * smooth(spill / 2.2) * (k < 9 ? 1 : 0);
  }
  // forward five fill one after another in the "sixteen ... five" beat; then rise above the walls as the bow settles
  const t0 = W.unluckily + 0.15 * k, full = BH_TOP - 0.7;
  const base = k < 4 ? (full - KEEL) * smooth((t - t0) / 3.2) * (0.35 + 0.65 * smooth((t - W.sixteen) / 2.5))
    : (full - KEEL) * (0.3 * smooth((t - t0) / 3) + 0.7 * smooth((t - W.five + 0.3) / 1.0));
  return KEEL + base + (over - full) * smooth((t - (W.walls - 0.3)) / 1.6);
};
/** bow-down trim of the cutaway (deg): the ship settles once five compartments are full, so water tops the walls */
export const cutTrim = (t: number) => 5.5 * smooth((t - (W.walls - 0.2)) / 2.0);

// ---------------- iceberg (ship frame) ----------------
export const SHIP_SPEED = 11; // m/s, 22 knots
/** iceberg centre in the ship frame: far ahead, slightly to starboard; the turn drifts it to starboard; then it scrapes
 *  along the starboard side at the ship's speed */
export const bergAt = (t: number): V3 => {
  if (t < W.scrapes) {
    const z = lin([[0, 1500], [17, 1300], [23, 820], [27.6, 430], [30.1, 300], [32.4, 205], [W.scrapes, 118]], t);
    const x = -3 - 21.5 * smooth((t - 32.3) / (W.scrapes - 32.3));
    return [x, 0, z];
  }
  const z = 118 - SHIP_SPEED * (t - W.scrapes);
  return [-(hwAt(z) + 13.5), 0, z];
};
/** ship yaw (rad, + = to port/left) during the swing */
export const shipYaw = (t: number) => 0.2 * smooth((t - 32.5) / 3.4);

// ---------------- the ice cube tray (analogy, shot 14) ----------------
export const TRAY_AT: V3 = [92.6, 4.82, -60]; // tray centre on the table (dock set)
export const TRAY_CELLS = 8; // 2 x 8 = 16 cells, like the 16 compartments
/** water level 0..1 per cell column c (0 = the end under the tap) */
export const trayFill = (c: number, t: number) => {
  const t0 = W.fill - 0.1;
  if (c === 0) return smooth((t - t0) / 1.0);
  // each column fills once the one before overflows: the first spill on "spills", then faster
  const ts = W.spills - 0.25 + (c - 1) * 0.42;
  return smooth((t - ts) / 0.5);
};
/** tray tilt (rad): the filled end dips once it is heavy */
export const trayTilt = (t: number) => 0.06 * smooth((t - (W.fill + 0.4)) / 1.2);

// ---------------- the sinking (shot 15) ----------------
export const sinkPose = (t: number) => {
  const u = clamp01((t - 52.3) / (W.gone - 0.1 - 52.3));
  return { pitch: (6 + 22 * u ** 1.6) * (Math.PI / 180), dy: -4 - 70 * u ** 3.2 };
};

// ---------------- shots ----------------
export type Set = "sea" | "dock" | "nest" | "cut" | "tray" | "room" | "after";
export type ShotDef = { id: number; a: number; b: number; light: LightName; set: Set; moving?: boolean; boats?: boolean; dressed?: boolean; sunAz?: number; sunEl?: number };
export const SHOTS: ShotDef[] = [
  { id: 1, a: 0, b: 79, light: "night", set: "sea", moving: true },                         // hook
  { id: 2, a: 79, b: 265, light: "day", set: "dock", dressed: true, sunAz: 120 },           // Southampton, unsinkable
  { id: 3, a: 265, b: 439, light: "day", set: "dock", dressed: true },                      // Blair walks off with the key
  { id: 4, a: 439, b: 539, light: "day", set: "dock", dressed: true, sunAz: 150, sunEl: 40 }, // the locker in the nest
  { id: 5, a: 539, b: 690, light: "night", set: "sea", moving: true },                      // lookouts squinting
  { id: 6, a: 690, b: 811, light: "night", set: "sea", moving: true },                      // flat sea, the berg
  { id: 7, a: 811, b: 904, light: "night", set: "sea", moving: true },                      // spot it
  { id: 8, a: 904, b: 972, light: "night", set: "sea", moving: true },                      // bell + "Iceberg, right ahead!"
  { id: 9, a: 972, b: 1078, light: "night", set: "sea", moving: true },                     // swing + scrape
  { id: 10, a: 1078, b: 1122, light: "night", set: "sea", moving: true },                   // luckily
  { id: 11, a: 1122, b: 1168, light: "night", set: "cut" },                                 // unluckily: the gash
  { id: 12, a: 1168, b: 1353, light: "night", set: "cut" },                                 // sixteen rooms, five opened
  { id: 13, a: 1353, b: 1430, light: "night", set: "cut" },                                 // the walls didn't go all the way up
  { id: 14, a: 1430, b: 1572, light: "golden", set: "tray", sunAz: 150, sunEl: 22 },        // ice cube tray
  { id: 15, a: 1572, b: 1641, light: "night", set: "sea" },                                 // sinking
  { id: 16, a: 1641, b: 1719, light: "night", set: "after" },                               // calm sea, lifeboats
  { id: 17, a: 1719, b: 1801, light: "day", set: "dock", boats: true, sunAz: 100 },         // lifeboats for everyone
  { id: 18, a: 1801, b: 1846, light: "night", set: "sea" },                                 // radio on all night
  { id: 19, a: 1846, b: TOTAL, light: "day", set: "room", sunAz: 170, sunEl: 62 },          // the auction
];
export const XFADE: Record<number, number> = { 5: 8, 14: 8, 15: 8, 16: 12, 17: 8, 18: 8, 19: 8 };
export const FLASH_AT = 79;
export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};

// ---------------- camera ----------------
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
type Shot = Partial<Cam> & { pos: V3; look: V3 };
type Key = { f: number; dur?: number; cut?: boolean; s: (f: number) => Shot };
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };
const mix = (a: Cam, b: Cam, k: number): Cam => ({
  pos: a.pos.map((v, i) => v + (b.pos[i] - v) * k) as V3, look: a.look.map((v, i) => v + (b.look[i] - v) * k) as V3,
  fov: a.fov + (b.fov - a.fov) * k, roll: a.roll + (b.roll - a.roll) * k,
});
const full = (c: Shot): Cam => ({ fov: 40, roll: 0, ...c });
const run = (keys: Key[], f: number) => {
  let cur = full(keys[0].s(f));
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.f) break;
    cur = k.cut ? full(k.s(f)) : mix(cur, full(k.s(f)), glide((f - k.f) / (k.dur ?? 24)));
  }
  return cur;
};
const T = (f: number) => f / FPS;
const pushK = (f: number, f0: number, rate: number, punch = 0, n = 35) => {
  const x = Math.max(0, f - f0);
  let s = rate * x;
  if (punch > rate) for (let i = 0; i < Math.min(x, n); i++) s += (punch - rate) * Math.max(0, Math.min(1, (i + 0.5) / 8, (n - i - 0.5) / 8));
  return Math.exp(-s);
};
const dolly = (pos: V3, look: V3, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos: [look[0] + (pos[0] - look[0]) * k, look[1] + (pos[1] - look[1]) * k, look[2] + (pos[2] - look[2]) * k], look, ...rest });
const zoom = (pos: V3, look: V3, fov: number, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos, look, fov: (360 / Math.PI) * Math.atan(Math.tan((fov * Math.PI) / 360) * k), ...rest });
const rolled = (s: (f: number) => Shot, roll: number) => (f: number): Shot => ({ ...s(f), roll });

const N = NEST, NY = NEST_Y;
const B = (f: number) => bergAt(T(f));
// 1 hook: low 3/4 front of the ship sailing at night -> punch to the crow's nest with the missing key
const S1a = (f: number) => dolly([-58, 7, 250], [0, 17, 70], pushK(f, 0, 0.003), { fov: 40, roll: -0.03 });
const S1b = (f: number) => dolly([-1.4, NY + 2.3, N[2] + 5.6], [0, NY + 1.35, N[2]], pushK(f, 57, 0.004), { fov: 38, roll: 0.04 });
// 2 Southampton: aerial over the quay -> low angle up the hull -> crowd MS on "unsinkable"
const S2a = (f: number) => zoom([95, 52, 150], [5, 14, 10], 46, pushK(f, 79, 0.0018));
const S2b = (f: number) => dolly([27, 4.9, 66], [10, 22, 18], pushK(f, 150, 0.002), { fov: 46, roll: 0.05 });
const S2c = (f: number) => dolly([27.5, 6.4, 34], [23, 5.6, 22], pushK(f, 238, 0.003, 0.007, 30), { fov: 40, roll: -0.04 });
// 3 Blair at the foot of the gangway -> walking off -> CU of the key in his pocket
export const BLAIR0: V3 = [19.6, 4, 7.5];
export const blairPos = (t: number): V3 => {
  const u = clamp01((t - (W.walked - 0.1)) / 3.2);
  return [BLAIR0[0] + 1.6 * u, 4, BLAIR0[2] + 7.0 * u];
};
const S3a = (f: number) => dolly([23.2, 5.8, 14.2], [20.0, 5.2, 7.0], pushK(f, 265, 0.0025), { fov: 40 });
const S3b = (f: number) => { const p = blairPos(T(f)); return dolly([p[0] + 5.5, 5.5, p[2] + 12], [p[0], 5.2, p[2]], pushK(f, 370, 0.002), { fov: 40, roll: 0.03 }); };
const S3c = (f: number) => { const p = blairPos(T(f)); return dolly([p[0] + 1.25, 4.95, p[2] + 2.5], [p[0] - 0.05, 4.85, p[2]], pushK(f, 396, 0.003), { fov: 36, roll: -0.04 }); };
// 4 the binocular locker in the nest (day): locked, keyhole CU on "binoculars"
export const LOCKER: V3 = [0.62, NY + 0.62, 100.22];
const S4a = (f: number) => dolly([0.1, NY + 1.75, N[2] + 2.6], [LOCKER[0], LOCKER[1] + 0.15, LOCKER[2]], pushK(f, 439, 0.003), { fov: 42, roll: 0.03 });
const S4b = (f: number) => dolly([0.45, NY + 1.25, N[2] + 1.15], [LOCKER[0], LOCKER[1] + 0.05, LOCKER[2]], pushK(f, 508, 0.0035, 0.008, 28), { fov: 38, roll: -0.04 });
// 5 night: up the foremast to the nest against the stars -> MS lookouts
const S5a = (f: number) => zoom([-9, 17.5, 118], [0, NY + 1, N[2]], 44, pushK(f, 535, 0.002), { roll: 0.04 });
const S5b = (f: number) => dolly([-0.4, NY + 1.85, N[2] + 4.3], [0, NY + 1.3, N[2] + 0.2], pushK(f, 604, 0.0025, 0.006, 30), { fov: 38 });
// 6 over the lookouts' shoulders down the bow to a flat black sea -> water level by the berg, no surf at all
const S6a = (f: number) => dolly([1.4, NY + 3.4, N[2] - 4], [-1.5, 2, 330], pushK(f, 690, 0.0016), { fov: 40, roll: -0.03 });
const S6b = (f: number) => { const b = B(f); return dolly([b[0] + 34, 2.2, b[2] - 92], [b[0], 9, b[2]], pushK(f, 735, 0.0025, 0.006, 32), { fov: 42, roll: 0.035 }); };
// 7 lookouts MS (shock on "spot") -> POV past them to the berg ahead
const S7a = (f: number) => dolly([0.4, NY + 1.8, N[2] + 3.6], [0, NY + 1.3, N[2] + 0.2], pushK(f, 811, 0.003), { fov: 38, roll: -0.03 });
const S7b = (f: number) => { const b = B(f); return zoom([0.3, NY + 1.95, N[2] - 1.6], [b[0] * 0.8, 9, b[2]], 34, pushK(f, 858, 0.004, 0.008, 30), { roll: 0.03 }); };
// 8 the bell (3 clangs) -> Fleet shouting
export const BELL: V3 = [0.0, NY + 2.25, 100.62];
const S8a = (f: number) => dolly([0.9, NY + 2.05, N[2] + 2.1], [BELL[0], BELL[1] - 0.15, BELL[2]], pushK(f, 902, 0.003), { fov: 36, roll: 0.04 });
const S8b = (f: number) => dolly([-0.9, NY + 1.55, N[2] + 2.7], [-0.5, NY + 1.55, N[2] + 0.35], pushK(f, 936, 0.004, 0.008, 25), { fov: 36, roll: -0.05 });
// 9 aerial of the swing (world fixed; the ship yaws) -> low along the starboard side as the ice grinds past
const S9a = (f: number) => zoom([-120, 150, 330], [-12, 4, 120], 44, pushK(f, 972, 0.0016), { roll: -0.03 });
const S9b = (f: number) => dolly([-58, 5, 62], [-14, 9, 106], pushK(f, 1027, 0.0025), { fov: 44, roll: 0.05 });
// 10 boat deck, starboard rail: passengers relieved as the berg slides by
export const WELL = 86; // forward well deck, where the ice fell
const S10a = (f: number) => dolly([1.5, 14.8, 81.6], [-11, topAt(89) + 1.0, 92], pushK(f, 1074, 0.0025), { fov: 44 });
// 11-13 cutaway (night diagram): the gash at the starboard bow -> all sixteen rooms -> up a bulkhead
const S11a = (f: number) => dolly([-72, 7, 150], [0, -1, 98], pushK(f, 1118, 0.003), { fov: 42, roll: -0.04 });
const S12a = (f: number) => zoom([-215, 18, 10], [0, 1, 10], 44, pushK(f, 1168, 0.0012));
const S12b = (f: number) => zoom([-215, 18, 10], [0, 1, 10], 44, pushK(f, 1214, 0.0012));
const S12c = (f: number) => dolly([-120, 8, 75], [0, -1, 82], pushK(f, 1280, 0.002), { fov: 42 });
const S12d = (f: number) => dolly([-98, 6, 78], [0, -1.5, 86], pushK(f, 1332, 0.002, 0.007, 30), { fov: 42, roll: 0.04 });
const S13a = (f: number) => dolly([-62, 2.5, 58], [0, 0.5, 58], pushK(f, 1349, 0.002), { fov: 40 });
const S13b = (f: number) => dolly([-36, 5.5, 55], [0, 4.0, 54.5], pushK(f, 1395, 0.0025), { fov: 40, roll: 0.03 });
// 14 the ice cube tray on a table (golden)
const TR = TRAY_AT;
const S14a = (f: number) => dolly([TR[0] + 1.5, TR[1] + 0.85, TR[2] + 1.25], [TR[0], TR[1] + 0.1, TR[2] + 0.05], pushK(f, 1426, 0.0025), { fov: 40, roll: 0.03 });
const S14b = (f: number) => dolly([TR[0] + 0.95, TR[1] + 0.5, TR[2] + 0.75], [TR[0], TR[1] + 0.02, TR[2] - 0.05], pushK(f, 1505, 0.002, 0.006, 30), { fov: 38, roll: -0.04 });
// 15 the sinking, from the lifeboats' height; 16 the empty sea, boats, stars
const S15a = (f: number) => zoom([-215, 5, 110], [-10, 14, 10], 40, pushK(f, 1568, 0.0016));
const S16a = (f: number) => dolly([-29, 2.8, 31], [-41, 0.9, 19], pushK(f, 1637, 0.0018), { fov: 42, roll: 0.02 });
// 17 day: lifeboats for everyone (a crane down the packed boat deck)
const S17a = (f: number) => dolly([40, 46, 95], [6, BOAT_DECK, 10], pushK(f, 1715, 0.002), { fov: 42, roll: -0.03 });
// 18 night: the radio operator at his set on the boat deck
export const RADIO: V3 = [5.4, BOAT_DECK, 47.5];
const S18a = (f: number) => dolly([RADIO[0] + 0.7, BOAT_DECK + 2.1, RADIO[2] + 3.8], [RADIO[0] - 0.1, BOAT_DECK + 1.25, RADIO[2] - 0.6], pushK(f, 1797, 0.003), { fov: 42, roll: 0.03 });
// 19 the auction room
export const ROOM: V3 = [200, 4, 0];
export const PODIUM: V3 = [212, 4, -2.6];
export const CUSHION: V3 = [211.2, 4, 1.4];
const S19a = (f: number) => dolly([205.5, 6.4, 6.0], [211.5, 5.2, -0.6], pushK(f, 1842, 0.002), { fov: 46 });
const S19b = (f: number) => dolly([208.2, 5.95, -1.0], [212.0, 5.55, -2.6], pushK(f, 1917, 0.003, 0.007, 25), { fov: 40, roll: -0.04 });
const S19c = (f: number) => dolly([211.4, 5.7, 0.2], [205.0, 4.85, -0.2], pushK(f, 1947, 0.003), { fov: 44, roll: 0.04 });
const S19d = (f: number) => dolly([209.25, 5.4, 0.55], [211.2, 5.16, 1.4], pushK(f, 1990, 0.004), { fov: 36, roll: 0.02 });

const CAMS: Record<number, Key[]> = {
  1: [{ f: 0, s: S1a }, { f: 57, cut: true, s: S1b }],
  2: [{ f: 79, s: S2a }, { f: 150, cut: true, s: S2b }, { f: 238, cut: true, s: S2c }],
  3: [{ f: 265, s: S3a }, { f: 370, cut: true, s: S3b }, { f: 396, cut: true, s: S3c }],
  4: [{ f: 439, s: S4a }, { f: 508, dur: 22, s: S4b }],
  5: [{ f: 535, s: S5a }, { f: 604, cut: true, s: S5b }],
  6: [{ f: 690, s: S6a }, { f: 735, cut: true, s: S6b }],
  7: [{ f: 811, s: S7a }, { f: 858, cut: true, s: S7b }],
  8: [{ f: 904, s: S8a }, { f: 936, cut: true, s: S8b }],
  9: [{ f: 972, s: S9a }, { f: 1027, cut: true, s: S9b }],
  10: [{ f: 1074, s: S10a }],
  11: [{ f: 1118, s: S11a }],
  12: [{ f: 1168, s: S12a }, { f: 1214, dur: 30, s: rolled(S12b, -0.03) }, { f: 1280, dur: 30, s: S12c }, { f: 1332, cut: true, s: S12d }],
  13: [{ f: 1349, s: S13a }, { f: 1395, dur: 30, s: S13b }],
  14: [{ f: 1426, s: S14a }, { f: 1505, dur: 26, s: S14b }],
  15: [{ f: 1568, s: S15a }],
  16: [{ f: 1635, s: S16a }],
  17: [{ f: 1715, s: S17a }],
  18: [{ f: 1797, s: S18a }],
  19: [{ f: 1842, s: S19a }, { f: 1917, cut: true, s: S19b }, { f: 1947, cut: true, s: S19c }, { f: 1990, cut: true, s: S19d }],
};

// impact kicks: bell clangs, the scrape, the gavel
export const CLANGS = [30.17, 30.48, 30.82];
const KICKS: [number, number][] = [[W.bumped, 0.4], ...CLANGS.map((c) => [c, 0.6] as [number, number]), [W.scrapes, 1.3], [W.scrapes + 0.5, 0.8],
  [W.scrapes + 1.0, 0.6], [W.sold, 1.0]];
export const kickAt = (t: number) => {
  let a = 0;
  for (const [t0, g] of KICKS) {
    const n = Math.floor((t - t0) * FPS + 1e-6);
    if (n >= 0 && n < 7) a += g * (n % 2 ? -1 : 1) * (1 - n / 7) ** 1.5;
  }
  return a;
};
export const camAt = (id: number, f: number): Cam => {
  const c = run(CAMS[id], f), a = kickAt(T(f));
  if (!a) return c;
  const d: V3 = [c.look[0] - c.pos[0], c.look[1] - c.pos[1], c.look[2] - c.pos[2]];
  const L = Math.hypot(...d), h = Math.hypot(d[0], d[2]) || 1;
  const m = (3 / 640) * Math.tan((c.fov * Math.PI) / 360) * L * a;
  return { ...c, look: [c.look[0] - (d[2] / h) * m, c.look[1] + 0.6 * m, c.look[2] + (d[0] / h) * m], roll: c.roll + a * 0.004 };
};

// ---------------- lens ----------------
export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
const eyesNest = (): V3 => [0, NY + 1.55, N[2] + 0.4];
export const DOF: Dof[] = [
  { f: 0, cInf: 0 },
  { f: 57, cInf: 13, focus: eyesNest },
  { f: 79, cInf: 0 },
  { f: 238, cInf: 10 },
  { f: 265, cInf: 10, focus: () => [19.6, 5.6, 7.5] },
  { f: 370, cInf: 0 },
  { f: 396, cInf: 14 },
  { f: 439, cInf: 11 },
  { f: 535, cInf: 0 },
  { f: 604, cInf: 12, focus: eyesNest },
  { f: 690, cInf: 0 },
  { f: 811, cInf: 12, focus: eyesNest },
  { f: 858, cInf: 0 },
  { f: 904, cInf: 13 },
  { f: 936, cInf: 13, focus: () => [-0.52, NY + 1.6, 101.45] },
  { f: 972, cInf: 0 },
  { f: 1074, cInf: 9, focus: () => [-11, BOAT_DECK + 1.6, 49] },
  { f: 1118, cInf: 0 },
  { f: 1426, cInf: 12 },
  { f: 1505, dur: 26, cInf: 14 },
  { f: 1568, cInf: 0 },
  { f: 1797, cInf: 11 },
  { f: 1842, cInf: 6 },
  { f: 1917, cInf: 12, focus: () => [212.3, 5.75, -2.4] },
  { f: 1947, cInf: 11 },
  { f: 1990, cInf: 14 },
];
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
