# Sound for "The Key That Sank the Titanic": synthesized SFX (event table timed to the voice words) + an original score
# (light -> cold -> alarm -> curious -> somber -> light), ducked under the voice, mixed to -15 LUFS, <= -1.2 dBTP,
# 48 kHz stereo, exact picture length. Standard mix: voice unchanged, music bed ~-10 LU under the voice ("+3 dB"),
# SFX ~6 dB under the voice. Writes mix.wav, stems and cues.md.
import json, os, sys
import numpy as np
from scipy import signal
from dsp import (SR, TAU, ns, tt, rng, lp, hp, bp, peq, colored, smooth_noise, ramp, fades, shape, phase, modal, pan, st, place,
                 widen, make_ir, convolve_st, integrated, momentary_max, true_peak, dbg, write_wav, read_wav)
import instruments as I
import sfx_gen as G

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FPS, TOTAL = 30, 2072
DUR = TOTAL / FPS
N = ns(DUR)
CUES = []

# ---------------------------------------------------------------- voice
def load_voice():
    import soundfile as sf
    v, sr = sf.read(os.path.join(ROOT, "voice", "voice.wav"))
    v = signal.resample_poly(v, SR // 1000, sr // 1000) if sr != SR else v
    out = np.zeros(N); out[: min(N, len(v))] = v[:N]
    return out
WORDS = json.load(open(os.path.join(ROOT, "voice", "words.json")))

# ---------------------------------------------------------------- custom generators
def steam_whistle(dur, r):
    """the triple-chime steam whistle: three breathy reed tones, slow onset, slight pitch rise"""
    n = ns(dur); t = np.arange(n) / SR
    env = np.clip(t / 0.25, 0, 1) ** 1.5 * np.clip((dur - t) / 0.5, 0, 1)
    y = np.zeros(n)
    for f0 in (98.0, 123.5, 146.8):
        ph = phase(f0 * (1 + 0.012 * np.clip(t / 0.4, 0, 1) + 0.002 * smooth_noise(n, r, 4)))
        for k in range(1, 14):
            y += (k ** -1.1) * (1 + 0.8 * np.exp(-((k * f0 - 700) / 400) ** 2)) * np.sin(k * ph + r.uniform(0, TAU))
    y += bp(r.standard_normal(n), 400, 3000, 1) * 0.35
    return fades(lp(y, 3500) * env * 0.25, 0.01, 0.2)

def bell(f, r, dur=2.2, vel=1.0):
    y = modal(dur, [(f, 1.0, 1.4), (f * 2.0, 0.6, 0.9), (f * 2.42, 0.5, 0.7), (f * 3.0, 0.3, 0.45), (f * 4.2, 0.22, 0.3), (f * 5.4, 0.1, 0.2)], r)
    t = tt(dur)
    y += hp(r.standard_normal(len(t)), 2000) * np.exp(-t / 0.004) * 0.4
    return fades(y * vel, 0.0005, 0.1)

def engine_hum(dur, r):
    n = ns(dur); t = np.arange(n) / SR
    y = 0.6 * np.sin(phase(41 + 0.6 * smooth_noise(n, r, 0.3))) * (0.8 + 0.2 * np.sin(TAU * 1.37 * t))
    y += 0.3 * np.sin(phase(82)) + lp(colored(n, r, 1.5), 120, 2) * 0.4
    return y

def night_sea(dur, r, hum=True):
    w = G.water_bed(dur, r, close=0.25, slosh_rate=0.3) * 0.5
    b = G.breeze(dur, r, level=0.7, gust=0.25, bright=700)
    out = w + st(b) * 0.6
    if hum: out += st(engine_hum(dur, r)) * 0.5
    return out

def gull(r):
    d = r.uniform(0.35, 0.6); t = tt(d)
    f = 1500 * (1 - 0.35 * t / d) * (1 + 0.04 * np.sin(TAU * 28 * t))
    y = (np.sin(phase(f)) + 0.4 * np.sin(2 * phase(f)) + 0.15 * np.sin(3 * phase(f))) * np.sin(np.pi * t / d) ** 0.8
    return bp(y, 800, 5000, 1) * 0.5

def harbor(dur, r, people=True):
    out = G.water_bed(dur, r, close=0.35, slosh_rate=0.6) * 0.5 + st(G.breeze(dur, r, level=0.5)) * 0.4
    tm = r.uniform(0.3, 1.5)
    while tm < dur - 0.7:
        for j in range(r.integers(1, 4)):
            place(out, pan(gull(r), r.uniform(-0.8, 0.8)), tm + j * r.uniform(0.25, 0.45), r.uniform(0.25, 0.6))
        tm += r.exponential(2.2) + 0.8
    if people:
        for k in range(8):
            place(out, pan(G.babble(dur, r, r.uniform(100, 220), r.uniform(0.9, 1.2), active=0.55), r.uniform(-0.9, 0.9)), 0, 0.12)
    return out

def cheer(dur, r):
    out = np.zeros((2, ns(dur)))
    for k in range(14):
        kid = k % 5 == 0
        place(out, pan(G.hurrah(r, r.uniform(120, 200) * (1.6 if kid else 1), r.uniform(0.95, 1.15), kid), r.uniform(-0.9, 0.9)), r.uniform(0, 0.5), r.uniform(0.4, 0.8))
    out += st(G.applause(dur, r, people=30)) * 0.5
    return out

def scrape(dur, r):
    """ice grinding along steel: crackle, low groan, crunches"""
    n = ns(dur); t = np.arange(n) / SR
    env = np.clip(t / 0.06, 0, 1) * np.clip((dur - t) / 0.6, 0, 1)
    grind = shape(colored(n, r, 0.3), lambda T, F: np.exp(-0.5 * (np.log2(np.maximum(F[:, None], 20) / 600) / 1.4) ** 2), 1024, 256)
    grind *= (0.7 + 0.3 * smooth_noise(n, r, 9)) * env
    crack = G.rattle(dur, r, density=45, heavy=True) * env
    groan = G.creak(dur, r, rate0=28, rate1=40, rough=0.3, scale=0.6) * env * 0.8
    boom = np.exp(-t / 0.4) * np.sin(phase(45 * (1 + 0.4 * np.exp(-t / 0.05)))) * 1.5
    return grind * 1.2 + crack * 0.7 + groan + boom

def small_splash(r):
    d = 0.9; t = tt(d)
    slap = bp(r.standard_normal(len(t)), 400, 6000, 1) * np.exp(-t / 0.03)
    bub = G.bubbles(d, r, 500 * np.exp(-t / 0.2) + 10, 400, 3000, (0.004, 0.02), np.exp(-t / 0.3))
    return fades(slap + bub * 0.8, 0.0, 0.1)

def ice_thud(r):
    d = 0.4; t = tt(d)
    return modal(d, [(r.uniform(140, 220), 1.0, 0.06), (r.uniform(500, 800), 0.5, 0.03), (r.uniform(1500, 2300), 0.3, 0.015)], r) + \
        bp(r.standard_normal(len(t)), 300, 4000, 1) * np.exp(-t / 0.01) * 0.6

def water_rush(dur, r, level=1.0):
    n = ns(dur); t = np.arange(n) / SR
    env = np.clip(t / 0.15, 0, 1) * np.clip((dur - t) / 0.4, 0, 1)
    rush = shape(colored(n, r, 0.5), lambda T, F: np.exp(-0.5 * (np.log2(np.maximum(F[:, None], 20) / 1100) / 1.6) ** 2), 1024, 256)
    bub = G.bubbles(dur, r, 300, 250, 2200, (0.006, 0.03))
    return (rush * (0.8 + 0.2 * smooth_noise(n, r, 6)) + bub * 0.7) * env * level

def pour(dur, r, f0=1800):
    n = ns(dur); t = np.arange(n) / SR
    env = np.clip(t / 0.05, 0, 1) * np.clip((dur - t) / 0.15, 0, 1)
    stream = bp(colored(n, r, 0.2), f0 * 0.5, f0 * 2.5, 1) * (0.7 + 0.3 * smooth_noise(n, r, 12))
    bub = G.bubbles(dur, r, 220, f0 * 0.6, f0 * 2.2, (0.003, 0.012), rise=(10, 25))
    return (stream * 0.5 + bub) * env

def morse(text, unit=0.065, f=720):
    code = {"C": "-.-.", "Q": "--.-", "D": "-..", "S": "...", "O": "---"}
    seq = []
    for ch in text:
        for s in code[ch]:
            seq.append((3 if s == "-" else 1, True)); seq.append((1, False))
        seq.append((2, False))
    n = ns(sum(u for u, _ in seq) * unit) + 10
    y = np.zeros(n); k = 0
    for u, on in seq:
        L = ns(u * unit)
        if on:
            tl = np.arange(L) / SR
            y[k:k + L] = np.sin(TAU * f * tl) * np.clip(tl / 0.004, 0, 1) * np.clip((u * unit - tl) / 0.004, 0, 1)
        k += L
    return y * 0.5

def tick(r):
    return modal(0.12, [(3200, 1.0, 0.012), (5100, 0.5, 0.006)], r) + hp(r.standard_normal(ns(0.12)), 3000) * np.exp(-tt(0.12) / 0.002) * 0.4

def chatter(dur, r):
    n = ns(dur); y = np.zeros(n); tm = 0.0
    while tm < dur:
        c = modal(0.04, [(r.uniform(1800, 2600), 1.0, 0.004), (r.uniform(3500, 4500), 0.4, 0.002)], r)
        k = ns(tm); L = min(len(c), n - k)
        if L > 0: y[k:k + L] += c[:L] * r.uniform(0.5, 1)
        tm += r.uniform(0.045, 0.07)
    return y * np.sin(np.pi * np.arange(n) / n) ** 0.5

def low_groan(dur, r):
    n = ns(dur); t = np.arange(n) / SR
    g = G.creak(dur, r, rate0=18, rate1=26, rough=0.35, scale=0.45)
    rum = lp(colored(n, r, 2.0), 90, 2) * 1.5
    env = np.clip(t / 0.4, 0, 1) * np.clip((dur - t) / 0.5, 0, 1)
    return (g * 0.9 + rum) * env

def swell(dur, r):
    """reverse-cymbal style swell into a flash"""
    n = ns(dur); t = np.arange(n) / SR
    return hp(colored(n, r, 0.2), 2500) * (t / dur) ** 3 * 0.6

# ---------------------------------------------------------------- SFX table
def build_sfx():
    r = rng(5)
    S = np.zeros((2, N))
    def ev(t, x, db=0.0, p=0.0, name=""):
        x = np.asarray(x, float)
        place(S, pan(x, p) if x.ndim == 1 else x, t, dbg(db)); CUES.append((t, name or "sfx", db))
    def bed(t0, t1, x, db, name, fin=0.3, fout=0.4):
        x = st(x)[:, : ns(t1 - t0)]
        n = x.shape[1]; e = np.ones(n)
        a, b = ns(fin), ns(fout); e[:a] = ramp(a); e[n - b:] *= ramp(b)[::-1]
        place(S, x * e[None, :], t0, dbg(db)); CUES.append((t0, f"bed {name} -> {t1:.2f}", db))
    # beds
    bed(0.0, 2.75, night_sea(2.8, r), -6, "night sea + engines")
    bed(2.6, 17.95, harbor(15.4, r), -9, "Southampton harbour")
    bed(17.8, 36.1, night_sea(18.4, r), -6, "night sea + engines")
    bed(36.0, 47.7, st(lp(colored(ns(11.7), r, 1.8), 200, 2)) * 0.5 + G.water_bed(11.7, r, close=0.6, slosh_rate=0.5) * 0.4, -8, "cutaway hull tone")
    bed(47.6, 52.5, G.breeze(4.9, r, level=0.35), -12, "tray: outdoor air")
    bed(52.4, 60.1, night_sea(7.7, r, hum=False), -7, "calm sea after")
    bed(57.25, 60.2, harbor(3.0, r, people=False), -10, "harbour (rules)")
    bed(60.0, 62.0, night_sea(2.0, r, hum=True), -9, "night deck (radio)")
    bed(61.8, DUR, st(lp(colored(ns(DUR - 61.8), r, 1.5), 400, 2)) * 0.15 + sum(pan(G.babble(DUR - 61.8, r, r.uniform(100, 200), r.uniform(0.9, 1.2), active=0.5), r.uniform(-0.8, 0.8)) for _ in range(9)) * 0.12, -8, "auction room murmur")
    # hook
    ev(2.15, swell(0.5, r), -10, 0, "swell into flash")
    ev(2.63, G.whoosh(0.7, r, peak=0.05, f_lo=600, f_hi=4000), -9, 0, "flash whoosh")
    ev(2.75, steam_whistle(2.2, r), -8, 0.2, "steam whistle")
    ev(5.0, steam_whistle(1.6, r), -12, 0.2, "steam whistle 2")
    ev(8.0, cheer(2.6, r), -8, 0, "crowd cheers 'unsinkable'")
    ev(11.39, G.push_thump(r), -6, -0.2, "nudge")
    for k in range(6): ev(12.45 + k * 0.52, G.stroll_step(r, 0.6), -11, -0.2, "Blair steps")
    for k in range(3): ev(13.24 + k * 0.07, G.clink(r, 3200 + 600 * k, 0.15), -12, 0.25, "key jingle")
    ev(14.62, G.whoosh(0.5, r, peak=0.08), -14, 0, "cut whoosh")
    ev(16.24, G.creak(0.4, r, rate0=140, rate1=220, scale=0.8), -14, 0.2, "locker creak")
    ev(17.08, G.rattle(0.35, r, density=60), -9, 0.3, "padlock rattle")
    ev(17.85, G.whoosh(0.9, r, peak=0.4, f_lo=250, f_hi=1500), -12, 0, "to night")
    ev(21.75, G.breeze(1.6, r, level=1.2, gust=0.6, bright=1400), -8, 0, "cold gust")
    ev(21.9, chatter(0.7, r), -14, 0.25, "teeth chatter")
    ev(25.7, G.creak(1.4, r, rate0=30, rate1=22, rough=0.25, scale=0.5), -12, -0.3, "ice groan")
    ev(27.7, G.whoosh(0.4, r, peak=0.06, f_lo=500, f_hi=3000), -12, 0, "spot whoosh")
    for k, b in enumerate([150, 120]): ev(27.78 + 0.05 * k, G.whoa(r, base=b), -14, -0.3 + 0.6 * k, "gasp")
    for k in range(5): ev(28.72 + k * 0.29, tick(r), -15, 0.1, "clock tick")
    for c in (30.17, 30.48, 30.82): ev(c, bell(1180, r), -6, 0.15, "crow's nest bell")
    ev(32.7, low_groan(1.8, r), -8, 0, "hull swings")
    ev(32.6, G.whoosh(1.0, r, peak=0.5, f_lo=200, f_hi=1200), -12, 0, "turn whoosh")
    ev(34.36, scrape(1.6, r), -4, -0.2, "ice scrapes the hull")
    for k in range(7): ev(34.5 + k * 0.17, ice_thud(r), -12, r.uniform(-0.6, 0.6), "ice chunk")
    for k in range(4): ev(35.0 + k * 0.2, small_splash(r), -14, r.uniform(-0.6, 0.2), "ice splash")
    ev(37.35, water_rush(1.6, r), -7, -0.2, "water bursts in")
    ev(38.95, water_rush(6.0, r, 0.6), -12, 0.0, "compartments flooding")
    for t0 in (42.85, 44.59): ev(t0, G.bubbles(0.8, r, 300, 200, 1200, (0.01, 0.04)), -10, 0, "glug")
    ev(46.2, pour(1.6, r, 900), -10, -0.3, "water over the wall")
    ev(48.95, G.creak(0.25, r, rate0=300, rate1=500, scale=1.3), -14, -0.3, "tap squeak")
    ev(49.18, pour(3.0, r, 2200), -11, -0.25, "tap pours")
    for t0 in (50.37, 51.04, 51.45, 52.04): ev(t0, G.bubbles(0.35, r, 140, 1500, 4000, (0.003, 0.01), rise=(10, 30)), -12, 0.1, "trickle into next cell")
    ev(52.45, G.whoosh(0.8, r, peak=0.3, f_lo=200, f_hi=900), -12, 0, "to the sinking")
    ev(52.6, low_groan(2.2, r), -8, 0, "hull groans")
    ev(54.65, G.whoosh(1.2, r, peak=0.15, f_lo=150, f_hi=700), -10, 0, "gone")
    for k in range(3): ev(55.2 + k * 0.9, G.creak(0.35, r, rate0=90, rate1=70, scale=0.8), -18, -0.4, "oar creak")
    ev(57.2, G.whoosh(0.6, r, peak=0.12), -14, 0, "to day")
    ev(58.9, I.triangle(0.5, r), -14, 0.3, "ding")
    ev(60.12, morse("CQD"), -13, 0.25, "morse CQD")
    ev(61.85, G.whoosh(0.6, r, peak=0.12), -14, 0, "to the auction")
    ev(W("sold") - 0.005, G.hammer_hit(r, 1.2), -4, -0.2, "gavel")
    for k in range(6): ev(65.02 + r.uniform(0, 0.15), G.whoa(r, base=r.uniform(110, 200)), -12, r.uniform(-0.8, 0.8), "bidders gasp")
    return S

def W(word):
    for w in WORDS:
        if w["w"].lower().strip(".,!?'") == word: return w["s"]
    raise KeyError(word)

# ---------------------------------------------------------------- score
BEAT = 60 / 112
def m2f(m): return 440.0 * 2 ** ((m - 69) / 12)
class Score:
    def __init__(self): self.buf = np.zeros((2, N)); self.r = rng(9)
    def add(self, x, t, g=1.0, p=0.0):
        x = np.asarray(x, float); place(self.buf, pan(x, p) if x.ndim == 1 else x, t, g)
    def pl(self, t, m, v=0.6, d=0.9, p=0.0, b=0.5): self.add(I.pluck(m2f(m), v, self.r, d, b), t, 1, p)
    def gl(self, t, m, v=0.5, d=1.6, p=0.15): self.add(I.glock(m2f(m), v, self.r, d), t, 0.55, p)
    def vb(self, t, m, v=0.45, d=1.8, p=-0.15): self.add(I.vibes(m2f(m), v, self.r, d), t, 0.6, p)
    def mb(self, t, m, v=0.5, d=1.8, p=0.1): self.add(I.musicbox(m2f(m), v, self.r, d), t, 0.6, p)
    def pad(self, t, ms, d, v=0.35, att=0.6, rel=0.9, warm=900): self.add(I.pad([m2f(m) for m in ms], d, v, self.r, att, rel, warm), t, 1.0)
    def br(self, t, m, d, v=0.6, kind="horn", p=0.0): self.add(I.brass(m2f(m), d, v, self.r, kind), t, 0.5, p)
    def timp(self, t, m, v=0.8): self.add(I.timpani(m2f(m), v, self.r), t, 0.9, 0)
    def cym(self, t, v=0.5): self.add(I.cymbal(v, self.r), t, 0.4, 0.1)
    def tri(self, t, v=0.4): self.add(I.triangle(v, self.r), t, 0.4, 0.3)
    def snare_roll(self, t0, t1, v0, v1): self.add(I.snare_roll(t0, t1, v0, v1, self.r), 0, 0.35, -0.1) if False else self._roll(t0, t1, v0, v1)
    def _roll(self, t0, t1, v0, v1):
        k = 0; tm = t0
        while tm < t1:
            u = (tm - t0) / max(1e-3, t1 - t0)
            self.add(I.snare(v0 + (v1 - v0) * u, self.r, 0.2), tm, 0.3, -0.1); tm += 1 / 26; k += 1

D_MAJ = {"D": [50, 54, 57], "G": [55, 59, 62], "A": [57, 61, 64], "Bm": [59, 62, 66], "Em": [52, 55, 59]}
MEL = [(0, 74, 1), (1, 78, .5), (1.5, 81, .5), (2, 79, 1), (3, 78, 1), (4, 76, 1), (5, 74, .5), (5.5, 76, .5), (6, 78, 2),
       (8, 79, 1), (9, 81, 1), (10, 83, 1), (11, 81, 1), (12, 78, 1.5), (13.5, 76, .5), (14, 74, 2)]
def light_theme(sc, t0, t1, prog=("D", "G", "A", "D"), mel=True, vel=0.6, glock=True):
    bar = 4 * BEAT; b = 0
    while t0 + b * bar < t1 - 0.05:
        tb = t0 + b * bar; ch = D_MAJ[prog[b % len(prog)]]
        for k in range(4):
            tk = tb + k * BEAT
            if tk >= t1: break
            sc.pl(tk, ch[0] - 12 if k % 2 == 0 else ch[2] - 12, vel * 0.9, 0.5, -0.2, 0.4)
            for j, m in enumerate(ch): sc.pl(tk + BEAT / 2, m + 12, vel * 0.35, 0.3, 0.3 - 0.2 * j, 0.6)
        if mel and glock:
            for (bt, m, d) in MEL:
                if (b % 4) * 4 <= bt < (b % 4) * 4 + 4:
                    tk = tb + (bt - (b % 4) * 4) * BEAT
                    if tk < t1 - 0.1: sc.gl(tk, m, vel * 0.8, 1.2)
        b += 1

def build_music():
    sc = Score()
    # 1 hook: music box Dm arpeggio + low pad, swell into the flash
    for k, m in enumerate([74, 77, 81, 76, 74, 69]): sc.mb(0.1 + k * 0.42, m, 0.5)
    sc.pad(0.0, [38, 50, 53, 57], 2.6, 0.3, att=0.8, rel=0.4)
    # 2 Southampton: bright theme; brass + triangle on "unsinkable"
    sc.cym(2.63, 0.35)
    light_theme(sc, 2.63, 11.3)
    t_u = W("unsinkable")
    for m in (62, 66, 69): sc.br(t_u - 0.02, m, 0.8, 0.7, "stab", 0.1)
    sc.tri(t_u, 0.5)
    # 3 bumped: the theme stops; a sad low brass line as Blair walks off; key glint arpeggio
    for k, m in enumerate([57, 56, 55, 54]): sc.br(11.45 + k * 0.6, m, 0.55, 0.45, "soft", -0.1)
    for k in range(6): sc.pl(11.45 + k * 0.6, 38 if k % 2 == 0 else 45, 0.45, 0.5, -0.2, 0.3)
    for k, m in enumerate([86, 90, 93, 98]): sc.gl(W("key") + 0.0 + k * 0.07 if False else 13.28 + k * 0.07, m, 0.35, 1.0)
    # 4 locker: mystery pizz, stop with a "?" on "binoculars"
    for k, m in enumerate([62, 65, 69, 68, 62, 65, 69, 70, 62, 65, 69, 68]): sc.pl(14.65 + k * BEAT / 2, m, 0.45, 0.25, 0.1, 0.7)
    sc.gl(17.12, 81, 0.5, 1.2); sc.gl(17.34, 86, 0.45, 1.6)
    # 5-6 night: cold pad + slow vibes arpeggio; ominous hit on "iceberg"
    sc.pad(17.9, [38, 50, 53, 57, 64], 9.3, 0.32, att=1.5, rel=1.2, warm=700)
    for k in range(16):
        tk = 18.2 + k * BEAT
        if tk < 27.0: sc.vb(tk, [62, 65, 69, 72, 76, 72, 69, 65][k % 8], 0.32)
    for k in range(6): sc.pl(23.75 + k * BEAT, 38, 0.35 + 0.05 * k, 0.6, -0.1, 0.3)
    sc.timp(25.72, 38, 0.9); sc.br(25.72, 38, 1.3, 0.5, "soft", 0)
    # 7-9 alarm: pulsing eighths, chords Dm - Bb - Gm - A, roll into the scrape, crash
    chords = [(27.0, 29.6, [50, 53, 57]), (29.6, 31.3, [46, 50, 53]), (31.3, 32.4, [43, 46, 50]), (32.4, 34.36, [45, 49, 52])]
    for (a, b, ch) in chords:
        sc.pad(a, [c + 12 for c in ch] + [ch[0] - 12], b - a, 0.28, att=0.15, rel=0.3, warm=1200)
        tk = a; k = 0
        while tk < b:
            u = (tk - 27.0) / 7.36
            sc.pl(tk, ch[0] - 12 if k % 2 == 0 else ch[0], 0.45 + 0.35 * u, 0.25, -0.15, 0.5 + 0.3 * u); tk += BEAT / 2; k += 1
    sc.timp(27.75, 38, 0.7)
    sc._roll(33.3, 34.34, 0.15, 0.9)
    sc.cym(34.36, 0.8); sc.timp(34.36, 38, 1.0)
    for m in (50, 53, 57): sc.br(34.36, m, 0.9, 0.8, "stab", 0)
    # 10 luckily: quick major arpeggio; 11 unluckily: gentle minor fall
    for k, m in enumerate([74, 78, 81, 86]): sc.gl(W("luckily") + k * 0.08, m, 0.45, 1.2)
    sc.pad(35.93, [62, 66, 69], 1.3, 0.22, att=0.1, rel=0.4)
    for k, m in enumerate([69, 65, 62]): sc.vb(W("unluckily") + 0.05 + k * 0.32, m, 0.45)
    sc.pad(37.45, [50, 53, 57], 1.5, 0.22, att=0.2, rel=0.5)
    # 12-13 explanation: curious pizz pulse in D minor, counting glocks on "sixteen", "four", "five"
    t = 38.9; k = 0
    prog = [[50, 53, 57], [50, 53, 57], [46, 50, 53], [45, 49, 52]]
    while t < 47.6:
        ch = prog[int((t - 38.9) / (4 * BEAT)) % 4]
        sc.pl(t, ch[0] - 12, 0.5, 0.4, -0.2, 0.4)
        sc.pl(t + BEAT / 2, ch[1] + 12, 0.25, 0.25, 0.25, 0.6); sc.pl(t + BEAT / 2, ch[2] + 12, 0.22, 0.25, 0.35, 0.6)
        t += BEAT; k += 1
    for k in range(8): sc.gl(W("sixteen") + k * 0.06, 74 + [0, 2, 3, 5, 7, 8, 10, 12][k], 0.25, 0.8)
    for k in range(4): sc.gl(42.85 + k * 0.12, 81, 0.35, 0.6)
    sc.gl(44.59, 80, 0.5, 1.4); sc.timp(44.59, 38, 0.6)
    sc.pad(45.3, [50, 57, 62, 65], 2.4, 0.28, att=1.6, rel=0.4)
    # 14 tray: light theme fragment, runs on the spills
    light_theme(sc, 47.67, 52.4, prog=("D", "G", "A", "D"), vel=0.5)
    for k, m in enumerate([74, 76, 78, 79, 81]): sc.gl(50.37 + k * 0.06, m, 0.3, 0.8)
    for t0, m in ((51.04, 86), (52.04, 88)): sc.gl(t0, m, 0.35, 1.0)
    # 15-16 sinking + after: somber pad, slow music box, no percussion
    for (a, d, ch) in [(52.43, 1.6, [38, 50, 53, 57]), (54.0, 1.6, [34, 46, 50, 53]), (55.6, 1.7, [41, 53, 57, 60]), (57.2, 0.4, [45, 52, 57, 61])]:
        sc.pad(a, ch, d, 0.3, att=0.5, rel=0.9, warm=650)
    for k, m in enumerate([69, 65, 62, 64, 65, 64, 62]): sc.mb(52.6 + k * 0.62, m, 0.35)
    # 17-18 rules: hopeful
    sc.pad(57.3, [50, 54, 57, 62], 2.1, 0.26, att=0.4, rel=0.4); sc.pad(59.4, [43, 55, 59, 62], 2.0, 0.26, att=0.4, rel=0.4)
    for k, m in enumerate([74, 78, 81, 79, 78, 76, 74, 78]): sc.gl(57.4 + k * BEAT, m, 0.3, 1.0)
    for k in range(8): sc.pl(57.3 + k * BEAT, 38 if k % 2 == 0 else 45, 0.35, 0.5, -0.2, 0.3)
    # 19 auction: playful theme, stop-time on the gavel, brass on "ninety thousand", button
    light_theme(sc, 61.92, W("sold") - 0.05, prog=("D", "Bm", "G", "A"), vel=0.5)
    sc.br(65.0, 62, 0.5, 0.8, "stab", 0); sc.br(65.0, 66, 0.5, 0.8, "stab", 0); sc.br(65.0, 69, 0.5, 0.8, "stab", 0)
    light_theme(sc, 65.6, 68.25, prog=("D", "G", "A", "D"), vel=0.5)
    for m in (50, 57, 62, 66): sc.pl(68.32, m, 0.6, 0.9, 0, 0.5)
    sc.gl(68.32, 86, 0.6, 1.5); sc.tri(68.32, 0.4)
    for k, m in enumerate([86, 90, 93]): sc.gl(66.41 + k * 0.08, m, 0.3, 1.0)
    # room for the reverb
    ir = make_ir(1.4, 3, pre=0.015)
    wet = convolve_st(sc.buf, ir)
    return sc.buf + 0.22 * wet

# ---------------------------------------------------------------- mix
def speech_env():
    """1 where the voice speaks (from words.json), 0 in gaps; smoothed for the duck"""
    e = np.zeros(N)
    for w in WORDS: e[ns(w["s"]): ns(w["e"])] = 1
    k = ns(0.12)
    e = np.convolve(e, np.ones(k) / k, "same")
    return np.clip(e * 1.5, 0, 1)

def limiter(x, ceil_db):
    c = dbg(ceil_db)
    up = signal.resample_poly(x, 4, 1, axis=-1)
    pk = np.abs(up).max(axis=0)
    pk = pk.reshape(-1, 4).max(axis=1)[: x.shape[1]] if len(pk) >= 4 * x.shape[1] else np.pad(pk, (0, 4 * x.shape[1] - len(pk))).reshape(-1, 4).max(axis=1)
    g = np.minimum(1.0, c / np.maximum(pk, 1e-9))
    la = ns(0.004)
    g = -np.convolve(-g, np.ones(1), "same")
    gm = np.minimum.accumulate(np.r_[g[la:], np.ones(la)][::-1])[::-1] if False else g
    from scipy.ndimage import minimum_filter1d
    gm = minimum_filter1d(g, size=2 * la + 1)
    rel = ns(0.06)
    sm = signal.lfilter([1 - np.exp(-1 / rel)], [1, -np.exp(-1 / rel)], gm)
    gfin = np.minimum(gm, sm)
    return x * gfin[None, :]

def main():
    v = load_voice()
    sfx = build_sfx()
    mus = build_music()
    V = st(v)
    lv = integrated(V)
    lm = integrated(mus); ls = integrated(sfx)
    print(f"raw LUFS voice {lv:.1f} music {lm:.1f} sfx {ls:.1f}")
    # music bed ~10 LU under the voice, ducked another 3 dB while words are spoken; SFX ~6 dB under (peaks)
    mus *= dbg(lv - 7.0 - lm)
    duck = dbg(-3.5 * speech_env())
    mus *= duck[None, :]
    sfx *= dbg(lv - 11.0 - ls)
    mix = V + mus + sfx
    g = dbg(-15.0 - integrated(mix))
    mix *= g; V *= g; mus *= g; sfx *= g
    mix = limiter(mix, -1.4)
    # fade the very end
    mix[:, -ns(0.15):] *= ramp(ns(0.15))[::-1][None, :]
    print(f"mix LUFS {integrated(mix):.2f}, true peak {true_peak(mix):.2f} dBTP, length {mix.shape[1] / SR:.3f} s")
    write_wav(os.path.join(HERE, "mix.wav"), mix)
    for name, x in (("voice", V), ("music", mus), ("sfx", sfx)): write_wav(os.path.join(HERE, f"stem_{name}.wav"), x)
    with open(os.path.join(HERE, "cues.md"), "w") as fh:
        fh.write("# SFX cues (time s, gain dB, event)\n\n")
        for t, name, db in sorted(CUES): fh.write(f"- {t:7.2f}  {db:+5.1f}  {name}\n")

if __name__ == "__main__":
    main()
