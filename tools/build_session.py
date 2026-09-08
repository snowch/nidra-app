#!/usr/bin/env python3
"""Segment full nidra scripts into clips + adjustable pause steps for the
session engine.  Pauses >= THRESHOLD become engine steps (adjustable); shorter
breaks stay baked into the clip.  Resolve pauses (preceded by "three times")
are tagged so the engine can size them from the user's sankalpa.

  python3 build_session.py dry     # print the step plan, render nothing
  python3 build_session.py build   # render clips (dedup by text) + emit manifest
"""
import re, sys, os, hashlib, json, subprocess, wave
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, 'content')
ADIR = os.path.join(ROOT, 'audio', 'session')
THRESHOLD = 10.0
TARGET_RMS, PEAK_CAP, THR = 3200.0, 29000.0, 200.0
BREAK_RE = r'<break\s+time=["\']([\d.]+)s["\']\s*/?>'

RECS = {
    '14:extended':       'nidra_14_build-your-own_extended.txt',
    '14:unaided':        'nidra_14_build-your-own_unaided.txt',
    '14:extended_sleep': 'nidra_14_build-your-own_extended_sleep.txt',
    '14:unaided_sleep':  'nidra_14_build-your-own_unaided_sleep.txt',
}


def parse(text):
    parts = re.split(BREAK_RE, text, flags=re.IGNORECASE)
    segs = []
    for i, p in enumerate(parts):
        if i % 2 == 1:
            segs.append(('pause', float(p)))
        elif p.strip():
            segs.append(('speech', p.strip()))
    return segs


def segment(text):
    """-> list of steps: ('clip', clip_text) | ('pause', seconds, kind)"""
    segs = parse(text)
    steps, buf, last = [], [], ''

    def flush():
        nonlocal buf
        if any(k == 'speech' for k, _ in buf):
            parts = [v if k == 'speech' else f'<break time="{v}s" />' for k, v in buf]
            steps.append(('clip', '\n\n'.join(parts)))
        buf = []

    for k, v in segs:
        if k == 'speech':
            buf.append((k, v)); last = v
        elif v >= THRESHOLD:
            flush()
            kind = ('resolve' if 'three times' in last.lower()
                    else 'breath' if v >= 100 else 'rest')
            steps.append(('pause', v, kind))
        else:
            buf.append((k, v))
    flush()
    return steps


def words(t):
    return len(re.sub(BREAK_RE, ' ', t).split())


def dry():
    for rid, fn in RECS.items():
        p = os.path.join(CONTENT, fn)
        if not os.path.exists(p):
            print(f'{rid}: MISSING {fn}'); continue
        steps = segment(open(p).read())
        clips = [s for s in steps if s[0] == 'clip']
        pauses = [s for s in steps if s[0] == 'pause']
        kinds = {}
        for s in pauses:
            kinds[s[2]] = kinds.get(s[2], 0) + 1
        wc = [words(c[1]) for c in clips]
        print(f'\n=== {rid} ===')
        print(f'  {len(clips)} clips, {len(pauses)} pause-steps  '
              f'(rest={kinds.get("rest",0)}, resolve={kinds.get("resolve",0)}, breath={kinds.get("breath",0)})')
        print(f'  clip word-counts: min={min(wc)} max={max(wc)} avg={sum(wc)//len(wc)}')
        print('  resolve/breath steps: ' +
              ', '.join(f'{s[2]}={s[1]:.0f}s' for s in pauses if s[2] in ('resolve', 'breath')))


