# Bullethell MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A centered white arena box with a WASD-controlled cursor that feels fast and responsive, as the foundation for an Undertale-style bullethell.

**Architecture:** A Vite + TypeScript app rendering to a single Canvas2D element. A `requestAnimationFrame` loop drives a fixed-timestep (120 Hz) accumulator that simulates movement and renders the latest state with no interpolation. Input is read from a sampled keystate set; movement is a pure, unit-tested function. Zero per-frame allocation keeps GC (and thus periodic lag) out of play.

**Tech Stack:** Vite, TypeScript, Vitest, Canvas2D, browser `localStorage`.

## Global Constraints

- Runtime target: native Windows browser (Chrome/Edge) reaching the WSL2 Vite dev server at `localhost:5173`.
- Logical render resolution: 800×600, scaled by `devicePixelRatio`.
- Simulation rate: fixed timestep at 120 Hz (`FIXED_DT = 1 / 120` seconds).
- Per-frame `dt` clamp: 0.25 seconds maximum.
- The game loop must allocate nothing per frame: no `new`, no array/object literals, no per-frame closures.
- Default movement mode: `"digital"`. Modes are exactly `"digital"` and `"accelerated"`.
- Movement keys: `KeyW` (up), `KeyA` (left), `KeyS` (down), `KeyD` (right). Compare against `KeyboardEvent.code`, not `.key`.
- No frameworks (no React/Vue/etc.).

---

### Task 1: Project scaffolding (Vite + TS + Vitest)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.ts`
- Test: `src/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a runnable dev server (`npm run dev`) and test runner (`npm test`). No exported game symbols yet.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "bullethell",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vitest/globals"],
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 3: Create `vite.config.ts`**

```ts
import { defineConfig } from "vite";

export default defineConfig({
  server: { host: true, port: 5173, strictPort: true },
  test: { globals: true, environment: "node" },
});
```

- [ ] **Step 4: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Bullethell</title>
    <style>
      html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
      body { display: flex; align-items: center; justify-content: center; }
      canvas { display: block; }
    </style>
  </head>
  <body>
    <canvas id="game"></canvas>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Create a placeholder `src/main.ts`**

```ts
// Bootstrap is implemented in Task 6. Placeholder so index.html resolves.
console.log("bullethell boot");
```

- [ ] **Step 6: Write a smoke test**

```ts
// src/smoke.test.ts
import { describe, it, expect } from "vitest";

