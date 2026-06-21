# Saucer Ring — Grazing Cows Design

## Goal

Add ambient cows that walk along the inside of the green ring in the Saucer
Ring fight. Cows are **decoration only** in this iteration: they have no
collision and no effect on the player, the win/loss condition, or the
deterministic gameplay simulation. They wander tangentially around the ring,
randomly turn around, and randomly stop to bend down and graze.

A later iteration (out of scope here, but designed for) will let a firing
tractor beam abduct a cow it passes over.

## Context

The fight lives in `src/fights/saucerRing.ts` and renders with the procedural
primitives in `src/sprites.ts` (`drawUfo`, `drawBeamLine`, etc.) on a Canvas2D
context. Geometry already established:

- Ring center `CX,CY = 400,300`; green ring radius `WORLD_R = 285`.
- Saucers orbit inward at `ALIEN_R = 235`, rotated to face center.
- Player box is the 300×300 arena (x 250–550, y 150–450) centered at the ring
  center.

The fight's win/loss simulation is seeded and deterministic (`createRng`,
fixed-step `update`, `reset()` reseeds). Existing tests assert exact loss/win
steps and the exact config param-key list, and a saucer-count render test
drives `draw` with a hand-rolled mock `CanvasRenderingContext2D`. Cows must not
break any of this.

## Orientation: radial ring-world

Each cow stands on the inner edge of the ring like the surface of a tiny
planet: **feet planted outward on the ring, head pointing toward the center.**
A cow at the top of the ring hangs head-down; one at the bottom stands upright;
the body always "stands on" the ring.

A cow at angle `θ` is positioned at radius `COW_FEET_R` from center. It is drawn
in a local upright frame (feet at local bottom, `+y`) and rotated by `θ − π/2`
so its feet point **outward** (direction `(cos θ, sin θ)`), opposite to the
saucers (which rotate by `angle + π/2` to point their bottoms inward).

Verification:
- Top (`θ = −π/2`, pos `(400, CY − r)`): outward = `(0,−1)` (up); rotation
  `= −π` → cow drawn upside down, feet up on the ring above, head toward center
  below. ✓
- Bottom (`θ = π/2`, pos `(400, CY + r)`): outward = `(0,1)` (down); rotation
  `= 0` → upright, feet on the ring below, head toward center above. ✓

## Geometry constants (Saucer Ring module)

- `COW_FEET_R = WORLD_R - 7 = 278` — radius of the cows' feet (just inside the
  ring). Body extends inward from there.
- `MAX_COWS = 12` — pool size.
- Cow drawn footprint roughly 18 px long (tangential) × 12 px tall (radial);
  final sizes are tunable constants and may be nudged during manual
  verification.

These sit outside both the player box and the saucer orbit, so cows never
overlap the play area or the saucers. Draw order places cows behind the
saucers, shots, and beams, just above the ring line.

## Cow state and behavior

Pooled `Cow` records, built once at construction (no per-frame allocation):

```
interface Cow {
  active: boolean;
  angle: number;      // angular position around the ring
  dir: number;        // +1 / -1 walk direction
  speed: number;      // linear px/s (constant per cow this iteration)
  state: number;      // COW_WALK | COW_GRAZE
  stateTimer: number; // seconds until the next behavior decision
  graze: number;      // 0 = head up, 1 = head fully down (eased toward target)
  stridePhase: number;// leg-animation accumulator
}
```

Phases:

- `COW_WALK`: `angle += dir * (speed / COW_FEET_R) * dt` (angular speed derived
  from linear speed so all cows move at the same ground speed regardless of
  radius). `stridePhase += dt` drives a simple two-pose leg cycle. `graze` eases
  toward 0 (head up).
- `COW_GRAZE`: cow holds position; `graze` eases toward 1 (head dips to the
  grass/ring). Legs idle.

Behavior decisions, on a seeded cadence (`stateTimer` countdown):

- When a `COW_WALK` cow's `stateTimer` expires, pick one of:
  reverse direction (turn around — leading side / facing flips), or enter
  `COW_GRAZE` for a random duration. Re-arm `stateTimer`.
- When a `COW_GRAZE` cow's `stateTimer` expires, return to `COW_WALK` and
  re-arm `stateTimer`.

