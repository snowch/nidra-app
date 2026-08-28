# Yoga Nidra Programme — Design Template

The locked decisions every practice module is built from. Source of truth for
the scripts, the manifest, and the future PWA.

## Voices
- **Teaching** (orientation + each module's teaching): `af_heart` @ **0.75** — rendered with `intro.py`.
- **Practice** (all guided practices): `af_nicole` @ **0.85** — rendered with `pp.py`.
- The voice change from Heart to Nicole is itself the cue: *stop learning, drop in.*

## The practice frame (Decision 1 — how modules fold together)
Every practice, micro or extended, follows one fixed frame. The **CORE** grows as
modules accumulate:

```
SETTLE  →  RESOLVE  →  CORE  →  REST  →  RETURN
```

- **SETTLE** — lie down, stillness, a few natural breaths (Module 1, always the entry).
- **RESOLVE** — silently state your saṅkalpa three times (present from Module 2 on).
- **CORE** — the learned elements, in canonical order (below). Each new module *appends* its element.
- **REST** — a short settling in whatever depth was reached.
- **RETURN** — restate the saṅkalpa, then externalise (breath → body → sound → movement → eyes).

**Canonical CORE order:** pratyāhāra (3) → nyāsa (4) → breath (5) → opposites (6) → inner space (7) → witness (8).

### Micro vs Extended (resolves the "practices get too long" problem)
- **Micro** (~2–4 min, for frequent daily reps): `SETTLE → RESOLVE(brief) → only the NEW element → RETURN`. Drills one skill.
- **Extended** (for when time permits, grows ~6 → 25+ min by M8): `SETTLE → RESOLVE → the full cumulative CORE up to this module → REST → RETURN`. This is where the folding actually happens; by Module 10 the extended practice *is* a complete Yoga Nidra.

## Saṅkalpa bookend (Decision 2)
- Chosen **once** in Module 2 (with guidance on crafting it: single, positive, present-tense).
- Kept the **same** for months or years.
- From Module 2 on, it **opens and closes every practice** (the RESOLVE and RETURN steps).
- Recordings leave a **silent space** for the practitioner's own resolve — we never script a specific saṅkalpa; it's personal.

## Fading ladder (Decision 3 — the bridge to self-direction)
Guidance thins in four stages so the recordings become scaffolding you eventually drop:
1. **Guided** — full cueing. For learning. (Default micro + extended.)
2. **Sparse** — same structure/timing, only cue-words at each stage transition, long silences. Introduced once the stack is meaningful (~Module 4+).
3. **Cue-card** — a one-page written sequence of trigger-words (see format below). The primary memorisation aid.
4. **Unaided** — Module 10: near-silent, you run the whole thing. The goal.

## Opening / closing convention
- Open: lie down → stillness → settling breaths → (from M2) resolve.
- Close: (from M2) resolve → externalise → eyes open.
- **OM** is introduced in Module 8 (Māṇḍūkya / AUM) and remains **optional** — never forced into every track.

## Naming scheme
`nidra_<NN>_<slug>[_<variant>].{txt,wav,md}`
- `NN` = zero-padded linear release position (00–15). Gaps are reserved placeholders.
- `variant` ∈ `teaching | micro | extended | sparse | cue`. Orientation pieces have no variant.

## Cue-card format (`nidra_NN_slug_cue.md`)
A glanceable single page: the stage names in order, each with 2–4 trigger words and the intended pause. Purpose: run the practice from the page, then from memory.

## Scripting gotchas
- **No lone-word first segment.** Kokoro hallucinates a phantom onset when the very first `<break>`-delimited segment is a short standalone utterance ("Welcome." → "you're welcome"; "The depths." → "It adapts"). Open every script with a **full phrase** (≥4 words) or the two-sentence `Module N. Title.` pattern, which renders clean. Verify a new opening with an STT pass before shipping.

## Production standards
- All speech silence-trimmed via `trim_silence` (breaks hit their authored length).
- Every track opens with a ~1.5s lead-in and closes with a ~1.5s tail-out (`LEAD_IN`/`TAIL_OUT`).
- Target a single consistent loudness across the whole set before release (normalise pass — currently all ~−7 dBFS, un-normalised).
- Licence: model Apache-2.0, wrapper MIT — audio is free to use, incl. commercially.
