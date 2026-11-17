# Kokoro TTS per sentence -> voice.wav (24 kHz) + words.json (word onsets/ends estimated from phoneme counts,
# boundaries snapped to energy dips). usage: python voice/tts.py <model dir> <voice> <speed>
import sys, json, re, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
md, vname, speed = sys.argv[1], sys.argv[2], float(sys.argv[3])
k = Kokoro(f"{md}/kokoro.onnx", f"{md}/voices.bin")
lines = [l.strip() for l in open("SCRIPT.md").read().split("## Script")[1].strip().splitlines() if l.strip()]
SR = 24000
GAP = {".": 0.16, "?": 0.2, "!": 0.16}
out, words, t = [], [], 0.0
lead = np.zeros(int(0.05 * SR), np.float32); out.append(lead); t += len(lead) / SR
def trim(a):
    e = np.abs(a) > 0.01
    i0 = max(0, np.argmax(e) - int(0.02 * SR)); i1 = min(len(a), len(a) - np.argmax(e[::-1]) + int(0.04 * SR))
    return a[i0:i1]
for li, line in enumerate(lines):
    # split multi-sentence lines so each sentence keeps its own prosody
    for sent in re.findall(r"[^.!?]+[.!?]", line):
        sent = sent.strip()
        a, sr = k.create(sent, voice=vname, speed=speed, lang="en-us")
        assert sr == SR
        a = trim(a.astype(np.float32))
        toks = sent.split()
        ph = [max(1, len(k.tokenizer.phonemize(re.sub(r"[^\w'-]", "", w) or w, "en-us"))) for w in toks]
        # proportional estimate, then snap each inner boundary to the quietest 10 ms window within +-80 ms
        dur = len(a) / SR
        env = np.sqrt(np.convolve(a ** 2, np.ones(240) / 240, "same"))
        cum = np.cumsum([0] + ph) / sum(ph)
        bounds = [0.0]
        for c in cum[1:-1]:
            s = int(c * dur * SR); w = int(0.08 * SR)
            lo, hi = max(1, s - w), min(len(a) - 1, s + w)
            bounds.append((lo + int(np.argmin(env[lo:hi]))) / SR)
        bounds.append(dur)
        for i in range(1, len(bounds) - 1):  # keep every word at least 60 ms long
            bounds[i] = min(max(bounds[i], bounds[i - 1] + 0.06), dur - 0.06 * (len(bounds) - 1 - i))
        for i, w in enumerate(toks):
            words.append({"w": w, "s": round(t + bounds[i], 3), "e": round(t + bounds[i + 1], 3), "line": li})
        out.append(a); t += dur
        g = np.zeros(int(GAP.get(sent[-1], 0.15) * SR), np.float32); out.append(g); t += len(g) / SR
audio = np.concatenate(out)
sf.write("voice/voice.wav", audio, SR)
json.dump(words, open("voice/words.json", "w"), indent=0)
print(f"{len(words)} words, {t:.2f} s, {len(words)/t:.2f} w/s")
