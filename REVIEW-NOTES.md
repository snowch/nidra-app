# Nidra script — V2 review & decisions (deferred; execute later)

External review of the full-nidra arc, plus the decisions to apply. **Not yet
implemented** — this is the plan for a V2 pass.

## Scope — the same content lives in 3 places, apply consistently + re-render each
- **Module practices** — `nidra_08_nyasa_extended`, `nidra_09_breath_extended`,
  `nidra_10_opposites_extended`, `nidra_11_inner-space_extended`,
  `nidra_12_witness_extended`, `nidra_06_sankalpa_*`, `nidra_13_return_extended`.
- **Cumulative cores** — `content/cumulative/` (`sankalpa`, `nyasa`, `breath`,
  `opposites`, `inner-space`, `witness`, `_open`, `_close_*`); rebuild via
  `tools/build_cumulative.py` (regenerates milestones 1–8).
- **Full nidra** — `nidra_14_build-your-own_extended` (~28 min "traditional")
  and `nidra_14_build-your-own_unaided` (~8.6 min "everyday").

## TTS caveat (important — the reviewer assumed ElevenLabs; we use Kokoro)
- **Keep the phonetic "suncalpa" spelling.** Kokoro mispronounces "sankalpa";
  the phonetic spelling is intentional (target sound ~ *sung-KUL-pah*). Do **not**
  blind-swap to "sankalpa" — verify with an STT pass first if changing anything.

## Global changes (apply throughout)
- **Trim the repeated "Now …".** Prefer descriptive/permissive openings:
  "Now bring your attention to the dark space…" → "Become aware of the dark
  space…"; "Now let the counting go…" → "Let the counting go…". Keeps it from
  reading like a meditation app.
- **Soften prescriptive lines** that tell the practitioner what they *will* feel
  → make them invitational ("notice, if you can…", "perhaps there is…").

## Section-by-section decisions

### Opening (soften — point 2)
"…let the body be **completely** still. There is no need to move." →
"Allow the body to become as still as is comfortable. There is no need to move.
And if you do need to move, move slowly, and return to stillness." (more
consistent with effortless awareness; avoids fixation on not-moving).

### Stillness / "body sleeps while you stay awake" (soften — point 3)
Avoid the literal "stay awake" (invites the wrong effort). →
"The body may become very still… perhaps even as though it were sleeping…
while awareness remains quietly present." (Applies to `_open` core + stillness.)

### Nyāsa / rotation — RHYTHM (point 4) — final pause values
Rotation is a brisk, rhythmic sweep; long per-region pauses invite analysis.
Floor of ~3s (TTS: a drowsy listener must keep up; don't go shorter).
- Rotation intro → first part: **~5s** (settle into the rhythm before it speeds up).
- After each hand/foot **detail** line: **3–4s** (was 6s).
- After each arm/leg **sweep** line: **5s** (was 8s; cores currently ~7s).
- Back / front / head: **keep ~8s**.
- Culmination "the whole body, all at once…": **20s** (was 15).
- "filled with a quiet, flowing awareness…": **20s** (was 15). (Keep this line — one of the best.)
- Wording: "Now we will move…" → "Now move your awareness through the body…".

### Breath counting — TIMING (point 6, the biggest fix)
27→1 at ~6 breaths/min ≈ 4½ min; current silence (~15–20s) is far too short.
- **Full 28-min nidra:** keep the 27 count and give it the time — ~**4 min** of
  silence for the count (it occupies the discursive mind).
- **Shorter contexts** (cumulative cores/milestones, module breath practice,
  8.6-min everyday): use a **smaller count (e.g., 11 or 21)** or "count down a few
  breaths at your own pace", sized to the silence actually provided.

### Gap after the out-breath (point 7 — make experiential)
"In that gap, the breath is still. And, for a moment, the mind is still, too." →
"Notice, if you can, the small stillness at the end of the out-breath, before the
next breath begins… perhaps there is a moment of quiet there…"

### Opposites (point 8) — DECISION: THREE pairs (add pleasant/unpleasant)
Progression: **body sensation → sensation → affect → equanimity → witness**.
Three pairs only — no catalogue (no hunger/fullness, tension/relaxation, etc.):
each pair: evoke A (~8–10s) → evoke B (~8–10s) → alternate A / B (~10s).
1. **Heavy ↔ Light** — "…heavy… very heavy… sinking into the surface" / "…light…
   very light… almost no weight" / "Heavy. Light."
2. **Warm ↔ Cool** — "…warmth spreading through the whole body" / "…a gentle
   coolness throughout" / "Warmth. Coolness."
3. **Pleasant ↔ Unpleasant** (the important one — do the real work):
   "Bring to mind a feeling of something pleasant — without needing a particular
   memory; simply allow pleasantness to arise." <10s>
   "Now allow the feeling of something unpleasant to arise — **nothing
   overwhelming** — simply notice the quality of unpleasantness." <10s>
   "Pleasant. Unpleasant." <10s>
   "And now let both be present, without choosing between them. Neither grasping.
   Neither resisting. Simply aware."
   *(Keep the unpleasant evocation gentle — this is where deep relaxation can
   surface material; consistent with the Obstacles & care teaching.)*

**Final integration (the payoff; connects into the witness section):**
"Be moved by neither. Heavy or light. Warm or cool. Pleasant or unpleasant.
Let them arise and pass. You remain at the centre, aware."

### Inner space (point 9) — KEEP as-is (strongest section; 20s pauses fine).

### Witness / non-dual ending (points 10–11) — DECISION: keep it
Keep the non-dual direction (it's the interesting part). **Keep the line
"…rest, in the silence that follows the sound… That silence is your own, deepest
nature…" as-is** (user's call — keep in this project). Pause after it **20s → 30s**.
Still worth doing: make the *turn* to the witness slightly more gradual.

### AUM (point 12) — DECISION: keep it, optional; drop only the vocalised phonemes
- **Keep** "If it helps, let the sound of AUM rise, silently, within…" — the
  optionality matters. Keep its **3s** pause.
- **Change** "Ahh… Ooo… Mmm…" → "**Let AUM arise silently within…**" (don't prompt
  vocalising; the listener knows the sound by M8). Pause **4s → 8s**.

### Long stillness after witness (point 13) — KEEP / consider MORE spacious.

### Second sankalpa (point 14 — symmetry)
"Trust that what you have planted, so deeply, will grow…" →
"Let the resolve settle deeply… and let it go." (echoes the first planting).

### Return (point 15 — too quick; add ~60–90s, graded)
breath → weight of the body → points where the body meets the surface → the room
→ sounds → awareness becoming outward → small movements (fingers/toes) → stretch
→ eyes. Space each with a pause; don't rush after the witness section.

## Reviewer's scores (for reference)
Structure 9 · Language 8 · Silence 9 · Rotation 8 · Breath 7 · Pratyahara 9 ·
Opposites 8 · Witness 9 · Return 7 · TTS suitability 8. Biggest defect: breath
count timing. Then: lines that tell the practitioner what to feel. Then: refine
(not dilute) the non-dual transition.
