#!/usr/bin/env python3
"""Build + render 'fall asleep' variants of the two full nidra recordings.

Each variant keeps the full practice through the final resolve, then replaces
the wake-up / return with a gentle permission to sleep and a long fade to
silence. Mirrors build_cumulative.py's render+normalise pipeline exactly.

  python3 render_sleep.py mktxt        # just write the two .txt (no audio)
  python3 render_sleep.py extended     # render one variant -> audio/*.m4a
  python3 render_sleep.py unaided
"""
import sys, subprocess, os, wave, hashlib
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, 'content')
AUDIO = os.path.join(ROOT, 'audio')
TARGET_RMS, PEAK_CAP, THR = 3200.0, 29000.0, 200.0

OUTRO = """<break time="6.0s" />

There is nothing more to do now... nowhere to be... and nothing to become...

<break time="8.0s" />

Let the body stay exactly as it is... heavy... and still... and let the mind rest, in its own quiet depth...

<break time="10.0s" />

There is no need to return... no need to come back...

<break time="7.0s" />

Let this deep stillness carry you, gently... downward... and inward... into a soft, and easy sleep...

<break time="12.0s" />

Nothing to hold... nothing to keep... simply let go, completely...

<break time="15.0s" />

Rest now... and sleep...

<break time="20.0s" />
"""

JOBS = {
    'extended': ('nidra_14_build-your-own_extended.txt',
                 'And now, slowly, and with care, we begin the return',
                 'nidra_14_build-your-own_extended_sleep'),
    'unaided':  ('nidra_14_build-your-own_unaided.txt',
                 'And now, slowly, we begin to return',
                 'nidra_14_build-your-own_unaided_sleep'),
}


def normalise(src, dst, m4a):
    w = wave.open(src, 'rb')
    a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64)
    sr = w.getframerate(); w.close()
    win = int(0.05 * sr)
    rms = [np.sqrt(np.mean(a[i:i+win] ** 2)) for i in range(0, len(a) - win, win)]
    rms = [r for r in rms if r > THR]
    gain = TARGET_RMS / (np.median(rms) if rms else TARGET_RMS)
    peak = np.max(np.abs(a)) + 1e-9
    if peak * gain > PEAK_CAP:
        gain = PEAK_CAP / peak
    ai = np.clip(np.round(a * gain), -32768, 32767).astype(np.int16)
    w = wave.open(dst, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes(ai.tobytes()); w.close()
    subprocess.run(['ffmpeg', '-y', '-i', dst, '-c:a', 'aac', '-b:a', '64k', '-ac', '1',
                    '-movflags', '+faststart', m4a, '-loglevel', 'error'], check=True)
    return len(ai) / sr, hashlib.sha1(open(m4a, 'rb').read()).hexdigest()[:8]


def make_txt(job):
    src, marker, stem = JOBS[job]
    text = open(os.path.join(CONTENT, src)).read()
    idx = text.find(marker)
    if idx < 0:
        raise SystemExit('marker not found in ' + src + ': ' + marker)
    head = text[:idx].rstrip()
    script = head + '\n\n' + OUTRO.strip() + '\n'
    path = os.path.join(CONTENT, stem + '.txt')
    open(path, 'w').write(script)
    return path, stem


def render(job):
    txt, stem = make_txt(job)
    subprocess.run(['python3', os.path.join(ROOT, 'tools', 'pp.py'), txt], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    wav = os.path.join(CONTENT, stem + '.wav')
    tmpwav = os.path.join(AUDIO, stem + '.wav')
    m4a = os.path.join(AUDIO, stem + '.m4a')
    dur, h = normalise(wav, tmpwav, m4a)
    os.remove(wav); os.remove(tmpwav)
    print(f'{stem}|{dur:.1f}|{h}')


def render_raw(stem):
    """Render an already-existing content/<stem>.txt -> audio/<stem>.m4a."""
    txt = os.path.join(CONTENT, stem + '.txt')
    subprocess.run(['python3', os.path.join(ROOT, 'tools', 'pp.py'), txt], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    wav = os.path.join(CONTENT, stem + '.wav')
    tmpwav = os.path.join(AUDIO, stem + '.wav')
    m4a = os.path.join(AUDIO, stem + '.m4a')
    dur, h = normalise(wav, tmpwav, m4a)
    os.remove(wav); os.remove(tmpwav)
    print(f'{stem}|{dur:.1f}|{h}')


if __name__ == '__main__':
    arg = sys.argv[1] if len(sys.argv) > 1 else 'mktxt'
    if arg == 'mktxt':
        for j in JOBS:
            make_txt(j); print('made', j)
    elif arg == 'raw':
        render_raw(sys.argv[2])
    else:
        render(arg)
