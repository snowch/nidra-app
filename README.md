# nidra-app

A drip-released audio programme — and, in time, a PWA — whose goal is unusual:
not a nightly track to lean on, but to teach you to **perform Yoga Nidra on
yourself, from memory, unaided**. Grounded in the source texts (Upaniṣads, Yoga
Sūtras, tantric tradition), not a modern protocol.

## Repository layout
```
content/       narration scripts (.txt, with <break time="Xs"/> pauses)
audio/         rendered narration (.wav, 24 kHz mono)
tools/         render pipeline (pp.py = practice voice, intro.py = teaching voice)
legacy/        the original standalone pratyāhāra meditation that started it
manifest.json  machine-readable index (feeds the PWA) — see paths/voices/items
DESIGN.md      the locked build template every module follows
```

## Running order
| # | Title | Type | Source | Status |
|---|---|---|---|---|
| 00 | Programme introduction | orientation | — | ✅ |
| 01 | The path — nidra in the eight limbs | orientation | Yoga Sūtras 2.29 | ✅ |
| 02 | The depths — the five sheaths | orientation | Taittirīya Up. | ✅ |
| 03 | Setting up your practice | orientation | Haṭha | ⬜ |
| 04 | Obstacles and care | orientation | — | ⬜ |
| 05 | **M1 · Stillness** | practice | Māṇḍūkya; Haṭha | ◑ teaching + micro |
| 06 | **M2 · Saṅkalpa** | practice | Chāndogya 3.14 | ⬜ |
| 07 | **M3 · Pratyāhāra** | practice | Yoga Sūtras 2.54–55 | ◑ teaching |
| 08 | **M4 · Nyāsa** | practice | Tantric nyāsa | ⬜ |
| 09 | **M5 · Breath & the gap** | practice | Vijñāna Bhairava; prāṇāyāma | ⬜ |
| 10 | **M6 · Pairs of opposites** | practice | Gītā 2.14, 6.7; VBT | ⬜ |
| 11 | **M7 · Inner space (cidākāśa)** = dhāraṇā | practice | VBT; YS 3.1 | ⬜ |
| 12 | **M8 · The witness (turīya)** + AUM | practice | Māṇḍūkya | ⬜ |
| 13 | **M9 · Return** | practice | — | ⬜ |
| 14 | **M10 · Build your own** (unaided) | practice | — | ⬜ |
| 15 | Capstone — what it is ultimately for | orientation | Upaniṣadic | ⬜ |

Each **practice module** ships four parts: `teaching` (hear once), `micro`
(daily rep), `extended` (the growing full practice), and a written `cue` card
(the memorisation aid). Guidance thins across the series — see the fading ladder
in `DESIGN.md`.

## Rendering audio from scripts
Requires Python + `requirements.txt` (Apple Silicon / MLX).
```
pip install -r requirements.txt
python tools/intro.py content/nidra_00_intro.txt   # teaching  → Heart @ 0.75
python tools/pp.py    content/nidra_05_stillness_micro.txt  # practice → Nicole @ 0.85
```
Both trim Kokoro's padding so `<break time="Xs">` pauses land at their authored
length. Output `.wav` is written beside the input script; move it into `audio/`.

## Licence
Kokoro model **Apache-2.0**, wrapper **MIT** — generated audio is free to use,
including commercially.
