import re
import sys
import wave
import numpy as np
from pathlib import Path
from kokoro_mlx import KokoroTTS


VOICE = "af_nicole"
SPEED = 0.85


def parse_script(text):
    pattern = r'<break\s+time=["\']([\d.]+)s["\']\s*/?>'
    parts = re.split(pattern, text, flags=re.IGNORECASE)

    segments = []

    for i, part in enumerate(parts):
        if not part.strip():
            continue

        if i % 2 == 1:
            segments.append(("pause", float(part)))
        else:
            speech = part.strip()
            if speech:
                segments.append(("speech", speech))

    return segments


def trim_silence(audio, sample_rate, threshold=200, margin_s=0.04):
    # Kokoro pads each render with ~0.26s of leading and ~0.53s of
    # trailing silence. Left in place, that padding stacks on top of the
    # explicit <break> pauses, so every gap runs ~0.8s longer than the
    # script asks for. Trim it here (keeping a small margin so the soft
    # attack/release of speech isn't clipped) and let <break> set timing.
    if audio.ndim == 1:
        mono = audio.astype(np.float32)
    else:
        mono = audio.astype(np.float32).mean(axis=1)

    win = max(1, int(sample_rate * 0.01))
    envelope = np.convolve(np.abs(mono), np.ones(win) / win, mode="same")

    voiced = np.where(envelope >= threshold)[0]
    if len(voiced) == 0:
        return audio

    margin = int(sample_rate * margin_s)
    start = max(0, voiced[0] - margin)
    end = min(len(mono), voiced[-1] + 1 + margin)

    return audio[start:end]


def read_wav(filename):
    with wave.open(str(filename), "rb") as wav:
        channels = wav.getnchannels()
        sample_width = wav.getsampwidth()
        sample_rate = wav.getframerate()
        frames = wav.readframes(wav.getnframes())

    if sample_width != 2:
        raise ValueError("Expected 16-bit WAV")

    audio = np.frombuffer(frames, dtype=np.int16)

    if channels > 1:
        audio = audio.reshape(-1, channels)

    return audio, sample_rate, channels


def write_wav(filename, audio, sample_rate, channels):
    audio = np.asarray(audio, dtype=np.int16)

    with wave.open(str(filename), "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(audio.tobytes())


def main():

    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <script.txt>")
        sys.exit(1)

    input_path = Path(sys.argv[1])

    if not input_path.exists():
        print(f"ERROR: file not found: {input_path}")
        sys.exit(1)

    output_path = input_path.with_suffix(".wav")

    text = input_path.read_text(encoding="utf-8")
    segments = parse_script(text)

    print(f"Input:  {input_path}")
    print(f"Output: {output_path}")
    print(f"Segments: {len(segments)}")
    print()

    print("Loading Kokoro...")
    tts = KokoroTTS.from_pretrained()

    audio_segments = []

    sample_rate = None
    channels = 1

    for index, (kind, value) in enumerate(segments, start=1):

        if kind == "pause":

            print(f"[{index}] pause {value:.1f}s")

            if sample_rate is None:
                # Kokoro normally uses 24kHz, but we need to know
                # the actual rate before creating silence.
                raise RuntimeError(
                    "A pause occurred before any speech segment."
                )

            silence = np.zeros(
                int(value * sample_rate),
                dtype=np.int16,
            )

            audio_segments.append(silence)

        else:

            print(f"[{index}] speech: {value[:60]}...")

            temp_file = Path(f".tts_temp_{index}.wav")

            tts.save(
                value,
                str(temp_file),
                voice=VOICE,
                speed=SPEED,
            )

            audio, sr, ch = read_wav(temp_file)
            audio = trim_silence(audio, sr)

            if sample_rate is None:
                sample_rate = sr
                channels = ch
            elif sr != sample_rate:
                raise RuntimeError(
                    f"Sample rate changed: {sample_rate} -> {sr}"
                )

            audio_segments.append(audio)

            temp_file.unlink()

    if not audio_segments:
        print("ERROR: no speech or pauses found")
        sys.exit(1)

    print()
    print("Combining audio...")

    final_audio = np.concatenate(audio_segments)

    write_wav(
        output_path,
        final_audio,
        sample_rate,
        channels,
    )

    duration = len(final_audio) / sample_rate

    print()
    print(f"Created:  {output_path}")
    print(f"Duration: {duration:.1f} seconds")
    print(f"Duration: {duration / 60:.2f} minutes")


if __name__ == "__main__":
    main()