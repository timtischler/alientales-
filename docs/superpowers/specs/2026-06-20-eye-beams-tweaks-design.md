# Eye Beams Tweaks: Small-Eye Count + Mirrored Eye Pair

**Date:** 2026-06-20
**Status:** Approved

Two adjustments to the existing Eye Beams fight (`src/fights/eyeBeams.ts`).

## 1. Configurable max small eyes

Today the small-eye pool cap is a hardcoded `SMALL_POOL = 16`. Replace it with a
config field controlling the **maximum number of small eyes alive at any one
time**.

- Add `smallCount: number` to `EyeBeamsConfig` (default `6`) and expose it as a
  panel param (label "Max small eyes", int, min 0).
- The pool stays pre-allocated to a hard maximum constant `MAX_SMALL = 64`
  (keeps the hot path allocation-free regardless of the value). The spawn loop
  spawns a new small eye only while the number currently active is below
  `cfg.smallCount` (and the usual gating: timer elapsed, `firedVolleys <
  volleys`). `smallCount` is effectively clamped to `MAX_SMALL` by the pool.

## 2. Large eyes become a mirrored pair, kept outside the box

Currently the eyes are `eyeCount` independent orbiters whose radius oscillates
inward through the box. Replace that with a **fixed pair of mirror-image eyes
that never enter the player's area**.

### Mirrored pair

- There are always exactly **two** large eyes: a **driver** and its **mirror**.
  Remove the `eyeCount` config field and its panel param.
- The **driver** keeps the existing behavior: it orbits, and on its fire cadence
  it locks its aim onto the player at telegraph start, telegraphs, and fires
  (holding position during telegraph + fire).
- The **mirror** is computed each frame as the driver reflected across the
  vertical center line `x = CX` (CX = 400):
  - position `(2*CX - driverX, driverY)`
  - aim direction `(-driverAimDx, driverAimDy)`
  - pupil look `(-driverLookDx, driverLookDy)`
  - it shares the driver's phase and timers (the pair telegraphs and fires in
    unison).
- "Full mirror": the driver's beam targets the player; the mirror's beam is the
  reflected beam (toward the player's mirror position). The mirror beam can still
  clip the player when they are near the center line. A volley still counts once
  per pair-fire (driver telegraph→fire), so "survive N volleys" is unchanged.

The pair traces mirror paths: they spread to opposite sides as the driver orbits
and pass near each other at the top and bottom of the orbit.

### Kept outside the box

Each frame, after computing the driver's orbit position, clamp its radius so the
eye body stays fully outside the arena box:

- Inflate the box half-extents by the eye radius (plus a small margin):
  `halfX = ARENA.w/2 + EYE_R + 6`, `halfY = ARENA.h/2 + EYE_R + 6`.
- The minimum radius along the eye's current direction `(cosθ, sinθ)` that keeps
  it outside the inflated box is `minR = 1 / max(|cosθ|/halfX, |sinθ|/halfY)`.
  If the orbit radius is smaller, raise it to `minR`.

Because the box is symmetric about `x = CX`, the mirror (the driver's reflection)
is then also outside the box. The eyes therefore can never overlap the player.

**Consequence:** the eye-body collision check is removed (the eyes are
guaranteed outside the player's area, so it can never trigger). The player is
threatened only by beams (driver + mirror) and small eyes.

Orbit defaults are nudged so the pair reads as orbiting outside rather than
constantly hugging the border: `orbitRadius` ~250, `orbitRadiusAmp` ~70.

## Determinism & Testing

Still deterministic: only the single driver is seeded (`phaseAngle`,
`radiusPhase`, `fireTimer`), then the small-eye spawn timer; the mirror is
derived. `reset()` reseeds.

- Existing tests are updated to drop the removed `eyeCount` override.
- **Loss by beam** (stationary player, driver locks and fires through them) still
  passes.
- **Win** (`volleys: 0`) still passes.
- **Determinism** (same seed → same loss step) still passes.
- **Small-eye kill** still passes.
- **Small-eye cap**: tested through the public `draw` surface (no internal
  hook). Configure `smallCount` small (e.g. 3), `smallSpeed: 0` (so the eyes
  spawn but never reach the player and never expire-by-arrival), a long
  `smallLifetime`, a fast spawn cadence, and no beams (`eyeFireGap` huge). Run
  many steps, then `draw` to a fake ctx and count `drawSmallEye` invocations —
  it must never exceed `smallCount`.
- **Definition:** `EYE_BEAMS.params` no longer lists `eyeCount` and now lists
  `smallCount`; the params-list test is updated accordingly.

The mirrored visuals and the "eyes stay outside the box" behavior are verified
live in the browser.

## Non-Goals

- No change to UFO Invasion, the selector, or the config-panel mechanism.
- No new fight; this only adjusts Eye Beams.
