# Fight #2: Eye Beams + Fight Selector

**Date:** 2026-06-20
**Status:** Approved

## Goal

Add the second fight, "Eye Beams": large Gaster-Blaster-style eyeballs that
orbit the battle box and fire wide, **player-aimed** beams across it, with small
slow-homing eyeballs adding a second layer of pressure. Also add a fight
selector so both fights (UFO Invasion and Eye Beams) are playable. This builds
on the existing `Fight` primitive, seeded RNG, collision, drawing, and config
panel.

## What is new technically

The UFO beams were vertical; these fire at arbitrary angles. The one new
geometric primitive is **point-to-segment distance**: a beam is an oriented
segment from the eye, and the player is hit when their center is within
`beamHalfWidth + playerRadius` of it. Everything else reuses existing systems:
the `Fight` interface, `createRng`, `rectsOverlap`, the sprite/draw helpers, the
`FightDefinition` schema, and the config panel.

## Layout & the Eyes

The battle box (`ARENA`) is x 250–550, y 150–450, center (400, 300).

```
         .-''''-.                      ___
       .'        '.  <- eye           ( O ) eye
      /   ( O )-----\------------------ ╳ player
      \    '''        \               /  telegraph (thin) locks on player,
       '.            .' ┌───────────┐    then BEAM (thick) fires along the
         '-......-'      │  battle    │   locked line
                         │   box      │
                         └───────────┘
```

- A small number of big eyeballs (default 2) orbit the box center. Each has a
  seeded initial phase and a shared angular velocity.
- The orbit **radius oscillates** (per-eye seeded phase), so the eyes
  periodically swing inward through the box. When an eye's body overlaps the
  player there, that is a hazard.
- Eyes are drawn procedurally: sclera, iris, and a pupil that tracks toward the
  player's position (the "watching you" look).

## Beam Attack (aimed + telegraphed)

On a seeded cadence (`eyeFireGapMin`/`Max` per eye), an eye fires a **volley**:

1. **Lock:** snapshot the player's current center; compute the beam angle from
   the eye to that point.
2. **Telegraph:** draw a thin line along the locked angle for `telegraphTime`
   (~0.7s). The telegraph does NOT hurt.
3. **Fire:** a thick beam along the *locked* line for `beamTime` (~0.35s) — a
   long segment from the eye crossing the whole screen. This is the damaging
   phase.
4. **Cooldown:** return to orbiting; wait the next seeded gap.

You dodge by leaving the locked line after it appears. Beam stepping is driven
by accumulated fixed-step time (deterministic).

## Small Eyes — Slow Homing

Small eyeballs spawn on a seeded cadence into a fixed pool. Each frame a small
eye drifts toward the player's current position at a low speed (`smallSpeed`,
pure pursuit, slow enough to out-maneuver) and despawns after `smallLifetime`.
Collision with one = death. Small eyes stop spawning once the volley target is
reached.

## Collision (each fixed step → "lost")

The player's center (`cursor.pos + CURSOR_SIZE/2`, radius `CURSOR_SIZE/2`) is
tested against:

- every **firing beam** (phase = fire) via `distancePointToSegment` ≤
  `beamHalfWidth + playerRadius`;
- every **eye body** via `rectsOverlap` of the player square against the eye's
  bounding box (only overlaps when an eye has swung over the box);
- every active **small eye** via `rectsOverlap`.

Any overlap → `"lost"`. Telegraph lines never hurt.

## Win / Loss

- A "volley" is counted when a beam transitions from telegraph to fire. New
  volleys stop being initiated once `firedVolleys >= volleys`, and small-eye
  spawning stops then too.
- **Win** (`"won"`) when `firedVolleys >= volleys` and no beam is currently in
  its fire phase.
- **Loss:** on any collision, the loop recenters the player and `reset()`s; the
  series replays identically from the seed.

## Config (`EyeBeamsConfig`)

Fields: `seed`, `volleys` (default ~20), `eyeCount` (default 2), `orbitSpeed`
(rad/s), `orbitRadius` (base), `orbitRadiusAmp` (inward/outward swing),
`telegraphTime`, `beamTime`, `beamWidth`, `eyeFireGapMin`/`Max`,
`smallSpawnGapMin`/`Max`, `smallSpeed`, `smallLifetime`.

The `EYE_BEAMS: FightDefinition<EyeBeamsConfig>` exposes a tunable subset in the
config panel: `seed`, `volleys`, `eyeCount`, `orbitSpeed`, `telegraphTime`,
`beamTime`, `beamWidth`, `eyeFireGapMin`, `eyeFireGapMax`, `smallSpeed`.

## Fight Selector

With two fights, a selector makes both playable:

- `src/fights/registry.ts` exports `FIGHTS: readonly FightDefinition<unknown>[]`
  (UFO Invasion, Eye Beams).
- `index.html` gains a `#fight-select` dropdown listing the fight names.
- `main.ts` builds the panel and fight from the currently selected definition.
  Switching the dropdown rebuilds the config panel (new schema) and the fight,
  recenters the player, and clears any victory state. The selected fight name
  persists to `localStorage` (`bullethell.selectedFight`).

## Files

- `src/collision.ts` — add pure `distancePointToSegment(px, py, ax, ay, bx, by): number`.
- `src/sprites.ts` — add `drawEye`, `drawSmallEye`, `drawBeamLine` (procedural,
  allocation-free).
- `src/fights/eyeBeams.ts` (+ test) — `EyeBeamsConfig`, `DEFAULT_EYE_BEAMS`,
  the orbit + volley + homing simulation, collision, `draw`, and
  `EYE_BEAMS: FightDefinition<EyeBeamsConfig>`.
- `src/fights/registry.ts` — the `FIGHTS` list.
- `src/main.ts` — fight-selector dropdown wiring; selecting rebuilds panel +
  fight.
- `index.html` — a `#fight-select` dropdown.

## Determinism & Testing

Seeded RNG (orbit phases, fire and small-eye cadences) plus fixed timestep make
the run reproducible. Aiming uses the live player position, so the run is
deterministic given the same inputs.

- **`distancePointToSegment`** (pure): distance at endpoints, perpendicular
  distance to the interior, and clamping when the projection falls beyond either
  segment end.
- **Loss:** a stationary player at a known point gets killed by a locked aimed
  beam → `"lost"` within the volley.
- **Win:** a controlled config with eyes orbiting wide (no inward swing) and
  `volleys: 0` yields `"won"` quickly with a player parked clear of hazards.
- **Definition/registry:** `EYE_BEAMS` exposes the listed params (keys are real
  numeric fields of the defaults); `FIGHTS` contains both definitions.

Visuals and feel (eye look, telegraph readability, beam tension, homing) are
verified live in the browser.

## Non-Goals

- No per-eye health (the eyes are hazards, not destructible).
- No fight-transition screen — the selector simply swaps the active fight.
- No audio, no scoring.