describe("toolchain", () => {
  it("runs tests", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: Install and run the smoke test**

Run: `npm install && npm test`
Expected: install succeeds; Vitest reports 1 passing test.

- [ ] **Step 8: Verify the dev server boots**

Run: `npm run dev` (then Ctrl-C after it prints the URL)
Expected: Vite prints `Local: http://localhost:5173/` and a Network URL. No errors.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src/main.ts src/smoke.test.ts
git commit -m "chore: scaffold Vite + TS + Vitest project"
```

---

### Task 2: Shared types and constants

**Files:**
- Create: `src/constants.ts`
- Create: `src/types.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `src/constants.ts` exports: `LOGICAL_WIDTH = 800`, `LOGICAL_HEIGHT = 600` (numbers); `FIXED_DT = 1 / 120` (number, seconds); `MAX_FRAME_DT = 0.25` (number, seconds); `CURSOR_SPEED = 240` (number, logical px/sec); `CURSOR_SIZE = 16` (number, px); `ACCEL_TIME = 0.08` (number, seconds to reach full speed); `ARENA` object `{ x: number, y: number, w: number, h: number }` — a 300×300 box centered in the logical space: `{ x: 250, y: 150, w: 300, h: 300 }`.
  - `src/types.ts` exports: `type MovementMode = "digital" | "accelerated"`; `interface Vec2 { x: number; y: number }`; `interface InputState { up: boolean; down: boolean; left: boolean; right: boolean }`.

- [ ] **Step 1: Create `src/constants.ts`**

```ts
export const LOGICAL_WIDTH = 800;
export const LOGICAL_HEIGHT = 600;

export const FIXED_DT = 1 / 120;
export const MAX_FRAME_DT = 0.25;

export const CURSOR_SPEED = 240; // logical px per second
export const CURSOR_SIZE = 16; // px (square side)
export const ACCEL_TIME = 0.08; // seconds to reach full speed in accelerated mode

// Arena is a 300x300 square centered in the 800x600 logical space.
export const ARENA = { x: 250, y: 150, w: 300, h: 300 } as const;
```

- [ ] **Step 2: Create `src/types.ts`**

```ts
export type MovementMode = "digital" | "accelerated";

export interface Vec2 {
  x: number;
  y: number;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/constants.ts src/types.ts
git commit -m "feat: add shared types and constants"
```

---

### Task 3: Pure movement model (digital mode)

**Files:**
- Create: `src/movement.ts`
- Test: `src/movement.test.ts`

**Interfaces:**
- Consumes: `MovementMode`, `Vec2`, `InputState` from `src/types.ts`; `CURSOR_SPEED`, `CURSOR_SIZE`, `ACCEL_TIME`, `ARENA` from `src/constants.ts`.
- Produces:
  - `interface Cursor { pos: Vec2; vel: Vec2 }` (exported from `src/movement.ts`).
  - `function stepMovement(cursor: Cursor, input: InputState, dt: number, mode: MovementMode): void` — mutates `cursor` in place (no allocation), advancing position by `dt` seconds, then clamping so the cursor square (side `CURSOR_SIZE`, position is its top-left corner) stays fully inside `ARENA`. `vel` is used only by accelerated mode (Task 4) but is read/written by both.
  - `function makeCursor(): Cursor` — returns a cursor centered in `ARENA` with zero velocity.

This task implements `makeCursor`, `stepMovement` clamping, and the **digital** branch. The accelerated branch is added in Task 4.

- [ ] **Step 1: Write failing tests for digital mode and clamping**

```ts
// src/movement.test.ts
import { describe, it, expect } from "vitest";
import { makeCursor, stepMovement } from "./movement";
import { ARENA, CURSOR_SIZE, CURSOR_SPEED } from "./constants";

const noInput = { up: false, down: false, left: false, right: false };

describe("makeCursor", () => {
  it("centers the cursor in the arena with zero velocity", () => {
    const c = makeCursor();
    expect(c.pos.x).toBe(ARENA.x + (ARENA.w - CURSOR_SIZE) / 2);
    expect(c.pos.y).toBe(ARENA.y + (ARENA.h - CURSOR_SIZE) / 2);
    expect(c.vel).toEqual({ x: 0, y: 0 });
  });
});

describe("stepMovement digital", () => {
  it("moves right at full speed instantly", () => {
    const c = makeCursor();
    const startX = c.pos.x;
    stepMovement(c, { ...noInput, right: true }, 0.1, "digital");
    expect(c.pos.x).toBeCloseTo(startX + CURSOR_SPEED * 0.1, 5);
  });

  it("stops instantly on release (no momentum)", () => {
    const c = makeCursor();
    stepMovement(c, { ...noInput, right: true }, 0.1, "digital");
    const afterMove = c.pos.x;
    stepMovement(c, noInput, 0.1, "digital");
    expect(c.pos.x).toBe(afterMove);
  });

  it("normalizes diagonal speed", () => {
    const c = makeCursor();
    const start = { x: c.pos.x, y: c.pos.y };
    stepMovement(c, { ...noInput, right: true, down: true }, 0.1, "digital");
    const dx = c.pos.x - start.x;
    const dy = c.pos.y - start.y;
    const dist = Math.hypot(dx, dy);
    expect(dist).toBeCloseTo(CURSOR_SPEED * 0.1, 4);
  });

  it("clamps to the right edge", () => {
    const c = makeCursor();
    stepMovement(c, { ...noInput, right: true }, 100, "digital");
    expect(c.pos.x).toBe(ARENA.x + ARENA.w - CURSOR_SIZE);
  });

  it("clamps to the left edge", () => {
    const c = makeCursor();
    stepMovement(c, { ...noInput, left: true }, 100, "digital");
    expect(c.pos.x).toBe(ARENA.x);
  });

  it("clamps to the bottom edge", () => {
    const c = makeCursor();
    stepMovement(c, { ...noInput, down: true }, 100, "digital");
    expect(c.pos.y).toBe(ARENA.y + ARENA.h - CURSOR_SIZE);
  });

  it("clamps to the top edge", () => {
    const c = makeCursor();
    stepMovement(c, { ...noInput, up: true }, 100, "digital");
    expect(c.pos.y).toBe(ARENA.y);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `makeCursor`/`stepMovement` not exported / not defined.

- [ ] **Step 3: Implement `src/movement.ts` (digital + clamping)**

```ts
import type { InputState, MovementMode, Vec2 } from "./types";
import { ARENA, CURSOR_SIZE, CURSOR_SPEED } from "./constants";

export interface Cursor {
  pos: Vec2;
  vel: Vec2;
}

export function makeCursor(): Cursor {
  return {
    pos: {
      x: ARENA.x + (ARENA.w - CURSOR_SIZE) / 2,
      y: ARENA.y + (ARENA.h - CURSOR_SIZE) / 2,
    },
    vel: { x: 0, y: 0 },
  };
}

function clampToArena(cursor: Cursor): void {
  const maxX = ARENA.x + ARENA.w - CURSOR_SIZE;
  const maxY = ARENA.y + ARENA.h - CURSOR_SIZE;
  if (cursor.pos.x < ARENA.x) cursor.pos.x = ARENA.x;
  else if (cursor.pos.x > maxX) cursor.pos.x = maxX;
  if (cursor.pos.y < ARENA.y) cursor.pos.y = ARENA.y;
  else if (cursor.pos.y > maxY) cursor.pos.y = maxY;
}

export function stepMovement(
  cursor: Cursor,
  input: InputState,
  dt: number,
  mode: MovementMode,
): void {
  // Desired direction from input (-1, 0, or 1 per axis).
  let dirX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let dirY = (input.down ? 1 : 0) - (input.up ? 1 : 0);

  // Normalize so diagonals are not faster than cardinals.
  if (dirX !== 0 && dirY !== 0) {
    const inv = 1 / Math.SQRT2;
    dirX *= inv;
    dirY *= inv;
  }

  if (mode === "digital") {
    cursor.vel.x = dirX * CURSOR_SPEED;
    cursor.vel.y = dirY * CURSOR_SPEED;
  } else {
    // Accelerated mode implemented in Task 4.
    cursor.vel.x = dirX * CURSOR_SPEED;
    cursor.vel.y = dirY * CURSOR_SPEED;
  }

  cursor.pos.x += cursor.vel.x * dt;
  cursor.pos.y += cursor.vel.y * dt;
  clampToArena(cursor);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all digital/clamp tests green.

- [ ] **Step 5: Commit**

```bash
git add src/movement.ts src/movement.test.ts
git commit -m "feat: pure movement model with digital mode and arena clamping"
```

---

### Task 4: Accelerated movement mode

**Files:**
- Modify: `src/movement.ts`
- Test: `src/movement.test.ts` (add cases)

**Interfaces:**
- Consumes: everything from Task 3 plus `ACCEL_TIME`, `CURSOR_SPEED` from `src/constants.ts`.
- Produces: no new exports. `stepMovement`'s `"accelerated"` branch now ramps `vel` toward the target velocity at rate `CURSOR_SPEED / ACCEL_TIME` per second, and decays toward zero at the same rate when there is no input on an axis.

- [ ] **Step 1: Add failing tests for accelerated mode**

```ts
// Append to src/movement.test.ts
describe("stepMovement accelerated", () => {
  it("does not reach full speed instantly", () => {
    const c = makeCursor();
    const startX = c.pos.x;
    // One short step: should move less than full-speed distance.
    stepMovement(c, { up: false, down: false, left: false, right: true }, 0.02, "accelerated");
    const moved = c.pos.x - startX;
    expect(moved).toBeLessThan(CURSOR_SPEED * 0.02);
    expect(moved).toBeGreaterThan(0);
  });

  it("ramps up to full speed after ACCEL_TIME of holding", () => {
    const c = makeCursor();
    const input = { up: false, down: false, left: false, right: true };
    // Advance well past ACCEL_TIME in small steps.
    for (let i = 0; i < 60; i++) stepMovement(c, input, 1 / 120, "accelerated");
    expect(c.vel.x).toBeCloseTo(CURSOR_SPEED, 1);
  });

  it("decelerates toward zero on release", () => {
    const c = makeCursor();
    const input = { up: false, down: false, left: false, right: true };
    for (let i = 0; i < 60; i++) stepMovement(c, input, 1 / 120, "accelerated");
    const noInput = { up: false, down: false, left: false, right: false };
    const velBefore = c.vel.x;
    stepMovement(c, noInput, 1 / 120, "accelerated");
    expect(c.vel.x).toBeLessThan(velBefore);
    expect(c.vel.x).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npm test`
Expected: FAIL — the "does not reach full speed instantly" test fails because the placeholder accelerated branch is identical to digital.

- [ ] **Step 3: Replace the accelerated branch in `src/movement.ts`**

Replace the `} else {` block inside `stepMovement` (and add the helper above `stepMovement`):

```ts
function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  if (current > target) return Math.max(current - maxDelta, target);
  return target;
}
```

```ts
  if (mode === "digital") {
    cursor.vel.x = dirX * CURSOR_SPEED;
    cursor.vel.y = dirY * CURSOR_SPEED;
  } else {
    const targetX = dirX * CURSOR_SPEED;
    const targetY = dirY * CURSOR_SPEED;
    const maxDelta = (CURSOR_SPEED / ACCEL_TIME) * dt;
    cursor.vel.x = approach(cursor.vel.x, targetX, maxDelta);
    cursor.vel.y = approach(cursor.vel.y, targetY, maxDelta);
  }
```

Add the `ACCEL_TIME` import to the existing import from `./constants`:

```ts
import { ARENA, CURSOR_SIZE, CURSOR_SPEED, ACCEL_TIME } from "./constants";
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npm test`
Expected: PASS — digital and accelerated suites both green.

- [ ] **Step 5: Commit**

```bash
git add src/movement.ts src/movement.test.ts
git commit -m "feat: add accelerated movement mode"
```

---

### Task 5: Input keystate tracking

**Files:**
- Create: `src/input.ts`
- Test: `src/input.test.ts`

**Interfaces:**
- Consumes: `InputState` from `src/types.ts`.
- Produces:
  - `interface InputController { state: InputState; dispose(): void }`.
  - `function createInput(target: { addEventListener: typeof window.addEventListener; removeEventListener: typeof window.removeEventListener }): InputController` — attaches `keydown`/`keyup` listeners, maps `KeyW/A/S/D` to `state` booleans, ignores `event.repeat`, calls `preventDefault()` on handled keys, and updates the **same** `state` object in place (no per-event allocation). `dispose()` removes the listeners.

- [ ] **Step 1: Write failing tests using a fake event target**

```ts
// src/input.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createInput } from "./input";

type Handler = (e: any) => void;

class FakeTarget {
  handlers: Record<string, Handler[]> = {};
  addEventListener(type: string, h: Handler) {
    (this.handlers[type] ??= []).push(h);
  }
  removeEventListener(type: string, h: Handler) {
    this.handlers[type] = (this.handlers[type] ?? []).filter((x) => x !== h);
  }
  fire(type: string, e: any) {
    e.preventDefault ??= () => {};
    for (const h of this.handlers[type] ?? []) h(e);
  }
}

let target: FakeTarget;
beforeEach(() => {
  target = new FakeTarget();
});

describe("createInput", () => {
  it("sets the matching direction on keydown", () => {
    const input = createInput(target as any);
    target.fire("keydown", { code: "KeyD", repeat: false });
    expect(input.state.right).toBe(true);
    expect(input.state.left).toBe(false);
  });

  it("clears the direction on keyup", () => {
    const input = createInput(target as any);
    target.fire("keydown", { code: "KeyW", repeat: false });
    expect(input.state.up).toBe(true);
    target.fire("keyup", { code: "KeyW", repeat: false });
    expect(input.state.up).toBe(false);
  });

  it("ignores OS key-repeat events", () => {
    const input = createInput(target as any);
    let prevents = 0;
    target.fire("keydown", { code: "KeyA", repeat: true, preventDefault: () => prevents++ });
    expect(input.state.left).toBe(false);
    expect(prevents).toBe(0);
  });

  it("calls preventDefault on handled keys", () => {
    const input = createInput(target as any);
    let prevented = false;
    target.fire("keydown", { code: "KeyS", repeat: false, preventDefault: () => (prevented = true) });
    expect(prevented).toBe(true);
    expect(input.state.down).toBe(true);
  });

  it("ignores unrelated keys", () => {
    const input = createInput(target as any);
    let prevented = false;
    target.fire("keydown", { code: "KeyQ", repeat: false, preventDefault: () => (prevented = true) });
    expect(prevented).toBe(false);
    expect(input.state).toEqual({ up: false, down: false, left: false, right: false });
  });

  it("dispose removes listeners", () => {
    const input = createInput(target as any);
    input.dispose();
    target.fire("keydown", { code: "KeyD", repeat: false });
    expect(input.state.right).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `createInput` not defined.

- [ ] **Step 3: Implement `src/input.ts`**

```ts
import type { InputState } from "./types";

export interface InputController {
  state: InputState;
  dispose(): void;
}

type Listenable = {
  addEventListener: typeof window.addEventListener;
  removeEventListener: typeof window.removeEventListener;
};

const KEY_MAP: Record<string, keyof InputState> = {
  KeyW: "up",
  KeyS: "down",
  KeyA: "left",
  KeyD: "right",
};

export function createInput(target: Listenable): InputController {
  const state: InputState = { up: false, down: false, left: false, right: false };

  const onKey = (down: boolean) => (e: KeyboardEvent) => {
    if (e.repeat) return;
    const dir = KEY_MAP[e.code];
    if (dir === undefined) return;
    e.preventDefault();
    state[dir] = down;
  };

  const onDown = onKey(true);
  const onUp = onKey(false);

  target.addEventListener("keydown", onDown);
  target.addEventListener("keyup", onUp);

  return {
    state,
    dispose() {
      target.removeEventListener("keydown", onDown);
      target.removeEventListener("keyup", onUp);
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all input tests green.

- [ ] **Step 5: Commit**

```bash
git add src/input.ts src/input.test.ts
git commit -m "feat: keystate input controller"
```

---

### Task 6: Settings (movement-mode toggle + persistence)

**Files:**
- Create: `src/settings.ts`
- Test: `src/settings.test.ts`

**Interfaces:**
- Consumes: `MovementMode` from `src/types.ts`.
- Produces:
  - `const STORAGE_KEY = "bullethell.movementMode"`.
  - `function loadMode(storage: Pick<Storage, "getItem" | "setItem">): MovementMode` — returns the stored mode if it is a valid `MovementMode`, else `"digital"`.
  - `function saveMode(storage: Pick<Storage, "getItem" | "setItem">, mode: MovementMode): void`.

The DOM wiring of the toggle lives in Task 8 (bootstrap); this task is the pure persistence layer so it is unit-testable with a fake storage.

- [ ] **Step 1: Write failing tests with a fake storage**

```ts
// src/settings.test.ts
import { describe, it, expect } from "vitest";
import { loadMode, saveMode } from "./settings";

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe("settings persistence", () => {
  it("defaults to digital when nothing stored", () => {
    expect(loadMode(fakeStorage())).toBe("digital");
  });

  it("defaults to digital when stored value is invalid", () => {
    expect(loadMode(fakeStorage({ "bullethell.movementMode": "nonsense" }))).toBe("digital");
  });

  it("round-trips a saved mode", () => {
    const s = fakeStorage();
    saveMode(s, "accelerated");
    expect(loadMode(s)).toBe("accelerated");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `loadMode`/`saveMode` not defined.

- [ ] **Step 3: Implement `src/settings.ts`**

```ts
import type { MovementMode } from "./types";

export const STORAGE_KEY = "bullethell.movementMode";

type ReadWrite = Pick<Storage, "getItem" | "setItem">;

function isMode(value: string | null): value is MovementMode {
  return value === "digital" || value === "accelerated";
}

export function loadMode(storage: ReadWrite): MovementMode {
  const raw = storage.getItem(STORAGE_KEY);
  return isMode(raw) ? raw : "digital";
}

export function saveMode(storage: ReadWrite, mode: MovementMode): void {
  storage.setItem(STORAGE_KEY, mode);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — settings tests green.

- [ ] **Step 5: Commit**

```bash
git add src/settings.ts src/settings.test.ts
git commit -m "feat: movement-mode settings persistence"
```

---

### Task 7: Canvas renderer

**Files:**
- Create: `src/render.ts`

**Interfaces:**
- Consumes: `Cursor` from `src/movement.ts`; `ARENA`, `LOGICAL_WIDTH`, `LOGICAL_HEIGHT`, `CURSOR_SIZE` from `src/constants.ts`.
- Produces:
  - `interface Renderer { draw(cursor: Cursor): void; resize(): void }`.
  - `function createRenderer(canvas: HTMLCanvasElement): Renderer` — sets the canvas backing store to `LOGICAL_WIDTH * dpr × LOGICAL_HEIGHT * dpr`, its CSS size to `LOGICAL_WIDTH × LOGICAL_HEIGHT`, and applies a `setTransform(dpr,0,0,dpr,0,0)` so draw calls use logical coordinates. `draw` clears to black, strokes the white arena outline, and fills the white cursor square. `draw` must allocate nothing. `resize()` re-applies sizing for a new `devicePixelRatio`.

This task has no unit test (it is imperative Canvas2D drawing); it is verified visually in Task 8.

- [ ] **Step 1: Implement `src/render.ts`**

```ts
import type { Cursor } from "./movement";
import { ARENA, CURSOR_SIZE, LOGICAL_HEIGHT, LOGICAL_WIDTH } from "./constants";

export interface Renderer {
  draw(cursor: Cursor): void;
  resize(): void;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("2D canvas context unavailable");

  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(LOGICAL_WIDTH * dpr);
    canvas.height = Math.round(LOGICAL_HEIGHT * dpr);
    canvas.style.width = `${LOGICAL_WIDTH}px`;
    canvas.style.height = `${LOGICAL_HEIGHT}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  function draw(cursor: Cursor): void {
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.strokeRect(ARENA.x + 0.5, ARENA.y + 0.5, ARENA.w - 1, ARENA.h - 1);

    ctx.fillStyle = "#fff";
    ctx.fillRect(cursor.pos.x, cursor.pos.y, CURSOR_SIZE, CURSOR_SIZE);
  }

  resize();
  return { draw, resize };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/render.ts
git commit -m "feat: Canvas2D renderer for arena and cursor"
```

---

### Task 8: Bootstrap and the fixed-timestep game loop

**Files:**
- Modify: `src/main.ts`
- Modify: `index.html` (add the settings overlay markup)

**Interfaces:**
- Consumes: `createInput` (Task 5), `makeCursor`/`stepMovement` (Tasks 3-4), `createRenderer` (Task 7), `loadMode`/`saveMode` (Task 6), constants `FIXED_DT`/`MAX_FRAME_DT` (Task 2).
- Produces: the running application. No exports.

- [ ] **Step 1: Add the settings overlay to `index.html`**

Insert immediately after the `<canvas id="game"></canvas>` line:

```html
    <div id="settings" style="position: fixed; top: 8px; left: 8px; color: #aaa; font: 12px monospace;">
      <label>Movement:
        <select id="mode">
          <option value="digital">Digital (instant)</option>
          <option value="accelerated">Accelerated</option>
        </select>
      </label>
    </div>
```

- [ ] **Step 2: Implement `src/main.ts`**

```ts
import { createInput } from "./input";
import { makeCursor, stepMovement } from "./movement";
import { createRenderer } from "./render";
import { loadMode, saveMode } from "./settings";
import { FIXED_DT, MAX_FRAME_DT } from "./constants";
import type { MovementMode } from "./types";

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
if (canvas === null) throw new Error("missing #game canvas");

const modeSelect = document.getElementById("mode") as HTMLSelectElement | null;

const renderer = createRenderer(canvas);
const input = createInput(window);
const cursor = makeCursor();

let mode: MovementMode = loadMode(localStorage);
if (modeSelect !== null) {
  modeSelect.value = mode;
  modeSelect.addEventListener("change", () => {
    mode = modeSelect.value === "accelerated" ? "accelerated" : "digital";
    saveMode(localStorage, mode);
  });
}

window.addEventListener("resize", () => renderer.resize());

let last = performance.now();
let accumulator = 0;

function frame(now: number): void {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT;

  accumulator += dt;
  while (accumulator >= FIXED_DT) {
    stepMovement(cursor, input.state, FIXED_DT, mode);
    accumulator -= FIXED_DT;
  }

  renderer.draw(cursor);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
```

- [ ] **Step 3: Type-check and run the full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all tests pass.

- [ ] **Step 4: Manual verification in the Windows browser**

Run: `npm run dev`
Then open `http://localhost:5173` in the native Windows browser and confirm:
- A white square outline is centered on a black background, with a white cursor in its center.
- WASD moves the cursor; it stops dead on release in Digital mode.
- The cursor cannot leave the box on any side.
- Switching the Movement dropdown to Accelerated gives a brief ramp/glide; reloading the page preserves the selection.
- Motion is smooth with no visible stutter.

- [ ] **Step 5: Commit**

```bash
git add index.html src/main.ts
git commit -m "feat: bootstrap fixed-timestep game loop and settings UI"
```

---

## Self-Review Notes

- **Spec coverage:** WSL2/Windows-browser path (Task 1 `host: true`, Task 8 manual verify); Vite+TS+Canvas2D (Tasks 1, 7); 120 Hz fixed timestep + dt clamp + render-latest (Tasks 2, 8); zero per-frame allocation (mutating `stepMovement`, allocation-free `draw`, reused input `state`); keystate sampled per step ignoring repeats (Tasks 5, 8); pure movement model with both modes + clamping (Tasks 3, 4); white arena + clamped cursor (Tasks 7, 3); settings toggle persisted to localStorage (Tasks 6, 8); DPR scaling (Task 7); unit tests for the pure math (Tasks 3-6). All covered.
- **Type consistency:** `Cursor`, `InputState`, `MovementMode`, `stepMovement(cursor, input, dt, mode)`, `createInput(target)`, `createRenderer(canvas)`, `loadMode/saveMode(storage, ...)` are used identically across producing and consuming tasks.
- **No placeholders:** every code step contains complete code; the one intentional stub (digital==accelerated in Task 3) is explicitly replaced and tested in Task 4.
