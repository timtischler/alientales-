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

There are always exactly **two** large eyes, a mirror-image pair. The `eyeCount`
config field and its panel param are removed.

**Position (fixed mirror).** One eye (`eyes[0]`) runs the orbit; the other
(`eyes[1]`) is its reflection across the vertical center line `x = CX` (CX = 400)
every frame: position `(2*CX - x, y)`. Both share the same phase and timers (the
pair telegraphs and fires in unison). The pair traces mirror paths — spreading to
opposite sides as the orbit advances and passing near each other at the top and
bottom.

**Aim (random driver each volley).** Which eye actually targets the player is
NOT fixed — at each telegraph lock, a seeded coin flip (`rng.next() < 0.5`)
chooses which of the two eyes is the **aim-driver** for that volley:

- the aim-driver locks its aim onto the player from its own (frozen) position;
- the partner's aim is the reflection of the driver's aim across the vertical
  axis: `(-aimDriverAimDx, aimDriverAimDy)` (so it fires toward the player's
  mirror position).

So from volley to volley it is unpredictable whether the left or the right eye is
the one hunting you — the other always fires the mirrored beam. The driver's beam
targets you; the mirror beam can still clip you near the center line. A volley
still counts once per pair-fire, so "survive N volleys" is unchanged.

**Pupils.** Both eyes' pupils track the player independently every frame
(`look = unit(playerCenter - eyePos)` per eye) — both visibly watch you,
regardless of which is the current aim-driver.

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

Still deterministic: only the single orbiter (`eyes[0]`) is seeded
(`phaseAngle`, `radiusPhase`, `fireTimer`), then the small-eye spawn timer; the
mirror eye is derived. Each volley draws one extra seeded value at telegraph lock
— the coin flip choosing the aim-driver — which is deterministic on the
fixed-step timeline. `reset()` reseeds.

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
