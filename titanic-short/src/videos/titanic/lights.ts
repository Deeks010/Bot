// Light presets per time of day (bridge short values for day / golden, plus a stylised NIGHT for the Atlantic):
// the "sun" is CAMERA-RELATIVE and frozen per shot (world.ts). At night it is a cool starlight/moon-ish key from above,
// shadows violet-blue, heads lavender (reference night shots: heads #b1ace7, violet ambient, warm windows).
type C3 = [number, number, number];
export type LightName = "day" | "golden" | "night";
export type LightPreset = {
  az: number; el: number;
  lit: C3; shade: C3; lift: C3; lambert: number; sideK: number; term: number;
  charTint: C3; charShade: number; charGrad: number; bodyGrad: number; sideTint: C3;
  blob: C3; actorShadow: boolean;
  top: string; hor: string; skyCurve: C3; fog: string; fogNear: number; fogFar: number; sunDisc: string;
  sunCol: string; sunI: number; sky: string; ground: string; hemiI: number;
  bias: number; normalBias: number;
};
export const LIGHTS: Record<LightName, LightPreset> = {
  day: {
    az: 75, el: 48,
    lit: [1.58, 1.5, 1.33], shade: [0.3, 0.29, 0.36], lift: [0.05, 0.06, 0.11], lambert: 0.35, sideK: 0.84, term: 0.2,
    charTint: [1.0, 0.94, 0.92], charShade: 0.86, charGrad: 0.07, bodyGrad: 0.2, sideTint: [0.92, 0.90, 0.96],
    blob: [0.62, 0.58, 0.58], actorShadow: false,
    top: "#3e7fd2", hor: "#b8d0ec", skyCurve: [0.0, 0.5, 0.6], fog: "#b8d0ec", fogNear: 60, fogFar: 900, sunDisc: "#000000",
    sunCol: "#fff3e0", sunI: 2.8, sky: "#dcecff", ground: "#b49a78", hemiI: 0.55,
    bias: -0.00025, normalBias: 0.015,
  },
  golden: {
    az: 6, el: 7,
    lit: [1.5, 0.68, 0.24], shade: [0.15, 0.15, 0.3], lift: [0.04, 0.06, 0.17], lambert: 0.35, sideK: 0.82, term: 0.07,
    charTint: [1.0, 0.78, 0.56], charShade: 0.88, charGrad: 0.1, bodyGrad: 0.25, sideTint: [0.85, 0.80, 0.95],
    blob: [0.75, 0.74, 0.9], actorShadow: true,
    top: "#6a4f8c", hor: "#ffd08a", skyCurve: [0.05, 0.6, 1.0], fog: "#efb489", fogNear: 50, fogFar: 600, sunDisc: "#ffcf9e",
    sunCol: "#ffab5e", sunI: 5.5, sky: "#d8b0b8", ground: "#8a6a60", hemiI: 0.5,
    bias: -0.0006, normalBias: 0.03,
  },
  night: {
    az: 55, el: 38,
    lit: [0.78, 0.84, 1.08], shade: [0.19, 0.2, 0.4], lift: [0.03, 0.04, 0.13], lambert: 0.4, sideK: 0.86, term: 0.22,
    charTint: [0.8, 0.8, 1.0], charShade: 0.88, charGrad: 0.1, bodyGrad: 0.24, sideTint: [0.82, 0.8, 1.0],
    blob: [0.5, 0.5, 0.7], actorShadow: false,
    top: "#0b1236", hor: "#33457f", skyCurve: [0.0, 0.5, 0.6], fog: "#2b3a72", fogNear: 120, fogFar: 2200, sunDisc: "#000000",
    sunCol: "#c4ceff", sunI: 2.0, sky: "#3a4a8a", ground: "#151a33", hemiI: 0.4,
    bias: -0.0004, normalBias: 0.02,
  },
};

export type WorldLook = {
  sky: { c: string[]; e: number[] };
  water: { near: string; mid: string; far: string; crest: string; trough: string; glint: string; shade: C3 };
  bounce: C3; sat: number;
  cloud: { lit: string; mid: string; shade: string };
};
export const LOOK: Record<LightName, WorldLook> = {
  day: {
    sky: { c: ["#b8d0ec", "#9cbfea", "#6a9fe0", "#4f8cdb", "#3373cc"], e: [0, 3, 8, 16, 40] },
    water: { near: "#1f8fa6", mid: "#16719f", far: "#2a5f9a", crest: "#7ddfe8", trough: "#0e4a80", glint: "#ffffff", shade: [0.5, 0.56, 0.72] },
    cloud: { lit: "#fbf8f1", mid: "#e1e5f3", shade: "#c3cbe9" },
    bounce: [0, 0, 0], sat: 1.08,
  },
  golden: {
    sky: { c: ["#ffc47c", "#f7ae78", "#e8967c", "#c4848e", "#8a6f8a"], e: [0, 4, 10, 20, 40] },
    water: { near: "#1e3a6e", mid: "#355f96", far: "#d4a48e", crest: "#d9a088", trough: "#16294f", glint: "#ffe2b0", shade: [0.42, 0.46, 0.72] },
    cloud: { lit: "#ffd2a8", mid: "#f2a08f", shade: "#a98fc4" },
    bounce: [0.04, 0.02, 0.0], sat: 1.1,
  },
  night: {
    // moonless and starry: deep navy zenith, a lifted blue-violet band at the horizon so silhouettes read
    sky: { c: ["#3a4c8a", "#2b3b78", "#1c2962", "#121b4c", "#0a1036"], e: [0, 3, 9, 18, 45] },
    // flat calm: the sea is a dark mirror of the sky (lighter toward the horizon) with star glints, no crests
    water: { near: "#0c1838", mid: "#14245a", far: "#2c3d7a", crest: "#3a5296", trough: "#08112c", glint: "#fff3c8", shade: [0.7, 0.72, 0.9] },
    cloud: { lit: "#3a4a80", mid: "#2a3870", shade: "#1c2858" },
    bounce: [0, 0, 0], sat: 1.12,
  },
};