def normalise(wav_i16, sr, dst_wav, m4a):
    a = wav_i16.astype(np.float64)
    win = int(0.05 * sr)
    rms = [np.sqrt(np.mean(a[i:i+win] ** 2)) for i in range(0, len(a) - win, win)]
    rms = [r for r in rms if r > THR]
    gain = TARGET_RMS / (np.median(rms) if rms else TARGET_RMS)
    peak = np.max(np.abs(a)) + 1e-9
    if peak * gain > PEAK_CAP:
        gain = PEAK_CAP / peak
    ai = np.clip(np.round(a * gain), -32768, 32767).astype(np.int16)
    w = wave.open(dst_wav, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes(ai.tobytes()); w.close()
    subprocess.run(['ffmpeg', '-y', '-i', dst_wav, '-c:a', 'aac', '-b:a', '64k', '-ac', '1',
                    '-movflags', '+faststart', m4a, '-loglevel', 'error'], check=True)
    return len(ai) / sr


def build():
    from kokoro_mlx import KokoroTTS
    import wave as wv
    os.makedirs(ADIR, exist_ok=True)
    tts = KokoroTTS.from_pretrained()
    LEAD = TAIL = 0.25   # engine pause-steps provide the gaps; keep clips tight

    def trim(a, sr, thr=200, m=0.04):
        mono = a.astype(np.float32)
        win = max(1, int(sr * 0.01))
        env = np.convolve(np.abs(mono), np.ones(win) / win, mode='same')
        v = np.where(env >= thr)[0]
        if len(v) == 0:
            return a
        return a[max(0, v[0] - int(sr * m)): min(len(a), v[-1] + 1 + int(sr * m))]

    def render_clip(text):
        segs = parse(text)
        chunks, sr = [], None
        for k, v in segs:
            if k == 'pause':
                chunks.append(np.zeros(int(v * (sr or 24000)), dtype=np.int16))
            else:
                tmp = os.path.join(ADIR, '.t.wav')
                tts.save(v, tmp, voice='af_nicole', speed=0.85)
                w = wv.open(tmp, 'rb'); a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16); s = w.getframerate(); w.close()
                os.remove(tmp)
                if sr is None:
                    sr = s
                chunks.append(trim(a, sr))
        body = np.concatenate([np.zeros(int(LEAD * sr), dtype=np.int16)] + chunks + [np.zeros(int(TAIL * sr), dtype=np.int16)])
        return body, sr

    cache = {}      # text-hash -> {audio, dur}
    sessions = {}
    for rid, fn in RECS.items():
        p = os.path.join(CONTENT, fn)
        steps = segment(open(p).read())
        out = []
        for s in steps:
            if s[0] == 'clip':
                h = hashlib.sha1(s[1].encode()).hexdigest()[:10]
                if h not in cache:
                    m4a = os.path.join(ADIR, f'clip_{h}.m4a')
                    if os.path.exists(m4a):   # text unchanged -> reuse (hash is content-based)
                        dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nk=1:nw=1', m4a]).decode().strip())
                        cache[h] = {'audio': f'audio/session/clip_{h}.m4a?v={h}', 'durationSec': round(dur, 1)}
                        print(f'  reuse    clip_{h}')
                    else:
                        body, sr = render_clip(s[1])
                        dw = os.path.join(ADIR, f'.n_{h}.wav')
                        dur = normalise(body, sr, dw, m4a)
                        os.remove(dw)
                        cache[h] = {'audio': f'audio/session/clip_{h}.m4a?v={h}', 'durationSec': round(dur, 1)}
                        print(f'  rendered clip_{h} ({cache[h]["durationSec"]}s)')
                out.append({'clip': h, 'dur': cache[h]['durationSec']})
            else:
                out.append({'pause': s[1], 'kind': s[2]})
        sessions[rid] = out
        print(f'{rid}: {len(out)} steps')
    man = {'sessionClips': cache, 'sessions': sessions}
    open(os.path.join(ADIR, 'sessions.json'), 'w').write(json.dumps(man, indent=2))
    print(f'\nwrote {ADIR}/sessions.json  ({len(cache)} unique clips)')


if __name__ == '__main__':
    (dry if (len(sys.argv) < 2 or sys.argv[1] == 'dry') else build)()
