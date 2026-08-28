# nidra-app

A drip-released audio programme — and, in time, a PWA — whose goal is unusual:
not a nightly track to lean on, but to teach you to **perform Yoga Nidra on
yourself, from memory, unaided**. Grounded in the source texts (Upaniṣads, Yoga
Sūtras, tantric tradition), not a modern protocol.

**🌐 Live:** <https://snowch.github.io/nidra-app/>

## Repository layout
```
index.html     the PWA (with app.css, app.js, sw.js, manifest.webmanifest, icons/)
content/       narration scripts (.txt, with <break time="Xs"/> pauses)
audio/         narration — .m4a (web-facing) + .wav (source renders)
tools/         render pipeline (pp.py = practice voice, intro.py = teaching voice)
legacy/        the original standalone pratyāhāra meditation that started it
manifest.json  machine-readable index the app reads — see paths/voices/items
DESIGN.md      the locked build template every module follows
```

## Running order
Legend: ✅ complete — every module has teaching · micro · extended · cue

| # | Title | Type | Source | Status |
|---|---|---|---|---|
| 00 | Programme introduction | orientation | — | ✅ |
| 01 | The path — nidra in the eight limbs | orientation | Yoga Sūtras 2.29 | ✅ |
| 02 | The depths — the five sheaths | orientation | Taittirīya Up. | ✅ |
| 03 | Setting up your practice | orientation | Haṭha | ✅ |
| 04 | Obstacles and care | orientation | — | ✅ |
| 05 | **M1 · Stillness** | practice | Māṇḍūkya; Haṭha | ✅ |
| 06 | **M2 · Saṅkalpa** | practice | Chāndogya 3.14 | ✅ |
| 07 | **M3 · Pratyāhāra** | practice | Yoga Sūtras 2.54–55 | ✅ |
| 08 | **M4 · Nyāsa** | practice | Tantric nyāsa | ✅ |
| 09 | **M5 · Breath & the gap** | practice | Vijñāna Bhairava; prāṇāyāma | ✅ |
| 10 | **M6 · Pairs of opposites** | practice | Gītā 2.14, 6.7; VBT | ✅ |
| 11 | **M7 · Inner space (cidākāśa)** = dhāraṇā | practice | VBT; YS 3.1 | ✅ |
| 12 | **M8 · The witness (turīya)** + AUM | practice | Māṇḍūkya | ✅ |
| 13 | **M9 · Return** | practice | — | ✅ |
| 14 | **M10 · Build your own** (full guided nidra) | practice | — | ✅ |
| 15 | Capstone — what it is ultimately for | orientation | Upaniṣadic | ✅ |

Each **practice module** ships a `teaching` (hear once), a `micro` (daily rep),
an `extended` (a longer, more spacious practice of that same element), and a
written `cue` card (memorisation aid). The **full guided nidra** (M14) is the
cumulative practice through all stages. See the fading ladder in `DESIGN.md`.

## Rendering audio from scripts
Requires Python + `requirements.txt` (Apple Silicon / MLX).
```
pip install -r requirements.txt
python tools/intro.py content/nidra_00_intro.txt   # teaching  → Heart @ 0.75
python tools/pp.py    content/nidra_05_stillness_micro.txt  # practice → Nicole @ 0.85
```
Both trim Kokoro's padding so `<break time="Xs">` pauses land at their authored
length. Output `.wav` is written beside the input script; move it into `audio/`.

## Deployment (GitHub Pages)
The PWA is served from `main` at the repository **root** — live at
<https://snowch.github.io/nidra-app/>. `index.html` is the app; **no Pages
settings change is needed** (it's already root).

Why root, not `/docs`: the audio lives in `/audio`, and Pages serving from
`/docs` cannot reach files above that folder. Serving from root keeps the audio
reachable. The potential `manifest.json` name clash is sidestepped by naming the
web-app manifest **`manifest.webmanifest`** — the repo's data index stays
`manifest.json`.

Audio is compressed to `.m4a` (AAC ~64 kbps mono) for the web (≈6× smaller than
the source `.wav`); the service worker caches it so practices work offline.

## Licence
Kokoro model **Apache-2.0**, wrapper **MIT** — generated audio is free to use,
including commercially.
