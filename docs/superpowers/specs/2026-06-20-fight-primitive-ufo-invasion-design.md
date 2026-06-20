# The `Fight` Primitive + First Fight: UFO Invasion

**Date:** 2026-06-20
**Status:** Approved

## Goal

Introduce a reusable **Fight** primitive — a single, self-contained encounter
with a definite end — and implement the first concrete fight: a seeded,
deterministic wave of 30 colorful UFOs that fly across the screen, some of which
stop to fire a Galaga-style tractor beam. The player (the existing WASD cursor)
must dodge both UFO bodies and beams. This builds directly on the responsive
fixed-timestep foundation already in place.

## The `Fight` Primitive

A Fight is the unit of "a single specific fight". Every future fight (bullet
patterns, bosses) implements the same interface so they all plug into the loop
identically.

```ts
type FightStatus = "running" | "won" | "lost";

interface Fight {
  // Advance one fixed simulation step, read the player for collision, and
  // return status. Must allocate nothing per call.
  update(player: Cursor, dt: number): FightStatus;

  // Draw the fight's own visual layer (alien, UFOs, beams). Allocation-free.
  draw(ctx: CanvasRenderingContext2D): void;

  // Re-seed and return to the initial deterministic state. Reuses internal
  // pools (no fresh allocation of the entity pool).
  reset(): void;
}
```

The game loop owns player movement and reacts to the returned status:
- `lost` → recenter the player and call `fight.reset()` (the series replays
  identically from the seed).
- `won` → enter a victory state (show a simple overlay).
- `running` → continue.

The Fight only **reads** the player position for collision; it never moves it.

## Determinism

The simulation already advances on a fixed 120 Hz timestep. Combined with a
seeded pseudo-random generator, the entire fight is a reproducible replay:

- `src/rng.ts` provides a `mulberry32`-based generator as a single stateful
  object (created once; `next()` and `reseed()` allocate nothing).
- Random values are drawn only at UFO spawn time, which happens on the
  fixed-step timeline, so spawn order and parameters are stable across runs.
- The first fight hardcodes `seed` in its config.

**Fairness is not guaranteed by seeding.** A seed can produce an undodgeable
arrangement (e.g. overlapping beams walling off the arena). That is acceptable
and expected: the seeded run makes such cases visible, and we respond by
choosing a different seed or widening the spawn-gap config. The seed is a test
fixture, not a fairness guarantee.

## Layout

Logical space is 800×600. The arena occupies x 250–550, y 150–450.

```
 ┌────────────────────────────────────────┐
 │                👾  alien (bobbing)       │  y 0–150: alien + harmless overhead
 │   🛸→ (passes above arena, safe)         │
 │  ┌──────────────────────────┐            │
 │  │   🛸→→→→  ← dodge its ROW │            │  y 150–450: ARENA — UFO bodies
 │  │        ┊███               │            │  sweeping here are hazards;
 │  │   ▣ player    ┊ beam col  │            │  beamers add a full-height column
 │  └───────────────┊──────────┘            │  (dodge sideways)
 └────────────────────────────────────────┘
```

Render order each frame: black background → fight layer (alien, UFOs, beams) →
arena outline → player cursor on top.

## First Fight: UFO Invasion

### The alien
A hand-designed ~24px pixel sprite (antennae, large eye — deliberately strange),
positioned top-center, with a gentle vertical bob. Drawn as `fillRect` cells
from a hardcoded bitmap + palette (allocation-free).

### UFOs
A fixed-size pool (cap ~8 simultaneously active), created once at construction.
Thirty UFOs are spawned in total over the fight on a seeded cadence; overlap is
allowed (several may be on screen at once). Each UFO's seeded parameters at spawn:

- **direction**: left→right or right→left
- **speed**: from configurable `speedMin`/`speedMax` (logical px/sec)
- **color**: chosen from a palette
- **y (lane)**: from configurable `ufoYMin`/`ufoYMax`, a band running from above
  the arena down into it — so some sweep through the player's rows and some pass
  harmlessly overhead
- **beamer?**: with probability `beamerChance`; non-beamers just zip across
- **stop-x** (beamers only): where the UFO halts to fire

### Tractor beam (beamers)
A beamer flies to its stop-x, halts, then extends a vertical column **downward
step-by-step** (the Galaga staircase) until it reaches the arena floor, holds
briefly at full extent, retracts, and the UFO resumes its direction and exits.
The column's x-range is centered on the UFO and roughly its width.
- Beam top = the UFO's bottom edge; beam bottom = the arena floor (y 450).
- Beam stepping is driven by accumulated fixed-step time (not wall clock), so it
  is deterministic.

### Hazards & collision
On each fixed step, the player's square (`cursor.pos`, `CURSOR_SIZE`) is tested
for AABB overlap against:
- every **active beam** rectangle, and
- every **active UFO body** rectangle.

Any overlap → `lost`. (A UFO above the arena can never overlap the player, so it
is naturally harmless; a UFO sweeping through the arena band must be dodged
vertically.)

### Win / loss
- **Loss:** on overlap, the loop recenters the player and calls `reset()`; the
  30-UFO series replays identically from the seed.
- **Win:** when all 30 have been spawned and no UFO remains active → `won`. The
  loop shows a simple "VICTORY" overlay (a hidden `<div>`, toggled visible, in
  the same spirit as the existing settings overlay).

## Files

- `src/rng.ts` (+ test) — seeded PRNG (`createRng(seed)` → `{ next, reseed }`).
- `src/fights/types.ts` — `Fight` interface and `FightStatus`.
- `src/fights/ufoInvasion.ts` (+ test) — the fight: config (incl. `seed`,
  `speedMin/Max`, `ufoYMin/Max`, `beamerChance`, spawn-gap range, `count = 30`),
  UFO pool, per-UFO state machine, spawn cadence, beam stepping, collision, and
  `draw`.
- `src/sprites.ts` — alien and UFO pixel-bitmap data plus an allocation-free
  `drawSprite` helper.
- `src/movement.ts` — add `resetCursor(cursor)` (recenter the existing cursor in
  place; allocation-free).
- `src/render.ts` — extend `draw` to `draw(cursor, drawFight?)`, where
  `drawFight` is an optional `(ctx) => void` callback invoked between the
  background and the arena outline. Keeps the renderer decoupled from fight
  internals.
- `src/main.ts` — construct the fight, call `fight.update` inside the
  fixed-step loop, handle `lost`/`won`, pass `fight.draw` to the renderer.
- `index.html` — add a hidden `#victory` overlay element.

## Testing & Verification

The simulation is pure and deterministic, so it is genuinely unit-testable:

- **RNG:** same seed → identical sequence; `reseed` restores the sequence.
- **Determinism:** two fights with the same seed produce an identical spawn
  sequence (UFO parameters over time).
- **Beam collision:** a player parked in a known beam column dies at the
  expected step; a player parked in a known-safe column survives all 30.
- **Body collision:** a non-beamer sweeping a known row kills a player parked in
  that row and misses a player parked in a different row.

Rendering and game feel (the alien, UFO colors, beam telegraph, dodge tension)
are verified live in the native Windows browser.

## Non-Goals (this slice)

- No health bar — one hit is death.
- No fight selection menu or multiple fights — UFO Invasion runs on load.
- No audio.
- No scoring.

These can follow once the primitive and first fight feel right.
