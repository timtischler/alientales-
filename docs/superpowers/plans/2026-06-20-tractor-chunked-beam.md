# Chunked Tractor Beam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Saucer Ring tractor beam's instant full-length fire with a beam that launches across the map in 20 discrete chunks (~2s), holds briefly, then smoothly retracts back into the saucer with a lengthwise fading gradient — damaging the player along its current extent during extend/hold/retract.

**Architecture:** A new `drawBeamGradient` primitive in `src/sprites.ts` (built from the existing `drawBeamLine`). In `src/fights/saucerRing.ts`, `PHASE_FIRE` is replaced by `PHASE_EXTEND`/`PHASE_HOLD`/`PHASE_RETRACT`, a per-alien `beamLen` field carries the current length, collision uses the partial segment, and `beamTime` is repurposed as the extend time plus a new `beamChunks` param.

**Tech Stack:** TypeScript (strict), Vitest, Canvas2D — all already in the project.

## Global Constraints

- Determinism: no new RNG. Chunk stepping and retract are time-based on the fixed step. The tractor draws exactly one gameplay `gap()` per volley (at RETRACT→ORBIT), same as the old FIRE→ORBIT re-arm — so the gameplay RNG stream stays byte-identical. The pre-existing exact-step loss/win/determinism tests must stay green.
- Zero per-step/per-frame allocation in `update`/`draw`: no object/array literals, no closures per call, no `new`. `beamLen` is a scalar field on the pooled `Alien`. `drawBeamGradient` is a scalar loop over `drawBeamLine`.
- Beam geometry: saucer at radius `ALIEN_R = 235`; inward normal `(idx,idy)`; full path length `2 * ALIEN_R`; the path passes through the ring center (at distance `ALIEN_R` from the saucer).
- Phase constants: `PHASE_ORBIT=0, PHASE_TELEGRAPH=1, PHASE_EXTEND=2, PHASE_HOLD=3, PHASE_RETRACT=4` (remove `PHASE_FIRE`).
- New timing constants: `BEAM_HOLD = 0.3`, `BEAM_RETRACT = 0.6`.
- Config: `beamTime` key reused but now means "beam extend time" (default `0.4 → 2.0`, label `"Beam (s)" → "Beam extend (s)"`, max `1.5 → 6`). New `beamChunks` param appended last (int, default 20, min 1, max 60, step 1).
- Param-key order after this change: `seed, volleys, alienCount, orbitSpeed, shotGapMin, shotGapMax, shotSpeed, tractorGapMin, tractorGapMax, telegraphTime, beamTime, beamWidth, cowCount, beamChunks`.
- Damage during EXTEND/HOLD/RETRACT along `[saucer, saucer + dir*beamLen]`; TELEGRAPH never damages.
- TypeScript strict; full suite green; `npm run build` succeeds.

---

### Task 1: `drawBeamGradient` primitive

**Files:**
- Modify: `src/sprites.ts`
- Test: `src/sprites.test.ts`

**Interfaces:**
- Consumes: the existing `drawBeamLine(ctx, x1, y1, x2, y2, width, color, alpha)`.
- Produces: `drawBeamGradient(ctx, x1, y1, x2, y2, width, color, alphaNear, alphaFar, segments): void` — draws `segments` collinear sub-segments from (x1,y1)→(x2,y2), each via `drawBeamLine`, with alpha linearly interpolated from `alphaNear` (the (x1,y1) end) to `alphaFar` (the (x2,y2) end).

- [ ] **Step 1: Write the failing test**

Append to `src/sprites.test.ts`:

```ts
import { drawBeamGradient } from "./sprites";

describe("drawBeamGradient", () => {
  it("strokes once per segment with alpha ramping from near to far", () => {
    let strokes = 0;
    const alphas: number[] = [];
    let alpha = 1;
    const ctx = {
      save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
      set globalAlpha(v: number) { alpha = v; },
      get globalAlpha() { return alpha; },
      set strokeStyle(_v: string) {},
      set lineWidth(_v: number) {},
      set lineCap(_v: string) {},
      stroke() { strokes++; alphas.push(alpha); },
    } as unknown as CanvasRenderingContext2D;
    drawBeamGradient(ctx, 0, 0, 100, 0, 10, "#ff3b6b", 0.8, 0.0, 5);
    expect(strokes).toBe(5);
    expect(alphas[0]).toBeGreaterThan(alphas[alphas.length - 1]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/sprites.test.ts`
Expected: FAIL — `drawBeamGradient` is not exported.

- [ ] **Step 3: Implement `drawBeamGradient` in `src/sprites.ts`**

Append at the end of `src/sprites.ts`:

```ts
// Draws a beam as `segments` collinear sub-segments, each via drawBeamLine,
// with alpha interpolated from alphaNear (the x1,y1 end) to alphaFar (the x2,y2
// end). Used for the tractor beam's smooth pull-in gradient. Allocation-free
// (scalar loop) and mock-ctx friendly (only drawBeamLine).
export function drawBeamGradient(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  color: string,
  alphaNear: number,
  alphaFar: number,
  segments: number,
): void {
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const sx = x1 + (x2 - x1) * t0;
    const sy = y1 + (y2 - y1) * t0;
    const ex = x1 + (x2 - x1) * t1;
    const ey = y1 + (y2 - y1) * t1;
    const a = alphaNear + (alphaFar - alphaNear) * ((t0 + t1) * 0.5);
    drawBeamLine(ctx, sx, sy, ex, ey, width, color, a);
  }
}
```

- [ ] **Step 4: Run tests + type-check**

Run: `npx tsc --noEmit && npm test -- src/sprites.test.ts`
Expected: no type errors; the `drawBeamGradient` test passes.

- [ ] **Step 5: Commit**

```bash
git add src/sprites.ts src/sprites.test.ts
git commit -m "feat: drawBeamGradient primitive for the tractor pull-in"
```

---

### Task 2: Chunked beam lifecycle in Saucer Ring

**Files:**
- Modify: `src/fights/saucerRing.ts`
- Test: `src/fights/saucerRing.test.ts`

**Interfaces:**
- Consumes: `drawBeamGradient` (Task 1); existing `drawBeamLine`, `distancePointToSegment`, `gap`, `ALIEN_R`, `PLAYER_R`.
- Produces: new phases `PHASE_EXTEND/HOLD/RETRACT`, `Alien.beamLen`, config `beamChunks` (+ repurposed `beamTime`). No new exports.

- [ ] **Step 1: Update the tests (definition param list + new extend-timing test)**

In `src/fights/saucerRing.test.ts`, update the `SAUCER_RING definition` param-key assertion to append `"beamChunks"` after `"cowCount"`:

```ts
    expect(SAUCER_RING.params.map((p) => p.key)).toEqual([
      "seed", "volleys", "alienCount", "orbitSpeed", "shotGapMin", "shotGapMax",
      "shotSpeed", "tractorGapMin", "tractorGapMax", "telegraphTime", "beamTime", "beamWidth",
      "cowCount", "beamChunks",
    ]);
```

