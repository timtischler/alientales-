# Saucer Ring — Chunked Tractor Beam Design

## Goal

Replace the Saucer Ring tractor beam's instant full-length fire with a beam that
**launches across the map one chunk at a time** (20 chunks, ~2s to fully cross),
holds briefly at full length, then **smoothly retracts back into the saucer**
with a lengthwise fading gradient. The player is damaged by the beam's current
extent during extend, hold, and retract (the telegraph remains safe).

## Context

The fight is `src/fights/saucerRing.ts`. A saucer at angle θ sits at radius
`ALIEN_R = 235` and fires along its inward normal `(idx, idy) = (-cosθ, -sinθ)`.
The full beam path runs from the saucer through the ring center to the far side,
length `2·ALIEN_R`.

Current tractor lifecycle (to be replaced):

- `PHASE_ORBIT` → on a seeded cadence → `PHASE_TELEGRAPH` (thin line for
  `telegraphTime`, `firedVolleys++` on telegraph→fire) → `PHASE_FIRE` (instant
  full-length thick beam for `beamTime`, collision along the full segment) →
  back to `PHASE_ORBIT`, re-arm `tractorTimer = gap(...)`.

Determinism is load-bearing: the gameplay RNG (`rng`) drives shot/tractor
cadence; cows use a separate `cowRng`; the suite asserts exact loss/win steps.
Render tests drive `draw()` with a hand-rolled mock `CanvasRenderingContext2D`.

## New beam lifecycle

`PHASE_FIRE` is replaced by three phases. Phase constants become:

```
PHASE_ORBIT = 0
PHASE_TELEGRAPH = 1
PHASE_EXTEND = 2
PHASE_HOLD = 3
PHASE_RETRACT = 4
```

Transitions (per saucer, on the fixed step):

1. **TELEGRAPH** (unchanged): thin line for `telegraphTime`. On expiry →
   `PHASE_EXTEND`, `stateTimer = 0`, `firedVolleys++` (one volley = one tractor
   sequence; preserves the existing volley accounting and win condition).
2. **EXTEND**: over `beamTime` seconds (now meaning *extend time*), the beam
   grows in `beamChunks` discrete steps. With `chunkTime = beamTime / beamChunks`
   and `chunk = min(beamChunks, 1 + floor(stateTimer / chunkTime))`, the current
   length is `beamLen = (chunk / beamChunks) * (2·ALIEN_R)` — so chunk 1 is
   visible immediately and chunk `beamChunks` lands at `stateTimer = beamTime`.
   On `stateTimer >= beamTime` → `PHASE_HOLD`, `stateTimer = 0`,
   `beamLen = 2·ALIEN_R`.
3. **HOLD**: `beamLen = 2·ALIEN_R` for `BEAM_HOLD` seconds. On expiry →
   `PHASE_RETRACT`, `stateTimer = 0`.
4. **RETRACT**: over `BEAM_RETRACT` seconds the far end pulls in toward the
   saucer: `frac = max(0, 1 - stateTimer / BEAM_RETRACT)`,
   `beamLen = frac * (2·ALIEN_R)`. On `stateTimer >= BEAM_RETRACT` →
   `PHASE_ORBIT`, `beamLen = 0`, `tractorTimer = gap(tractorGapMin, tractorGapMax)`.

`anyBusy = true` during TELEGRAPH, EXTEND, HOLD, and RETRACT, so a fight cannot
be won while a beam is mid-sequence (matches the current rule).

New tunable timings (internal constants, promotable later):

```
const BEAM_HOLD = 0.3;    // seconds at full length before retracting
const BEAM_RETRACT = 0.6; // seconds to fully pull in
```

## Collision (damage model)

During EXTEND, HOLD, and RETRACT, the beam occupies the segment from the saucer
to the current tip:

```
const ex = a.x + a.idx * a.beamLen;
const ey = a.y + a.idy * a.beamLen;
if (a.beamLen > 0 &&
    distancePointToSegment(pcx, pcy, a.x, a.y, ex, ey) <= cfg.beamWidth / 2 + PLAYER_R) {
  return "lost";
}
```

TELEGRAPH does not damage. The collision uses the same `beamWidth` and player
radius as before — only the segment length now varies with `beamLen`.

## State

Add one field to the `Alien` interface to carry the current beam length between
`update` (sets it) and `draw` (reads it), avoiding recomputation drift:

```
interface Alien {
  ...
  stateTimer: number;
  beamLen: number; // current tractor beam length; 0 when not firing
}
```

`makeAlien()` initializes `beamLen: 0`. `reset()` needs no change for `beamLen`
(saucers reset to `PHASE_ORBIT`, and `beamLen` is only read while firing; it is
set to 0 on entering ORBIT and is 0 from construction).

## Config

- **Repurpose `beamTime`**: keep the config key `beamTime` (no key rename, so
  persisted configs and the param-key list change minimally), but it now means
  "seconds to fully extend across the map". Default changes `0.4 → 2.0`. Its
  param label changes from `"Beam (s)"` to `"Beam extend (s)"`, and its `max`
  rises to accommodate slow crawls (e.g. `1.5 → 6`).
