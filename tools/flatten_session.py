#!/usr/bin/env python3
"""Reproduce the session engine's stitching offline, so a session can be tested
as a single file. Two modes:
  full  <sid>  -> the whole stitched recording (what the engine actually plays)
  seams <sid>  -> just ~1.5s either side of every clip join, for a fast tour
Pause lengths use the engine's rules (resolve=RESOLVE, breath=as-is, rest*PACE).
"""
import json, subprocess, os, wave, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.getcwd()
SR = 24000
PACE = 1.0
RESOLVE = 24
man = json.load(open(os.path.join(ROOT, 'manifest.json')))


def clip_path(cid):
    return os.path.join(ROOT, man['sessionClips'][cid]['audio'].split('?')[0])


def decode(path):
    raw = subprocess.check_output(['ffmpeg', '-v', 'quiet', '-i', path, '-f', 's16le', '-ar', str(SR), '-ac', '1', '-'])
    return np.frombuffer(raw, dtype=np.int16)


def sil(seconds):
    return np.zeros(int(seconds * SR), dtype=np.int16)


def pause_len(s):
    if s['kind'] == 'resolve':
        return RESOLVE
    if s['kind'] == 'breath':
        return s['pause']
    return round(s['pause'] * PACE)


def encode(audio, name):
    wav = os.path.join(OUT, name + '.wav')
    m4a = os.path.join(OUT, name + '.m4a')
    w = wave.open(wav, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(audio.tobytes()); w.close()
    subprocess.run(['ffmpeg', '-y', '-v', 'quiet', '-i', wav, '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', m4a], check=True)
    os.remove(wav)
    return m4a, len(audio) / SR


def full(sid, name):
    parts = []
    for s in man['sessions'][sid]:
        parts.append(sil(pause_len(s)) if s.get('pause') is not None else decode(clip_path(s['clip'])))
    return encode(np.concatenate(parts), name)


def seams(sid, name):
    steps = man['sessions'][sid]
    out = []
    prev = None; pending = 0
    T = int(1.5 * SR)
    for s in steps:
        if s.get('pause') is not None:
            pending += pause_len(s)
        else:
            cur = decode(clip_path(s['clip']))
            if prev is not None:
                out.append(prev[-T:])
                out.append(sil(min(pending, 1.5)))
                out.append(cur[:T])
                out.append(sil(1.0))     # separator between seam samples
            prev = cur; pending = 0
    return encode(np.concatenate(out), name)


if __name__ == '__main__':
    mode, sid, name = sys.argv[1], sys.argv[2], sys.argv[3]
    m4a, dur = (full if mode == 'full' else seams)(sid, name)
    print(f'{name}: {dur/60:.1f} min  ({dur:.0f}s)  -> {m4a}')