All durations and the walk/turn/graze choice come from the cow RNG (below).
Tunable internal constants: `COW_SPEED`, `COW_DECISION_GAP_MIN/MAX`,
`COW_GRAZE_MIN/MAX`, `COW_TURN_CHANCE`, `COW_GRAZE_EASE`.

## Determinism

The gameplay simulation's determinism is load-bearing (reviewed; tests assert
exact loss/win steps). Cows therefore use a **separate RNG** seeded off the
config seed with a fixed offset (e.g. `createRng(cfg.seed + 70000)`), so cow
randomness is fully reproducible yet never advances the gameplay RNG stream.
Shot and tractor timing stay bit-identical to the cow-free build.

`reset()` reseeds **both** RNGs and re-initializes the cow pool in index order
(angle, dir, speed, state, stateTimer) so a fresh fight and a reset fight are
identical. Cows advance on the same fixed-step timeline as the rest of the sim.

`update`/`draw` use only scalar math, in-place mutation of the pools, and
`save/translate/rotate/restore` for the radial draw — no per-call object/array
literals, no closures, no `new`.

## Rendering

New primitive in `src/sprites.ts`, matching the `drawUfo` style:

```
drawCow(ctx, x, y, scale, facing, grazeAmount, stride)
```

- Draws a cow centered at the local origin (caller applies translate+rotate):
  white oval/rect body with two black spots, a head on the leading side, four
  legs, small ears/horns.
- `facing` (+1/−1) puts the head on the leading side and flips with direction.
- `stride` (0/1) selects one of two leg poses for a simple walk cycle; the
  caller derives it from the cow's `stridePhase` (and holds a fixed pose while
  grazing).
- `grazeAmount` (0–1) lowers/tilts the head toward the feet (the grass at the
  ring) — 0 head up, 1 head fully down.

Built from `fillRect`/`arc` only. The Saucer Ring `draw` wraps each cow call in
`ctx.save(); ctx.translate(cow x,y); ctx.rotate(θ − π/2); drawCow(...);
ctx.restore();` and draws cows before the saucers/shots/beams.

## Config

Add one tunable to `SaucerRingConfig`:

- `cowCount` (int, min 0, max `MAX_COWS`=12, default **5**).

This appends to `DEFAULT_SAUCER_RING`, the `SAUCER_RING_PARAMS` list, and the
config panel picks it up automatically. The definition test's expected
param-key list is updated to include `cowCount`.

Walk speed and graze/turn cadence stay internal constants this iteration (easy
to promote to params later).

`activeCows = min(cowCount, MAX_COWS)`; `cowCount = 0` yields no cows.

## Testing

Existing whole-fight tests (loss-by-shot, loss-by-beam, win, determinism,
saucer count, definition) must continue to pass. The determinism and loss/win
tests already guard that cows do not disturb the sim, because cows draw from a
separate RNG.

Changes/additions:

- **Test mock `ctx`:** the shared mock `CanvasRenderingContext2D` used by the
  render tests gains `save`/`restore`/`translate`/`rotate` no-ops (cows always
  draw with canvas transforms; the saucer-count test currently has `save`/
  `restore` but not `translate`/`rotate`).
- **Cow count render test:** with `cowCount = N`, `draw` produces N cow bodies
  (counted via a signature fill color used by `drawCow`, analogous to the
  saucer dome-count probe).
- **Cow determinism test:** two fights with the same config produce identical
  cow state (angle/dir/state) after N fixed steps.
- **Definition test:** updated to expect `cowCount` in the param-key list.
- **`drawCow` smoke test** in `sprites.test.ts`: invoking it issues fill calls
  without throwing.

## Out of scope (designed for, not built here)

Tractor-beam **abduction** of cows. Cows already carry a position and a `state`
field, so abduction becomes an additional cow state (e.g. `COW_ABDUCTED`)
triggered when a firing beam segment passes near a cow — no rework of this
iteration required.

## Self-review notes

- **Determinism:** separate cow RNG; gameplay stream untouched; `reset()`
  reseeds both; cows seeded in index order. Existing exact-step tests remain
  valid.
- **Allocation:** cow pool built once; `update`/`draw` scalar + in-place +
  canvas transforms only.
- **Test-env safety:** `drawCow` uses only `fillRect`/`arc`/`save`/`restore`;
  the mock `ctx` is extended with the transform no-ops so node render tests
  exercise the real draw path.
- **Scope:** decoration only; one new config param; abduction explicitly
  deferred but accommodated by the `state` field.
