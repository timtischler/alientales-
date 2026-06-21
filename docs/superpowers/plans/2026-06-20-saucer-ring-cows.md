# Saucer Ring Grazing Cows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ambient cows that walk along the inside of the green ring in the Saucer Ring fight — radially oriented (feet on the ring, head toward center), randomly turning around and stopping to graze — drawn procedurally, with zero impact on the deterministic win/loss simulation.

**Architecture:** A new procedural `drawCow` primitive in `src/sprites.ts` (all `fillRect`, same style as `drawUfo`). In `src/fights/saucerRing.ts`, a pooled `Cow[]` driven by a **separate** seeded RNG (so the gameplay RNG stream stays bit-identical), updated on the existing fixed step, and drawn behind the saucers using `ctx.save/translate/rotate/restore`. One new config param `cowCount`.

**Tech Stack:** TypeScript (strict), Vitest, Canvas2D — all already in the project.

## Global Constraints

- Decoration only: cows have **no collision** and **no effect** on the player, win/loss, or the gameplay RNG stream. Tractor abduction is explicitly out of scope (designed-for via the cow `state` field).
- Determinism: cows use a separate RNG `createRng(cfg.seed + 70000)`; `reset()` reseeds **both** RNGs and re-initializes the cow pool in index order. Existing tests assert exact loss/win steps and must stay green.
- Zero per-step/per-frame allocation in `update`/`draw`: no object/array literals, no closures per call, no `new`. The cow pool (`MAX_COWS = 12`) is built once at construction. Radial draw uses `save/translate/rotate/restore` (no allocation).
- Geometry: ring center `CX,CY = 400,300`, `WORLD_R = 285`. Cow body-center orbit radius `COW_R = WORLD_R - 16 = 269` (feet ride just inside the ring); cows rotate by `angle - π/2` so feet point outward and head toward center (mirror of the saucers' `angle + π/2`).
- `drawCow` draws **exactly one** muzzle `fillRect` at fillStyle `#f7b6c2` per cow — this is the cow-census signature counted by render tests (analogous to `drawUfo`'s `#cfe8ff` dome).
- Render tests drive `draw` with a mock `CanvasRenderingContext2D`; because cows always draw with canvas transforms, every mock ctx used with `draw` must provide `save`/`restore`/`translate`/`rotate` no-ops.
- Config param order: append `cowCount` (int, min 0, max 12, step 1, default 5) to the end of the existing param list.
- TypeScript strict; full suite green; `npm run build` succeeds.

---

### Task 1: `drawCow` procedural primitive

**Files:**
- Modify: `src/sprites.ts`
- Test: `src/sprites.test.ts`

**Interfaces:**
- Consumes: nothing (pure Canvas2D `fillRect` calls).
- Produces: `drawCow(ctx, x, y, scale, facing, grazeAmount, stride): void`.
  - `x,y` local origin (caller applies translate+rotate); `scale` size multiplier; `facing` (+1 head on +x side, -1 head on -x side); `grazeAmount` 0=head up toward center, 1=head down at the grass; `stride` 0|1 leg pose. Draws exactly one `#f7b6c2` muzzle `fillRect`.

- [ ] **Step 1: Write the failing test**

Append to `src/sprites.test.ts`:

```ts
import { drawCow } from "./sprites";

describe("drawCow", () => {
  it("draws exactly one muzzle fillRect (#f7b6c2 cow-census signature)", () => {
    let muzzles = 0;
    let fill = "";
    const ctx = {
      set fillStyle(v: string) { fill = v; },
      get fillStyle() { return fill; },
      fillRect() { if (fill === "#f7b6c2") muzzles++; },
    } as unknown as CanvasRenderingContext2D;
    drawCow(ctx, 0, 0, 1, 1, 0, 0);
    expect(muzzles).toBe(1);
  });

  it("does not throw for grazing pose and reversed facing", () => {
    const ctx = {
      set fillStyle(_v: string) {},
      fillRect() {},
    } as unknown as CanvasRenderingContext2D;
    expect(() => drawCow(ctx, 5, 5, 1.2, -1, 1, 1)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/sprites.test.ts`
Expected: FAIL — `drawCow` is not exported.

- [ ] **Step 3: Implement `drawCow` in `src/sprites.ts`**

Append at the end of `src/sprites.ts`:

```ts
// A small blocky cow, drawn centered at (x,y) in a local upright frame (feet at
// local +y). The caller translates to the ring position and rotates by
// `angle - PI/2` so the feet point outward and the head toward the ring center.
// Built entirely from fillRect (mock-ctx friendly). Exactly one muzzle fillRect
// at "#f7b6c2" per cow — render tests count these to census cows.
export function drawCow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  facing: number,
  grazeAmount: number,
  stride: number,
): void {
  const s = scale;
  const f = facing >= 0 ? 1 : -1;

  // Legs (behind body) — two poses for a simple walk cycle.
  ctx.fillStyle = "#2b2b2b";
  const sp = stride === 0 ? 1 : -1;
  const legY = y + 2 * s;
  const legH = 5 * s;
  const legW = 1.6 * s;
  ctx.fillRect(x + (-5 + sp) * s, legY, legW, legH);
  ctx.fillRect(x + (-2 - sp) * s, legY, legW, legH);
  ctx.fillRect(x + (2 + sp) * s, legY, legW, legH);
  ctx.fillRect(x + (5 - sp) * s, legY, legW, legH);

  // Body — white blocky torso.
  ctx.fillStyle = "#f2f2f2";
  ctx.fillRect(x - 7 * s, y - 4 * s, 14 * s, 8 * s);

  // Spots — black.
  ctx.fillStyle = "#1f1f1f";
  ctx.fillRect(x - 4 * s, y - 2 * s, 3 * s, 3 * s);
  ctx.fillRect(x + 1 * s, y, 3 * s, 3 * s);

  // Tail — trailing side.
  ctx.fillStyle = "#f2f2f2";
  ctx.fillRect(x - f * 8 * s, y - 3 * s, 1.4 * s, 6 * s);

  // Head — leading side; lowers toward the grass as grazeAmount rises.
  const headX = x + f * 7 * s;
  const headY = y + (-2 + grazeAmount * 7) * s;

  // Horns.
  ctx.fillStyle = "#d8c08a";
  ctx.fillRect(headX - 1.5 * s, headY - 4 * s, 1.2 * s, 2 * s);
  ctx.fillRect(headX + f * 2 * s, headY - 4 * s, 1.2 * s, 2 * s);

  // Ear (trailing edge of head).
  ctx.fillStyle = "#f2f2f2";
  ctx.fillRect(headX - f * 2 * s, headY - 2.5 * s, 2 * s, 1.6 * s);

  // Head block.
  ctx.fillStyle = "#f2f2f2";
  ctx.fillRect(headX - 2 * s, headY - 2 * s, 4.5 * s, 4 * s);

  // Muzzle (pink) — exactly one per cow; cow-census signature.
  ctx.fillStyle = "#f7b6c2";
  ctx.fillRect(headX + f * 1.5 * s, headY - 1 * s, 2.2 * s, 2.4 * s);
}
```

- [ ] **Step 4: Run tests + type-check**

Run: `npx tsc --noEmit && npm test -- src/sprites.test.ts`
Expected: no type errors; both `drawCow` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/sprites.ts src/sprites.test.ts
git commit -m "feat: drawCow procedural primitive"
```

---

### Task 2: Cows render on the ring (config, pool, placement)

**Files:**
- Modify: `src/fights/saucerRing.ts`
- Test: `src/fights/saucerRing.test.ts`

**Interfaces:**
- Consumes: `drawCow` (Task 1); `createRng`; existing module constants `CX/CY/WORLD_R`.
- Produces: `SaucerRingConfig.cowCount: number`; `DEFAULT_SAUCER_RING.cowCount = 5`; a `cowCount` entry appended to `SAUCER_RING_PARAMS`. Cows are initialized in `reset()` and rendered in `draw()` (no per-step motion yet — that is Task 3).

- [ ] **Step 1: Update the definition test and add the cow-count render test**

In `src/fights/saucerRing.test.ts`, update the param-key assertion in the `SAUCER_RING definition` test to append `"cowCount"`:

```ts
    expect(SAUCER_RING.params.map((p) => p.key)).toEqual([
      "seed", "volleys", "alienCount", "orbitSpeed", "shotGapMin", "shotGapMax",
      "shotSpeed", "tractorGapMin", "tractorGapMax", "telegraphTime", "beamTime", "beamWidth",
      "cowCount",
    ]);
```

Then update the existing `countSaucers` mock so it tolerates the cow transforms (add `translate`/`rotate` no-ops to its ctx — `save`/`restore` are already present):

```ts
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
    arc() {}, fill() {}, stroke() {}, translate() {}, rotate() {},
    fillRect() { if (fill === "#cfe8ff") domes++; },
```

Add a new `countCows` helper and test block:

```ts
function countCows(fight: { draw: (ctx: CanvasRenderingContext2D) => void }): number {
  let cows = 0;
  let fill = "";
  const ctx = {
    set fillStyle(v: string) { fill = v; },
    get fillStyle() { return fill; },
    strokeStyle: "", lineWidth: 0, globalAlpha: 1, lineCap: "",
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
    arc() {}, fill() {}, stroke() {}, translate() {}, rotate() {},
    fillRect() { if (fill === "#f7b6c2") cows++; },
  } as unknown as CanvasRenderingContext2D;
  fight.draw(ctx);
  return cows;
}

describe("SaucerRing cow count", () => {
  it("draws one cow per cowCount, and none when zero", () => {
    const player = makeCursor();
    const four = createSaucerRing({ ...DEFAULT_SAUCER_RING, cowCount: 4, volleys: 0, shotGapMin: 999, shotGapMax: 999 });
    const none = createSaucerRing({ ...DEFAULT_SAUCER_RING, cowCount: 0, volleys: 0, shotGapMin: 999, shotGapMax: 999 });
    for (let i = 0; i < 5; i++) { four.update(player, 1 / 120); none.update(player, 1 / 120); }
    expect(countCows(four)).toBe(4);
    expect(countCows(none)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/fights/saucerRing.test.ts`
Expected: FAIL — `cowCount` is not a config key / definition param; `countCows` returns 0.

- [ ] **Step 3: Add the config field, default, and param**

In `src/fights/saucerRing.ts`, add to the `SaucerRingConfig` interface (after `beamWidth`):

```ts
  beamWidth: number;
  cowCount: number;
```

Add to `DEFAULT_SAUCER_RING` (after `beamWidth: 24,`):

```ts
  beamWidth: 24,
  cowCount: 5,
```

Append to `SAUCER_RING_PARAMS` (after the `beamWidth` entry):

```ts
  { key: "beamWidth", label: "Beam width", kind: "float", min: 6, max: 80, step: 2 },
  { key: "cowCount", label: "Cows", kind: "int", min: 0, max: 12, step: 1 },
```

- [ ] **Step 4: Add cow constants, the Cow type, the pool, the cow RNG, and reset init**

In `src/fights/saucerRing.ts`, add after the existing constants block (after `const MAX_SHOTS = 64;`):

```ts
// --- Cows (decoration) ---
const COW_R = WORLD_R - 16; // body-center orbit radius; feet ride just inside the ring
const MAX_COWS = 12;
const COW_SCALE = 1.1;
const COW_SPEED = 18; // linear px/s along the ring
const COW_DECISION_GAP_MIN = 2.0;
const COW_DECISION_GAP_MAX = 5.0;
const COW_GRAZE_MIN = 1.5;
const COW_GRAZE_MAX = 4.0;
const COW_TURN_CHANCE = 0.5;
const COW_GRAZE_EASE = 6; // head ease toward target (per s)
const COW_STRIDE_RATE = 6; // stride phase units per s
const COW_STATE_WALK = 0;
const COW_STATE_GRAZE = 1;
const COW_RNG_OFFSET = 70000;

interface Cow {
  active: boolean;
  angle: number;
  dir: number;
  speed: number;
  state: number;
  stateTimer: number;
  graze: number;
  stridePhase: number;
}

function makeCow(): Cow {
  return { active: false, angle: 0, dir: 1, speed: 0, state: COW_STATE_WALK, stateTimer: 0, graze: 0, stridePhase: 0 };
}
```

Add the import at the top — extend the existing sprites import:

```ts
import { drawUfo, drawBeamLine, drawCow } from "../sprites";
```

Inside `createSaucerRing`, add the cow RNG, pool, and counter (next to the existing `aliens`/`shots` setup):

```ts
  const cowRng = createRng(cfg.seed + COW_RNG_OFFSET);
  const cows: Cow[] = [];
  for (let i = 0; i < MAX_COWS; i++) cows.push(makeCow());
  let activeCows = 0;
```

Add a `cowGap` helper next to the existing `gap` helper:

```ts
  function cowGap(min: number, max: number): number {
    return min + cowRng.next() * (max - min);
  }
```

In `reset()`, after the existing shot-clearing loop (`for (let i = 0; i < MAX_SHOTS; i++) shots[i].active = false;`), add cow init:

```ts
    cowRng.reseed(cfg.seed + COW_RNG_OFFSET);
    activeCows = Math.min(cfg.cowCount, MAX_COWS);
    for (let i = 0; i < activeCows; i++) {
      const c = cows[i];
      c.active = true;
      c.angle = cowRng.next() * Math.PI * 2;
      c.dir = cowRng.next() < 0.5 ? -1 : 1;
      c.speed = COW_SPEED;
      c.state = COW_STATE_WALK;
      c.stateTimer = cowGap(COW_DECISION_GAP_MIN, COW_DECISION_GAP_MAX);
      c.graze = 0;
      c.stridePhase = cowRng.next() * 1000;
    }
    for (let i = activeCows; i < MAX_COWS; i++) cows[i].active = false;
```

- [ ] **Step 5: Render cows in `draw` (behind the saucers)**

In `draw`, after the green ring is stroked and **before** the `for (let i = 0; i < activeAliens; i++)` saucer loop, add:

```ts
    for (let i = 0; i < activeCows; i++) {
      const c = cows[i];
      const ca = Math.cos(c.angle);
      const sa = Math.sin(c.angle);
      const cx = CX + ca * COW_R;
      const cy = CY + sa * COW_R;
      const stride = c.state === COW_STATE_WALK ? (Math.floor(c.stridePhase) & 1) : 0;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(c.angle - Math.PI / 2);
      drawCow(ctx, 0, 0, COW_SCALE, c.dir, c.graze, stride);
      ctx.restore();
    }
```

- [ ] **Step 6: Run tests + type-check + build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: no type errors; the full suite passes (the updated definition test, the new cow-count test, and all pre-existing tests including the saucer-count test with its updated mock); build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/fights/saucerRing.ts src/fights/saucerRing.test.ts
git commit -m "feat: render configurable cows on the inside of the ring"
```

---

### Task 3: Cow behavior (walk, turn around, graze)

**Files:**
- Modify: `src/fights/saucerRing.ts`
- Test: `src/fights/saucerRing.test.ts`

**Interfaces:**
- Consumes: the cow pool, `cowRng`, `cowGap`, and cow constants from Task 2.
- Produces: per-step cow motion in `update()` — walking advances `angle` and `stridePhase`, a seeded decision either reverses `dir` or enters `COW_STATE_GRAZE` (head eases down) for a random spell, then resumes. No new exports; gameplay RNG stream untouched.

- [ ] **Step 1: Write the failing tests**

Add to `src/fights/saucerRing.test.ts`:

```ts
function cowTransformLog(
  fight: { update: (p: Cursor, dt: number) => FightStatus; draw: (ctx: CanvasRenderingContext2D) => void },
  player: Cursor,
  steps: number,
): string[] {
  for (let i = 0; i < steps; i++) fight.update(player, 1 / 120);
  const log: string[] = [];
  const ctx = {
    set fillStyle(_v: string) {},
    get fillStyle() { return ""; },
    strokeStyle: "", lineWidth: 0, globalAlpha: 1, lineCap: "",
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
    arc() {}, fill() {}, stroke() {}, fillRect() {},
    translate(x: number, y: number) { log.push(x.toFixed(2) + "," + y.toFixed(2)); },
    rotate(a: number) { log.push("r" + a.toFixed(4)); },
  } as unknown as CanvasRenderingContext2D;
  fight.draw(ctx);
  return log;
}

function firstCowXY(fight: { draw: (ctx: CanvasRenderingContext2D) => void }): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let got = false;
  const ctx = {
    set fillStyle(_v: string) {},
    get fillStyle() { return ""; },
    strokeStyle: "", lineWidth: 0, globalAlpha: 1, lineCap: "",
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
    arc() {}, fill() {}, stroke() {}, fillRect() {}, rotate() {},
    translate(tx: number, ty: number) { if (!got) { x = tx; y = ty; got = true; } },
  } as unknown as CanvasRenderingContext2D;
  fight.draw(ctx);
  return { x, y };
}

describe("SaucerRing cow behavior", () => {
  it("a walking cow changes position over time", () => {
    const fight = createSaucerRing({ ...DEFAULT_SAUCER_RING, cowCount: 1, volleys: 0, shotGapMin: 999, shotGapMax: 999 });
    const p = makeCursor();
    for (let i = 0; i < 10; i++) fight.update(p, 1 / 120);
    const a = firstCowXY(fight);
    for (let i = 0; i < 110; i++) fight.update(p, 1 / 120);
    const b = firstCowXY(fight);
    expect(a.x !== b.x || a.y !== b.y).toBe(true);
  });

  it("cows are deterministic across instances with the same seed", () => {
    const cfg = { ...DEFAULT_SAUCER_RING, cowCount: 4 };
    const a = createSaucerRing(cfg);
    const b = createSaucerRing(cfg);
    expect(cowTransformLog(a, makeCursor(), 800)).toEqual(cowTransformLog(b, makeCursor(), 800));
  });
});
```

- [ ] **Step 2: Run to verify the walk test fails**

Run: `npm test -- src/fights/saucerRing.test.ts`
Expected: FAIL — "a walking cow changes position over time" fails because cows do not move yet (the determinism test passes trivially on static cows; the walk test is the red one).

- [ ] **Step 3: Add the cow update loop**

In `update`, immediately after `animClock += dt;` and **before** the `let anyBusy = false;` alien loop, add:

```ts
    for (let i = 0; i < activeCows; i++) {
      const c = cows[i];
      if (c.state === COW_STATE_WALK) {
        c.angle += c.dir * (c.speed / COW_R) * dt;
        c.stridePhase += COW_STRIDE_RATE * dt;
        if (c.graze > 0) c.graze = Math.max(0, c.graze - COW_GRAZE_EASE * dt);
        c.stateTimer -= dt;
        if (c.stateTimer <= 0) {
          if (cowRng.next() < COW_TURN_CHANCE) {
            c.dir = -c.dir;
            c.stateTimer = cowGap(COW_DECISION_GAP_MIN, COW_DECISION_GAP_MAX);
          } else {
            c.state = COW_STATE_GRAZE;
            c.stateTimer = cowGap(COW_GRAZE_MIN, COW_GRAZE_MAX);
          }
        }
      } else {
        if (c.graze < 1) c.graze = Math.min(1, c.graze + COW_GRAZE_EASE * dt);
        c.stateTimer -= dt;
        if (c.stateTimer <= 0) {
          c.state = COW_STATE_WALK;
          c.stateTimer = cowGap(COW_DECISION_GAP_MIN, COW_DECISION_GAP_MAX);
        }
      }
    }
```

- [ ] **Step 4: Run the full suite + type-check + build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: no type errors; **all** tests pass — the two new cow-behavior tests, plus every pre-existing test. Critically, the existing `SaucerRing loss by little shot` / `loss by tractor beam` / `win` / determinism tests must still pass unchanged, proving the separate cow RNG did not perturb the gameplay stream. Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/fights/saucerRing.ts src/fights/saucerRing.test.ts
git commit -m "feat: cows walk, turn around, and graze (deterministic, separate RNG)"
```

- [ ] **Step 6: Manual verification in the Windows browser**

Run: `npm run dev` (or rely on the running server), open `http://localhost:5173`, select **Saucer Ring**, and confirm:
- Cows ride the inside of the green ring, **feet on the ring, heads toward center** (a cow at the top hangs head-down; one at the bottom stands upright), behind the saucers.
- Cows walk tangentially, occasionally **turn around**, and occasionally **stop and dip their heads to graze**, then resume.
- The **Cows** slider in the config panel changes the herd size; 0 hides them.
- Saucer shots/tractor cadence and difficulty feel unchanged (cows are decoration).
- If sizing/placement looks off, nudge `COW_R`, `COW_SCALE`, or the `drawCow` proportions.

---

## Self-Review Notes

- **Spec coverage:** radial orientation `angle - π/2` (Task 2 draw); feet-just-inside-ring placement via `COW_R` (Task 2); walk/turn/graze behavior on seeded cadence (Task 3); separate cow RNG + `reset()` reseeds both + index-order init (Task 2/3); `drawCow` procedural primitive with single-muzzle census signature (Task 1); `cowCount` config param + panel pickup (Task 2); behind-saucers draw order (Task 2); zero-allocation pools + transforms (all tasks); test mock ctx gains `translate`/`rotate` (Task 2). Abduction explicitly deferred (designed-for via `state`). All covered.
- **Placeholder scan:** none — every code/test step is concrete.
- **Type consistency:** `Cow`/`makeCow`/`cowRng`/`cowGap`/`activeCows`/`COW_*` constants and the `drawCow(ctx,x,y,scale,facing,grazeAmount,stride)` signature are consistent across Tasks 1–3 and the tests. `cowCount` key matches across config, default, params, and the definition test.
- **Determinism:** cow RNG is `createRng(cfg.seed + 70000)`, never the gameplay `rng`; `reset()` reseeds both; the pre-existing exact-step loss/win/determinism tests are the regression guard and are required to stay green in Task 3 Step 4.
- **Test-env safety:** `drawCow` uses only `fillStyle`/`fillRect`; all mock ctx objects used with `draw` provide `save`/`restore`/`translate`/`rotate` no-ops, so node render tests exercise the real draw path.
