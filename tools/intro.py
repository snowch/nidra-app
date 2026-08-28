"""Render the informative Pratyahara explainer.

Same pipeline as pp.py (break-tag pauses + silence trimming), but with the
narration voice/speed chosen for informative content rather than meditation.
Usage: python intro.py pratyahara_intro.txt
"""
import sys
import numpy as np
from pathlib import Path
from pp import parse_script, trim_silence, read_wav, write_wav
from kokoro_mlx import KokoroTTS


VOICE = "af_heart"
SPEED = 0.75

LEAD_IN = 1.5   # seconds of calm silence before the first word
TAIL_OUT = 1.5  # seconds of silence after the last word


def main():
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <script.txt>")
        sys.exit(1)

    input_path = Path(sys.argv[1])
    if not input_path.exists():
        print(f"ERROR: file not found: {input_path}")
        sys.exit(1)

    output_path = input_path.with_suffix(".wav")
    segments = parse_script(input_path.read_text(encoding="utf-8"))

    print(f"Input:  {input_path}")
    print(f"Output: {output_path}")
    print(f"Voice:  {VOICE} @ {SPEED}")
    print("Loading Kokoro...")
    tts = KokoroTTS.from_pretrained()

    parts = []
    sample_rate = None

    for index, (kind, value) in enumerate(segments, start=1):
        if kind == "pause":
            if sample_rate is None:
                raise RuntimeError("A pause occurred before any speech segment.")
            parts.append(np.zeros(int(value * sample_rate), dtype=np.int16))
        else:
            print(f"[{index}] {value[:60]}...")
            temp_file = Path(f".intro_temp_{index}.wav")
            tts.save(value, str(temp_file), voice=VOICE, speed=SPEED)
            audio, sr, _ = read_wav(temp_file)
            temp_file.unlink()
            audio = trim_silence(audio, sr)
            sample_rate = sample_rate or sr
            parts.append(audio)

    final_audio = np.concatenate(parts)
    lead = np.zeros(int(LEAD_IN * sample_rate), dtype=np.int16)
    tail = np.zeros(int(TAIL_OUT * sample_rate), dtype=np.int16)
    final_audio = np.concatenate([lead, final_audio, tail])
    write_wav(output_path, final_audio, sample_rate, 1)

    duration = len(final_audio) / sample_rate
    print(f"\nCreated:  {output_path}")
    print(f"Duration: {duration:.1f} seconds ({duration / 60:.2f} minutes)")


if __name__ == "__main__":
    main()