Add a new test block (the beam passes through the ring center, and `makeCursor()` is centered, so a centered player is safe until the beam extends past center — independent of the saucer's seeded firing angle):

```ts
describe("SaucerRing chunked tractor beam", () => {
  it("does not damage a centered player until the beam extends past center", () => {
    const fight = createSaucerRing({
      ...DEFAULT_SAUCER_RING,
      alienCount: 1,
      volleys: 1,
      shotGapMin: 999, shotGapMax: 999,   // no little shots
      tractorGapMin: 0, tractorGapMax: 0, // tractor fires immediately
      telegraphTime: 0.1,
      beamTime: 1.0,                       // slow extend (~1s to cross)
      beamChunks: 20,
    });
    const p = makeCursor();
    // ~0.25s in: telegraph done + only the first few chunks -> beam well short
    // of center -> centered player still safe.
    let status: FightStatus = "running";
    for (let i = 0; i < 30; i++) status = fight.update(p, 1 / 120);
    expect(status).toBe("running");
    // Keep going until the beam grows past center -> centered player is hit.
    for (let i = 0; i < 120 && status === "running"; i++) status = fight.update(p, 1 / 120);
    expect(status).toBe("lost");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/fights/saucerRing.test.ts`
Expected: FAIL — `beamChunks` is not a config/param key; with the current instant-fire beam, the centered player is killed in the first window so the `expect(status).toBe("running")` after 30 steps fails (and/or a type error on `beamChunks`).

- [ ] **Step 3: Replace the phase constants and add timing constants**

In `src/fights/saucerRing.ts`, find:

```ts
const PHASE_ORBIT = 0;
const PHASE_TELEGRAPH = 1;
const PHASE_FIRE = 2;
```

Replace with:

```ts
const PHASE_ORBIT = 0;
const PHASE_TELEGRAPH = 1;
const PHASE_EXTEND = 2;
const PHASE_HOLD = 3;
const PHASE_RETRACT = 4;
const BEAM_HOLD = 0.3; // seconds at full length before retracting
const BEAM_RETRACT = 0.6; // seconds to fully pull in
```

- [ ] **Step 4: Add `beamLen` to the Alien type and factory**

In the `Alien` interface, add `beamLen` after `stateTimer`:

```ts
interface Alien {
  angle: number;
  x: number;
  y: number;
  idx: number; // inward unit normal x
  idy: number; // inward unit normal y
  shotTimer: number;
  tractorTimer: number;
  phase: number;
  stateTimer: number;
  beamLen: number; // current tractor beam length; 0 when not firing
}
```

In `makeAlien()`, add `beamLen: 0` to the returned object:

```ts
function makeAlien(): Alien {
  return { angle: 0, x: 0, y: 0, idx: 0, idy: 0, shotTimer: 0, tractorTimer: 0, phase: PHASE_ORBIT, stateTimer: 0, beamLen: 0 };
}
```

- [ ] **Step 5: Extend the sprites import**

Change:

```ts
import { drawUfo, drawBeamLine, drawCow } from "../sprites";
```

to:

```ts
import { drawUfo, drawBeamLine, drawCow, drawBeamGradient } from "../sprites";
```

- [ ] **Step 6: Add the `beamChunks` config field, default, and param; repurpose `beamTime`**

In `SaucerRingConfig`, add `beamChunks` after `cowCount`:

```ts
  cowCount: number;
  beamChunks: number;
```

In `DEFAULT_SAUCER_RING`, change `beamTime` to `2.0` and add `beamChunks: 20` after `cowCount`:

```ts
  beamTime: 2.0,
  beamWidth: 24,
  cowCount: 5,
  beamChunks: 20,
```

(`beamTime` and `beamWidth` keep their positions in the object literal; only the `beamTime` value changes and `beamChunks` is added after `cowCount`.)

In `SAUCER_RING_PARAMS`, replace the existing `beamTime` entry and append a `beamChunks` entry after the `cowCount` entry:

```ts
  { key: "beamTime", label: "Beam extend (s)", kind: "float", min: 0.1, max: 6, step: 0.1 },
```

```ts
  { key: "cowCount", label: "Cows", kind: "int", min: 0, max: 12, step: 1 },
  { key: "beamChunks", label: "Beam chunks", kind: "int", min: 1, max: 60, step: 1 },
```

- [ ] **Step 7: Replace the tractor update logic (telegraph/fire) and collision**

In `update`, find the telegraph/else(fire) block and the `if (a.phase === PHASE_FIRE)` collision block:

```ts
      } else if (a.phase === PHASE_TELEGRAPH) {
        anyBusy = true;
        a.stateTimer += dt;
        if (a.stateTimer >= cfg.telegraphTime) {
          a.phase = PHASE_FIRE;
          a.stateTimer = 0;
          firedVolleys++;
        }
      } else {
        anyBusy = true;
        a.stateTimer += dt;
        if (a.stateTimer >= cfg.beamTime) {
          a.phase = PHASE_ORBIT;
          a.tractorTimer = gap(cfg.tractorGapMin, cfg.tractorGapMax);
        }
      }

      if (a.phase === PHASE_FIRE) {
        const ex = a.x + a.idx * 2 * ALIEN_R;
        const ey = a.y + a.idy * 2 * ALIEN_R;
        if (distancePointToSegment(pcx, pcy, a.x, a.y, ex, ey) <= cfg.beamWidth / 2 + PLAYER_R) {
          return "lost";
        }
      }
```

Replace with:

```ts
      } else if (a.phase === PHASE_TELEGRAPH) {
        anyBusy = true;
        a.stateTimer += dt;
        if (a.stateTimer >= cfg.telegraphTime) {
          a.phase = PHASE_EXTEND;
          a.stateTimer = 0;
          a.beamLen = 0;
          firedVolleys++;
        }
      } else if (a.phase === PHASE_EXTEND) {
        anyBusy = true;
        a.stateTimer += dt;
        const chunkTime = cfg.beamTime / cfg.beamChunks;
        let chunk = 1 + Math.floor(a.stateTimer / chunkTime);
        if (chunk > cfg.beamChunks) chunk = cfg.beamChunks;
        a.beamLen = (chunk / cfg.beamChunks) * (2 * ALIEN_R);
        if (a.stateTimer >= cfg.beamTime) {
          a.phase = PHASE_HOLD;
          a.stateTimer = 0;
          a.beamLen = 2 * ALIEN_R;
        }
      } else if (a.phase === PHASE_HOLD) {
        anyBusy = true;
        a.beamLen = 2 * ALIEN_R;
        a.stateTimer += dt;
        if (a.stateTimer >= BEAM_HOLD) {
          a.phase = PHASE_RETRACT;
          a.stateTimer = 0;
        }
      } else if (a.phase === PHASE_RETRACT) {
        anyBusy = true;
        a.stateTimer += dt;
        const frac = Math.max(0, 1 - a.stateTimer / BEAM_RETRACT);
        a.beamLen = frac * (2 * ALIEN_R);
        if (a.stateTimer >= BEAM_RETRACT) {
          a.phase = PHASE_ORBIT;
          a.beamLen = 0;
          a.tractorTimer = gap(cfg.tractorGapMin, cfg.tractorGapMax);
        }
      }

      if (a.phase === PHASE_EXTEND || a.phase === PHASE_HOLD || a.phase === PHASE_RETRACT) {
        if (a.beamLen > 0) {
          const ex = a.x + a.idx * a.beamLen;
          const ey = a.y + a.idy * a.beamLen;
          if (distancePointToSegment(pcx, pcy, a.x, a.y, ex, ey) <= cfg.beamWidth / 2 + PLAYER_R) {
            return "lost";
          }
        }
      }
```

(The `if (a.phase === PHASE_ORBIT)` shot/tractor-trigger block immediately above this is unchanged.)

- [ ] **Step 8: Replace the tractor draw logic**

In `draw`, inside the saucer loop, find:

```ts
      const ex = a.x + a.idx * 2 * ALIEN_R;
      const ey = a.y + a.idy * 2 * ALIEN_R;
      if (a.phase === PHASE_TELEGRAPH) {
        drawBeamLine(ctx, a.x, a.y, ex, ey, 3, "#ff5cf0", 0.5);
      } else if (a.phase === PHASE_FIRE) {
        drawBeamLine(ctx, a.x, a.y, ex, ey, cfg.beamWidth, "#ff3b6b", 0.85);
      }
```

Replace with:

```ts
      if (a.phase === PHASE_TELEGRAPH) {
        const tex = a.x + a.idx * 2 * ALIEN_R;
        const tey = a.y + a.idy * 2 * ALIEN_R;
        drawBeamLine(ctx, a.x, a.y, tex, tey, 3, "#ff5cf0", 0.5);
      } else if (a.beamLen > 0) {
        const bex = a.x + a.idx * a.beamLen;
        const bey = a.y + a.idy * a.beamLen;
        if (a.phase === PHASE_RETRACT) {
          drawBeamGradient(ctx, a.x, a.y, bex, bey, cfg.beamWidth, "#ff3b6b", 0.85, 0.0, 10);
        } else {
          drawBeamLine(ctx, a.x, a.y, bex, bey, cfg.beamWidth, "#ff3b6b", 0.85);
        }
      }
```

(The saucer-body sprite/fallback draw that follows this block is unchanged.)

- [ ] **Step 9: Run the full suite + type-check + build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: no type errors (no remaining `PHASE_FIRE` reference); the FULL suite passes — the new chunked-beam test, the updated definition test, and ALL pre-existing tests. CRITICALLY: the pre-existing `loss by little shot` / `loss by tractor beam` / `win` / determinism tests still pass unchanged (the centered player is still killed by the tractor as the beam crosses center; the gameplay RNG stream is untouched). Build succeeds.

- [ ] **Step 10: Commit**

```bash
git add src/fights/saucerRing.ts src/fights/saucerRing.test.ts
git commit -m "feat: chunked tractor beam launch + smooth retract"
```

- [ ] **Step 11: Manual verification in the Windows browser**

Rely on the running dev server (do not start one), open `http://localhost:5173`, select **Saucer Ring**, and confirm:
- After the telegraph, the tractor beam **grows across the map one chunk at a time** (~20 chunks, ~2s), passing through the center toward the far side.
- It **holds briefly** at full length, then **pulls back in toward the saucer with a smooth fading gradient**.
- Standing on the beam line is dangerous while it grows AND while it retracts; the telegraph line itself is safe.
- The **Beam extend (s)** and **Beam chunks** sliders in the config panel change the crawl speed and chunk granularity.
- Shots, cows, saucers, and win/loss otherwise feel unchanged.
- If pacing/look is off, tune `beamTime` / `beamChunks` (panel) or `BEAM_HOLD` / `BEAM_RETRACT` / the gradient `segments` (code).

---

## Self-Review Notes

- **Spec coverage:** chunked extend over `beamTime` in `beamChunks` steps (Task 2 Step 7); hold then retract with `BEAM_HOLD`/`BEAM_RETRACT` (Step 7); damage along partial extent during extend/hold/retract, telegraph safe (Step 7 collision); `beamLen` state (Step 4); `drawBeamGradient` retract render + solid extend/hold render (Task 1, Task 2 Step 8); `beamTime` repurposed + `beamChunks` param + definition test (Steps 1, 6); determinism preserved, one `gap()` per volley (Step 7). All covered.
- **Placeholder scan:** none — every code/test step is concrete.
- **Type consistency:** `PHASE_EXTEND/HOLD/RETRACT`, `BEAM_HOLD`, `BEAM_RETRACT`, `Alien.beamLen`, `beamChunks`, and `drawBeamGradient(ctx,x1,y1,x2,y2,width,color,alphaNear,alphaFar,segments)` are consistent across Tasks 1–2 and the tests. `PHASE_FIRE` is fully removed (constant + both uses).
- **Determinism:** no new RNG; exactly one `gap()` per volley at RETRACT→ORBIT; the pre-existing exact-step tests are the regression guard (Task 2 Step 9).
- **Test-env safety:** `drawBeamGradient` uses only `drawBeamLine` (save/restore/globalAlpha/stroke), already supported by the mock ctx; no saucer is mid-fire during the count tests.