- **Add `beamChunks`**: appended to `SaucerRingConfig`, `DEFAULT_SAUCER_RING`
  (`= 20`), and `SAUCER_RING_PARAMS` as the last param
  (`{ key: "beamChunks", label: "Beam chunks", kind: "int", min: 1, max: 60, step: 1 }`).
  The config panel picks it up automatically. The definition test's expected
  param-key list gains `"beamChunks"` at the end (after `cowCount`).

Param-key order after this change:
`seed, volleys, alienCount, orbitSpeed, shotGapMin, shotGapMax, shotSpeed,
tractorGapMin, tractorGapMax, telegraphTime, beamTime, beamWidth, cowCount,
beamChunks`.

## Rendering

- **TELEGRAPH**: thin line along the full path (`2·ALIEN_R`), as today —
  `drawBeamLine(ctx, a.x, a.y, ex, ey, 3, "#ff5cf0", 0.5)`.
- **EXTEND / HOLD**: solid thick beam from the saucer to the current tip —
  `drawBeamLine(ctx, a.x, a.y, ex, ey, cfg.beamWidth, "#ff3b6b", 0.85)` where
  `ex/ey` use `a.beamLen`.
- **RETRACT**: a lengthwise fading gradient via a new `drawBeamGradient` helper
  in `src/sprites.ts`:

```
drawBeamGradient(ctx, x1, y1, x2, y2, width, color, alphaNear, alphaFar, segments)
```

  Draws `segments` sub-segments from (x1,y1)→(x2,y2), each a `drawBeamLine` whose
  alpha is linearly interpolated from `alphaNear` (at the saucer end) to
  `alphaFar` (at the retreating tip). Built only from the existing `drawBeamLine`
  primitive, so it is mock-ctx friendly and allocation-free (scalar loop, no
  literals/closures). For retract: `drawBeamGradient(ctx, a.x, a.y, ex, ey,
  cfg.beamWidth, "#ff3b6b", 0.85, 0.0, 10)`.

Draw order is unchanged: cows, then per-saucer the beam (telegraph/extend/hold/
retract) then the saucer body, then shots.

## Determinism

No new RNG. Chunk stepping and retract are time-based on the fixed step. The
tractor still draws exactly one `gap()` (gameplay `rng`) per volley, at the
RETRACT→ORBIT transition — same count as the old FIRE→ORBIT re-arm — so the
gameplay RNG stream is byte-identical and the existing exact-step determinism
tests remain valid. `reset()` behavior is unchanged.

## Testing

Existing tests that must still pass unchanged:

- `loss by little shot` / determinism (tractor disabled) — untouched.
- `win` (volleys 0) — untouched.
- `loss by tractor beam` — still loses: with the new mechanic the beam crosses
  the centered player as it extends through the ring center (chunk ≈ half).
  This test sets `telegraphTime: 0.2, beamTime: 0.3` and runs 200 steps
  (~1.67s); the beam reaches center at ~`telegraphTime + beamTime/2 ≈ 0.35s`,
  well within range. Keep this test as-is (it must remain green).
- `saucer count`, `cow count`, `cow behavior` — untouched.
- `SAUCER_RING definition` — updated to include `beamChunks` (last key).

New tests:

- **Extend timing / partial-beam safety (direction-independent):** the beam
  always passes *through* the ring center, and `makeCursor()` places the player
  at the center, so a centered player is hit only once the beam has extended
  past the halfway point (the tip reaches center at `beamLen = ALIEN_R`, i.e.
  chunk ≈ `beamChunks / 2`) — regardless of the saucer's seeded firing angle.
  Test with one saucer, `telegraphTime` small, a slow `beamTime` (e.g. 1.0s),
  `beamChunks: 20`, `tractorGapMin/Max: 0`, shots disabled (`shotGap` 999),
  `volleys: 1`: assert the fight is still `"running"` after a short window
  (telegraph done + only the first few extend chunks — beam well short of
  center), then assert it becomes `"lost"` after the beam grows past center.
  This proves the partial beam does not damage ahead of its tip.
- **`drawBeamGradient` smoke test** in `sprites.test.ts`: invoking it issues
  `segments` stroke passes without throwing and varies `globalAlpha` across the
  range (assert it does not throw and that at least one stroke occurred).
- **Definition test** updated for `beamChunks`.

Render tests already tolerate the beam (no saucer is mid-fire during the count
tests because they use `volleys: 0` or disabled tractor). `drawBeamGradient`
uses only `drawBeamLine`, which the mock ctx already supports.

## Out of scope

No change to little shots, cows, saucer rendering, orbit, or win/loss accounting
beyond the beam lifecycle described above.

## Self-review notes

- **Determinism:** no new RNG; one `gap()` per volley preserved; existing
  exact-step tests are the guard.
- **Allocation:** `beamLen` is a scalar field on the pooled `Alien`; update/draw
  use scalar math; `drawBeamGradient` is a scalar loop over `drawBeamLine`.
- **Test-env safety:** `drawBeamGradient` and all beam draw paths use only
  `drawBeamLine` (save/restore/globalAlpha/stroke), already in the mock.
- **Config:** `beamTime` key reused (semantics + label + default changed);
  `beamChunks` appended; definition test updated.
- **Scope:** beam lifecycle + one render helper + two config touches; collision
  segment length now varies; everything else unchanged.
