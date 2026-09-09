#!/usr/bin/env python3
"""Assemble the growing cumulative nidra practices from reusable stage cores.

Each milestone N = _open + (stage cores 2..N) + close.  The close re-affirms the
resolve once sankalpa (module 2) is in the set, otherwise it is a plain return.
Builds every milestone whose stage cores all exist, so it can be re-run as more
cores are authored.  Renders with the practice voice (pp.py), loudness-normalises,
transcodes to m4a, and prints a manifest snippet.
"""
import subprocess, os, sys, json, wave, hashlib
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CDIR = os.path.join(ROOT, 'content', 'cumulative')
ADIR = os.path.join(ROOT, 'audio', 'cumulative')
os.makedirs(ADIR, exist_ok=True)

# (module, id, core filename or None for stages carried by _open/close)
# Sankalpa is now learned last (its own module), so the cumulative flow is
# sans-sankalpa: the woven technique-sequence with a plain close.
STAGES = [
    (1, 'stillness',   None),
    (2, 'pratyahara',  'pratyahara.txt'),
    (3, 'nyasa',       'nyasa.txt'),
    (4, 'breath',      'breath.txt'),
    (5, 'opposites',   'opposites.txt'),
    (6, 'inner-space', 'inner-space.txt'),
    (7, 'witness',     'witness.txt'),
]
JOIN = '\n\n<break time="4.0s" />\n\n'
TARGET_RMS, PEAK_CAP, THR = 3200.0, 29000.0, 200.0
WANT = set(int(x) for x in sys.argv[1:]) if len(sys.argv) > 1 else None  # optional: only build these milestones

def read(name):
    return open(os.path.join(CDIR, name)).read().strip()

def normalise(src, dst, m4a):
    w = wave.open(src, 'rb'); a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64); sr = w.getframerate(); w.close()
    win = int(0.05 * sr); rms = [np.sqrt(np.mean(a[i:i+win]**2)) for i in range(0, len(a)-win, win)]; rms = [r for r in rms if r > THR]
    gain = TARGET_RMS / (np.median(rms) if rms else TARGET_RMS)
    peak = np.max(np.abs(a)) + 1e-9
    if peak * gain > PEAK_CAP: gain = PEAK_CAP / peak
    ai = np.clip(np.round(a * gain), -32768, 32767).astype(np.int16)
    w = wave.open(dst, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(ai.tobytes()); w.close()
    subprocess.run(['ffmpeg', '-y', '-i', dst, '-c:a', 'aac', '-b:a', '64k', '-ac', '1', '-movflags', '+faststart', m4a, '-loglevel', 'error'], check=True)
    return len(ai) / sr, hashlib.sha1(open(m4a, 'rb').read()).hexdigest()[:8]

def core_exists(fn):
    return fn is None or os.path.exists(os.path.join(CDIR, fn))

open_txt = read('_open.txt')
manifest = []
for i, (mod, sid, fn) in enumerate(STAGES):
    # milestone `mod` includes stage cores for modules 2..mod
    cores = [s for s in STAGES[1:i+1]]
    if not all(core_exists(c[2]) for c in cores):
        break  # stop at the first milestone whose cores aren't authored yet
    if WANT and mod not in WANT:
        continue
    close_txt = read('_close_plain.txt')   # sans-sankalpa flow → always the plain return
    parts = [open_txt] + [read(c[2]) for c in cores if c[2]] + [close_txt]
    script = JOIN.join(parts)
    stem = f'cumulative_{mod}'
    txt = os.path.join(CDIR, stem + '.txt'); open(txt, 'w').write(script + '\n')
    subprocess.run(['python3', os.path.join(ROOT, 'tools', 'pp.py'), txt], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    wav = os.path.join(CDIR, stem + '.wav')
    dur, h = normalise(wav, os.path.join(ADIR, stem + '.wav'), os.path.join(ADIR, stem + '.m4a'))
    os.remove(wav)
    manifest.append({'module': mod, 'through': sid, 'audio': f'audio/cumulative/{stem}.m4a?v={h}', 'durationSec': round(dur, 1)})
    print(f'built milestone {mod} (through {sid}): {dur:.1f}s  v={h}')

print('\n--- manifest.cumulative ---')
print(json.dumps(manifest, indent=2, ensure_ascii=False))
