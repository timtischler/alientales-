# Eye Beams: Multiple Independent Eye Pairs

**Date:** 2026-06-20
**Status:** Proposed

Extend the Eye Beams fight from a single mirrored eye pair to **N independent
mirrored pairs**, with the pair count configurable alongside the small-eye count.

## Change

The fight currently has one mirrored pair (an orbiter `eyes[0]` + its reflection
`eyes[1]`) with module-level orbit/volley state. Generalize to a pool of
independent pairs.

### Configurable counts

- Add `pairCount: number` to `EyeBeamsConfig` (default **4** → 4 mirrored pairs =
  8 large eyes), exposed as a panel param ("Eye pairs", int, min 1).
- Keep the existing `smallCount` (max small eyes alive).

### A `Pair` owns its own state

Replace the module-level orbiter state with a `Pair` struct holding its own:

- `phaseAngle`, `radiusPhase`, `fireTimer`, `phase`, `stateTimer` (orbit + volley
  state), and
- two rendered eyes — `driver` and `mirror` — each `{ x, y, lookDx, lookDy,
  aimDx, aimDy }`.

Pre-allocate a pool of `MAX_PAIRS = 8` pairs at construction; `reset()` activates
`activePairs = min(cfg.pairCount, MAX_PAIRS)`. The pool keeps the hot path
allocation-free.

### Each pair does its own thing

Every active pair independently:

- has a seeded initial orbit phase and radius phase, so the pairs spread around
  the box;
- runs its own fire cadence (`fireTimer` from `eyeFireGapMin/Max`);
- on its telegraph lock, draws its own seeded coin (`rng.next() < 0.5`) to choose
  which of its two eyes targets the player (the partner fires the mirrored beam);
- holds position and locks aim during its telegraph + fire (as today);
- keeps both its eyes clamped **outside the box** via the existing radius clamp;
- `eyes[1]`/`mirror` remains the reflection of `eyes[0]`/`driver` across the
  vertical center line `x = CX`.

### Volleys and win

- A **volley** is one pair-fire. `firedVolleys` increments whenever any pair
  transitions telegraph → fire. New volleys stop being initiated (per pair) once
  `firedVolleys >= cfg.volleys`; small-eye spawning stops then too.
- **Win** when `firedVolleys >= cfg.volleys` and no pair is in telegraph or fire.
- With more pairs firing on independent cadences, total volleys accrue faster in
  wall-clock; `volleys` is unchanged (default 20) and tunable.

### Collision

Each fixed step, the player is tested against every active pair's two beams
during that pair's fire phase (`distancePointToSegment`), plus the small eyes
(`rectsOverlap`). No eye-body collision (eyes stay outside the box).

## Determinism

At `reset()`, pairs are seeded in index order (each: `phaseAngle`, `radiusPhase`,
`fireTimer`), then the small spawn timer. Each volley draws one coin at that
pair's lock. `reset()` reseeds. Aiming and homing use live player position.

## Params

`EYE_BEAMS.params` order becomes: `seed, volleys, pairCount, orbitSpeed,
telegraphTime, beamTime, beamWidth, eyeFireGapMin, eyeFireGapMax, smallSpeed,
smallCount`.

## Testing

- Loss / win / determinism / small-eye-kill / small-cap tests carry over (configs
  that need a single deterministic pair set `pairCount: 1`).
- **Pair count → eye count:** with `pairCount: P` (and `smallCount: 0`,
  `volleys: 0`), `draw` produces exactly `2*P` large-eye scleras (counted via the
  public draw surface at radius `EYE_R`). Covered for `P = 1` and `P = 3`.
- Determinism test uses `pairCount: 1` to keep the loss step exact.

Multi-pair visuals and feel are verified live in the browser.

## Non-Goals

- No change to UFO Invasion, the selector, or the config-panel mechanism.
- No per-pair tuning (all pairs share the same orbit/telegraph/beam config).
