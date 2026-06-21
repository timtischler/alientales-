# Saucer Ring Fight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new fight — saucers ride a green ring around the player and fire inward through the center (Space-Invaders shots + Galaga tractor beams) — rendered from the alien sprite sheet with a procedural fallback, and added to the fight selector.

**Architecture:** A new `src/fights/saucerRing.ts` implementing the existing `Fight`/`FightDefinition` interfaces, reusing seeded RNG, fixed-step determinism, `distancePointToSegment`/`rectsOverlap`, and `drawUfo`/`drawBeamLine`. Saucers orbit at a fixed radius and fire along the inward normal. A shared sprite-sheet loader draws the blue saucer frames when available, else the procedural saucer.

**Tech Stack:** TypeScript, Vitest, Canvas2D, a Vite-imported JPEG asset (all already in the project).

## Global Constraints

- New file `src/fights/saucerRing.ts` (+ test); registry change in `src/fights/registry.ts` (+ test). No change to `main.ts` (it builds the selector from `FIGHTS`).
- Zero per-step/per-frame allocation in `update`/`draw`: no object/array literals, no closures per call, no `new` (except the one-time sprite `Image`, guarded for the test env). The alien pool (`MAX_ALIENS = 8`) and shot pool (`MAX_SHOTS = 64`) are built once at construction.
- World: green circle outline, center `CX,CY = 400,300`, `WORLD_R = 285`. Saucers orbit at `ALIEN_R = WORLD_R - 20 = 265`. Player center = `cursor.pos + CURSOR_SIZE/2`, radius `CURSOR_SIZE/2 = 8`.
- A saucer at angle θ is at `(CX + cosθ*ALIEN_R, CY + sinθ*ALIEN_R)`; its inward normal is `(-cosθ, -sinθ)`. Both attacks fire along that inward line.
- Little shots: spawned on a seeded cadence into the shot pool, velocity `inward * shotSpeed`, despawn when distance-from-center exceeds `WORLD_R`; collide with the player via `rectsOverlap` (shot box side `2*SHOT_R`, `SHOT_R = 5`).
- Tractor beam: on a slower seeded cadence the saucer freezes orbit, telegraphs (thin line) for `telegraphTime`, fires a thick beam (`beamWidth`) along the inward normal for `beamTime` (segment from the saucer through center, length `2*ALIEN_R`), then resumes; little shots pause during telegraph/fire. Beam collides via `distancePointToSegment <= beamWidth/2 + playerRadius`. Telegraph does not damage.
- Volley = one tractor fire (`firedVolleys++` on telegraph→fire). New tractor volleys stop once `firedVolleys >= volleys`. **Win** when `firedVolleys >= volleys` and no saucer is telegraphing/firing.
- Config order in params: `seed, volleys, alienCount, orbitSpeed, shotGapMin, shotGapMax, shotSpeed, tractorGapMin, tractorGapMax, telegraphTime, beamTime, beamWidth`. Defaults: seed 2025, volleys 16, alienCount 3, orbitSpeed 0.5, shotGapMin 0.8, shotGapMax 1.8, shotSpeed 150, tractorGapMin 3, tractorGapMax 6, telegraphTime 0.6, beamTime 0.4, beamWidth 24.
- Determinism: at `reset()` each active saucer is seeded in index order (angle, shotTimer, tractorTimer); spawns/re-arms draw on the fixed-step timeline; `reset()` reseeds.
- TypeScript strict; full suite green; `npm run build` succeeds.

---

### Task 1: Saucer Ring core simulation + definition (procedural saucers)

**Files:**
- Create: `src/fights/saucerRing.ts`
- Test: `src/fights/saucerRing.test.ts`

**Interfaces:**
- Consumes: `createRng`; `rectsOverlap`, `distancePointToSegment`; `ARENA`, `CURSOR_SIZE`; `Cursor`, `makeCursor`; `Fight`, `FightStatus`, `FightDefinition`, `FightParam`; `drawUfo`, `drawBeamLine`.
- Produces: `SaucerRingConfig`, `DEFAULT_SAUCER_RING`, `createSaucerRing(cfg): Fight`, `SAUCER_RING: FightDefinition<SaucerRingConfig>`. `draw` uses the procedural `drawUfo` (sprites added in Task 2).

- [ ] **Step 1: Write the failing tests**

```ts
// src/fights/saucerRing.test.ts
import { describe, it, expect } from "vitest";
import { createSaucerRing, DEFAULT_SAUCER_RING, SAUCER_RING } from "./saucerRing";
import { makeCursor } from "../movement";
import type { Cursor } from "../movement";
import type { FightStatus } from "./types";

function runUntilDone(
  fight: { update: (p: Cursor, dt: number) => FightStatus },
  player: Cursor,
  maxSteps: number,
): { status: FightStatus; step: number } {
  for (let i = 0; i < maxSteps; i++) {
    const s = fight.update(player, 1 / 120);
    if (s !== "running") return { status: s, step: i };
  }
  return { status: "running", step: maxSteps };
}

// drawUfo draws one dome fillRect at fillStyle "#cfe8ff"; count those to count saucers.
function countSaucers(fight: { draw: (ctx: CanvasRenderingContext2D) => void }): number {
  let domes = 0;
  let fill = "";
  const ctx = {
    set fillStyle(v: string) { fill = v; },
    get fillStyle() { return fill; },
    strokeStyle: "", lineWidth: 0, globalAlpha: 1, lineCap: "",
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
    arc() {}, fill() {}, stroke() {},
    fillRect() { if (fill === "#cfe8ff") domes++; },
  } as unknown as CanvasRenderingContext2D;
  fight.draw(ctx);
  return domes;
}

const SHOT_LOSS = {
  ...DEFAULT_SAUCER_RING,
  alienCount: 1, volleys: 5,
  tractorGapMin: 999, tractorGapMax: 999, // no tractor
  shotGapMin: 0, shotGapMax: 0, shotSpeed: 400,
};

describe("SaucerRing loss by little shot", () => {
  it("kills a stationary centered player with an inward shot", () => {
    const fight = createSaucerRing({ ...SHOT_LOSS });
    expect(runUntilDone(fight, makeCursor(), 300).status).toBe("lost");
  });
  it("is deterministic: same seed kills at the same step", () => {
    const a = createSaucerRing({ ...SHOT_LOSS });
    const b = createSaucerRing({ ...SHOT_LOSS });
    expect(runUntilDone(a, makeCursor(), 300)).toEqual(runUntilDone(b, makeCursor(), 300));
  });
});

describe("SaucerRing loss by tractor beam", () => {
  it("kills a stationary centered player with the inward beam", () => {
    const fight = createSaucerRing({
      ...DEFAULT_SAUCER_RING,
      alienCount: 1, volleys: 2,
      shotGapMin: 999, shotGapMax: 999, // no shots
      tractorGapMin: 0, tractorGapMax: 0,
      telegraphTime: 0.2, beamTime: 0.3,
    });
    expect(runUntilDone(fight, makeCursor(), 200).status).toBe("lost");
  });
});

describe("SaucerRing win", () => {
  it("wins quickly with zero volleys and no shots", () => {
    const fight = createSaucerRing({
      ...DEFAULT_SAUCER_RING,
      alienCount: 1, volleys: 0,
      shotGapMin: 999, shotGapMax: 999,
    });
    expect(runUntilDone(fight, makeCursor(), 50).status).toBe("won");
  });
});

describe("SaucerRing saucer count", () => {
  it("draws one saucer per alien", () => {
    const player = makeCursor();
    const one = createSaucerRing({ ...DEFAULT_SAUCER_RING, alienCount: 1, volleys: 0, shotGapMin: 999, shotGapMax: 999 });
    const three = createSaucerRing({ ...DEFAULT_SAUCER_RING, alienCount: 3, volleys: 0, shotGapMin: 999, shotGapMax: 999 });
    for (let i = 0; i < 5; i++) { one.update(player, 1 / 120); three.update(player, 1 / 120); }
    expect(countSaucers(one)).toBe(1);
    expect(countSaucers(three)).toBe(3);
  });
});

describe("SAUCER_RING definition", () => {
  it("exposes the tunable params, all numeric fields of the defaults", () => {
    expect(SAUCER_RING.name).toBe("Saucer Ring");
    expect(SAUCER_RING.defaults).toBe(DEFAULT_SAUCER_RING);
    expect(SAUCER_RING.params.map((p) => p.key)).toEqual([
      "seed", "volleys", "alienCount", "orbitSpeed", "shotGapMin", "shotGapMax",
      "shotSpeed", "tractorGapMin", "tractorGapMax", "telegraphTime", "beamTime", "beamWidth",
    ]);
    for (const p of SAUCER_RING.params) {
      expect(typeof (DEFAULT_SAUCER_RING as unknown as Record<string, unknown>)[p.key]).toBe("number");
    }
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL — module/exports not defined.

- [ ] **Step 3: Implement `src/fights/saucerRing.ts`**

```ts
import { createRng } from "../rng";
import { rectsOverlap, distancePointToSegment } from "../collision";
import { ARENA, CURSOR_SIZE } from "../constants";
import type { Cursor } from "../movement";
import type { Fight, FightStatus, FightDefinition, FightParam } from "./types";
import { drawUfo, drawBeamLine } from "../sprites";

export interface SaucerRingConfig {
  seed: number;
  volleys: number;
  alienCount: number;
  orbitSpeed: number;
  shotGapMin: number;
  shotGapMax: number;
  shotSpeed: number;
  tractorGapMin: number;
  tractorGapMax: number;
  telegraphTime: number;
  beamTime: number;
  beamWidth: number;
}

export const DEFAULT_SAUCER_RING: SaucerRingConfig = {
  seed: 2025,
  volleys: 16,
  alienCount: 3,
  orbitSpeed: 0.5,
  shotGapMin: 0.8,
  shotGapMax: 1.8,
  shotSpeed: 150,
  tractorGapMin: 3,
  tractorGapMax: 6,
  telegraphTime: 0.6,
  beamTime: 0.4,
  beamWidth: 24,
};

const CX = ARENA.x + ARENA.w / 2;
const CY = ARENA.y + ARENA.h / 2;
const WORLD_R = 285;
const ALIEN_R = WORLD_R - 20;
const PLAYER_R = CURSOR_SIZE / 2;
const UFO_W = 40;
const UFO_H = 16;
const SHOT_R = 5;
const MAX_ALIENS = 8;
const MAX_SHOTS = 64;

const PHASE_ORBIT = 0;
const PHASE_TELEGRAPH = 1;
const PHASE_FIRE = 2;

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
}

function makeAlien(): Alien {
  return { angle: 0, x: 0, y: 0, idx: 0, idy: 0, shotTimer: 0, tractorTimer: 0, phase: PHASE_ORBIT, stateTimer: 0 };
}

interface Shot {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function makeShot(): Shot {
  return { active: false, x: 0, y: 0, vx: 0, vy: 0 };
}

export function createSaucerRing(cfg: SaucerRingConfig): Fight {
  const rng = createRng(cfg.seed);

  const aliens: Alien[] = [];
  for (let i = 0; i < MAX_ALIENS; i++) aliens.push(makeAlien());
  let activeAliens = 0;

  const shots: Shot[] = [];
  for (let i = 0; i < MAX_SHOTS; i++) shots.push(makeShot());

  let firedVolleys = 0;

  function gap(min: number, max: number): number {
    return min + rng.next() * (max - min);
  }

  function freeShot(): number {
    for (let i = 0; i < MAX_SHOTS; i++) if (!shots[i].active) return i;
    return -1;
  }

  function reset(): void {
    rng.reseed(cfg.seed);
    firedVolleys = 0;
    activeAliens = Math.min(cfg.alienCount, MAX_ALIENS);
    for (let i = 0; i < activeAliens; i++) {
      const a = aliens[i];
      a.angle = rng.next() * Math.PI * 2;
      a.shotTimer = gap(cfg.shotGapMin, cfg.shotGapMax);
      a.tractorTimer = gap(cfg.tractorGapMin, cfg.tractorGapMax);
      a.phase = PHASE_ORBIT;
      a.stateTimer = 0;
    }
    for (let i = 0; i < MAX_SHOTS; i++) shots[i].active = false;
  }

  reset();

  function update(player: Cursor, dt: number): FightStatus {
    const pcx = player.pos.x + CURSOR_SIZE / 2;
    const pcy = player.pos.y + CURSOR_SIZE / 2;

    let anyBusy = false;
    for (let i = 0; i < activeAliens; i++) {
      const a = aliens[i];

      if (a.phase === PHASE_ORBIT) a.angle += cfg.orbitSpeed * dt;
      const ca = Math.cos(a.angle);
      const sa = Math.sin(a.angle);
      a.x = CX + ca * ALIEN_R;
      a.y = CY + sa * ALIEN_R;
      a.idx = -ca;
      a.idy = -sa;

      if (a.phase === PHASE_ORBIT) {
        a.shotTimer -= dt;
        if (a.shotTimer <= 0) {
          const j = freeShot();
          if (j >= 0) {
            const s = shots[j];
            s.active = true;
            s.x = a.x;
            s.y = a.y;
            s.vx = a.idx * cfg.shotSpeed;
            s.vy = a.idy * cfg.shotSpeed;
          }
          a.shotTimer += gap(cfg.shotGapMin, cfg.shotGapMax);
        }
        a.tractorTimer -= dt;
        if (a.tractorTimer <= 0 && firedVolleys < cfg.volleys) {
          a.phase = PHASE_TELEGRAPH;
          a.stateTimer = 0;
        }
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
    }

    for (let i = 0; i < MAX_SHOTS; i++) {
      const s = shots[i];
      if (!s.active) continue;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const ddx = s.x - CX;
      const ddy = s.y - CY;
      if (ddx * ddx + ddy * ddy > WORLD_R * WORLD_R) {
        s.active = false;
        continue;
      }
      if (rectsOverlap(player.pos.x, player.pos.y, CURSOR_SIZE, CURSOR_SIZE,
        s.x - SHOT_R, s.y - SHOT_R, SHOT_R * 2, SHOT_R * 2)) {
        return "lost";
      }
    }

    if (firedVolleys >= cfg.volleys && !anyBusy) return "won";
    return "running";
  }

  function draw(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = "#3ddc52";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(CX, CY, WORLD_R, 0, Math.PI * 2);
    ctx.stroke();

    for (let i = 0; i < activeAliens; i++) {
      const a = aliens[i];
      const ex = a.x + a.idx * 2 * ALIEN_R;
      const ey = a.y + a.idy * 2 * ALIEN_R;
      if (a.phase === PHASE_TELEGRAPH) {
        drawBeamLine(ctx, a.x, a.y, ex, ey, 3, "#ff5cf0", 0.5);
      } else if (a.phase === PHASE_FIRE) {
        drawBeamLine(ctx, a.x, a.y, ex, ey, cfg.beamWidth, "#ff3b6b", 0.85);
      }
      drawUfo(ctx, a.x - UFO_W / 2, a.y - UFO_H / 2, UFO_W, UFO_H, "#40c4ff");
    }

    for (let i = 0; i < MAX_SHOTS; i++) {
      const s = shots[i];
      if (!s.active) continue;
      ctx.fillStyle = "#ffe14d";
      ctx.beginPath();
      ctx.arc(s.x, s.y, SHOT_R, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return { update, draw, reset };
}

const SAUCER_RING_PARAMS: readonly FightParam[] = [
  { key: "seed", label: "Seed", kind: "seed", min: 0, max: 999999, step: 1 },
  { key: "volleys", label: "Volleys", kind: "int", min: 0, max: 200, step: 1 },
  { key: "alienCount", label: "Saucers", kind: "int", min: 1, max: 8, step: 1 },
  { key: "orbitSpeed", label: "Orbit speed", kind: "float", min: 0.1, max: 3, step: 0.1 },
  { key: "shotGapMin", label: "Shot gap min (s)", kind: "float", min: 0, max: 5, step: 0.1 },
  { key: "shotGapMax", label: "Shot gap max (s)", kind: "float", min: 0, max: 5, step: 0.1 },
  { key: "shotSpeed", label: "Shot speed", kind: "float", min: 20, max: 500, step: 10 },
  { key: "tractorGapMin", label: "Tractor gap min (s)", kind: "float", min: 0, max: 12, step: 0.5 },
  { key: "tractorGapMax", label: "Tractor gap max (s)", kind: "float", min: 0, max: 12, step: 0.5 },
  { key: "telegraphTime", label: "Telegraph (s)", kind: "float", min: 0.1, max: 2, step: 0.05 },
  { key: "beamTime", label: "Beam (s)", kind: "float", min: 0.1, max: 1.5, step: 0.05 },
  { key: "beamWidth", label: "Beam width", kind: "float", min: 6, max: 80, step: 2 },
];

export const SAUCER_RING: FightDefinition<SaucerRingConfig> = {
  name: "Saucer Ring",
  params: SAUCER_RING_PARAMS,
  defaults: DEFAULT_SAUCER_RING,
  create: (config) => createSaucerRing(config),
};
```

- [ ] **Step 4: Run tests + type-check**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all SaucerRing tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/fights/saucerRing.ts src/fights/saucerRing.test.ts
git commit -m "feat: Saucer Ring fight — orbiting saucers firing inward (shots + tractor)"
```

---

### Task 2: Sprite-sheet saucer rendering (with fallback)

**Files:**
- Modify: `src/fights/saucerRing.ts`

**Interfaces:**
- Consumes: the alien sprite sheet at `images/alien_sprite.jpeg` (imported as a Vite asset URL); everything from Task 1.
- Produces: no new exports. Saucers render from the sheet's blue-saucer frames (animated) when the image is loaded; otherwise the existing `drawUfo` fallback. The unit tests run in node where `Image` is undefined, so they always exercise the fallback (the saucer-count test stays valid).

- [ ] **Step 1: Add the sprite loader, frames, and animation to `src/fights/saucerRing.ts`**

Add the asset import at the top (after the existing imports):

```ts
import alienSpriteUrl from "../../images/alien_sprite.jpeg";
```

Add, near the other module constants:

```ts
// Blue/orange saucer (top sprite row, third group of three frames) on the
// 1024x559 sheet. Starting cell coordinates from the grid (cols ~83px, rows
// ~94px under an ~84px title/header band); fine-tune live so each cell centers.
const SAUCER_FRAMES: readonly { sx: number; sy: number; sw: number; sh: number }[] = [
  { sx: 518, sy: 84, sw: 84, sh: 94 },
  { sx: 601, sy: 84, sw: 84, sh: 94 },
  { sx: 685, sy: 84, sw: 84, sh: 94 },
];
const FRAME_DUR = 0.18;
const SAUCER_DRAW_W = 46;
const SAUCER_DRAW_H = 34;

// One shared sheet image for all instances. Guarded so node/test envs (no DOM)
// fall back to the procedural saucer.
let sheet: HTMLImageElement | null = null;
let sheetReady = false;
if (typeof Image !== "undefined") {
  sheet = new Image();
  sheet.onload = () => {
    sheetReady = true;
  };
  sheet.src = alienSpriteUrl;
}
```

Add an `animClock` to the fight state (inside `createSaucerRing`, next to `firedVolleys`):

```ts
  let animClock = 0;
```

Advance it at the very top of `update` (after computing `pcx/pcy`):

```ts
    animClock += dt;
```

Replace the `drawUfo(...)` call inside `draw` with a sprite-or-fallback draw:

```ts
      if (sheetReady && sheet !== null) {
        const f = SAUCER_FRAMES[Math.floor(animClock / FRAME_DUR) % SAUCER_FRAMES.length];
        ctx.drawImage(sheet, f.sx, f.sy, f.sw, f.sh,
          a.x - SAUCER_DRAW_W / 2, a.y - SAUCER_DRAW_H / 2, SAUCER_DRAW_W, SAUCER_DRAW_H);
      } else {
        drawUfo(ctx, a.x - UFO_W / 2, a.y - UFO_H / 2, UFO_W, UFO_H, "#40c4ff");
      }
```

- [ ] **Step 2: Type-check and run the suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all tests still pass (node has no `Image`, so the saucer-count test still hits the `drawUfo` fallback and counts domes).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds (Vite bundles the imported JPEG asset).

- [ ] **Step 4: Commit**

```bash
git add src/fights/saucerRing.ts
git commit -m "feat: render saucers from the alien sprite sheet with procedural fallback"
```

- [ ] **Step 5: Note for live tuning**

The `SAUCER_FRAMES` coordinates are starting estimates. They will be nudged during the final manual browser verification so each frame cell is centered on the blue saucer (adjust `sx/sy/sw/sh`; `SAUCER_DRAW_W/H` set the on-screen size).

---

### Task 3: Add Saucer Ring to the fight registry

**Files:**
- Modify: `src/fights/registry.ts`
- Test: `src/fights/registry.test.ts`

**Interfaces:**
- Consumes: `SAUCER_RING` (Task 1).
- Produces: `FIGHTS` now lists three fights; the selector picks it up automatically.

- [ ] **Step 1: Update the registry test**

Replace the names assertion in `src/fights/registry.test.ts` so it expects all three fights:

```ts
  it("lists all fights by name", () => {
    expect(FIGHTS.map((f) => f.name)).toEqual(["UFO Invasion", "Eye Beams", "Saucer Ring"]);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `FIGHTS` does not yet include "Saucer Ring".

- [ ] **Step 3: Update `src/fights/registry.ts`**

```ts
import type { FightDefinition } from "./types";
import { UFO_INVASION } from "./ufoInvasion";
import { EYE_BEAMS } from "./eyeBeams";
import { SAUCER_RING } from "./saucerRing";

export const FIGHTS: readonly FightDefinition<unknown>[] = [UFO_INVASION, EYE_BEAMS, SAUCER_RING];
```

- [ ] **Step 4: Run tests, type-check, build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: no type errors; all tests pass; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/fights/registry.ts src/fights/registry.test.ts
git commit -m "feat: add Saucer Ring to the fight registry"
```

- [ ] **Step 6: Manual verification in the Windows browser**

Run: `npm run dev` (leave running), open `http://localhost:5173`, select **Saucer Ring**, and confirm:
- A green ring outlines the world; **3 saucers** (sprite-sheet blue saucers, animating) ride the ring.
- Saucers **plink little yellow shots inward through the center** on a cadence; you dodge them in the box.
- Saucers occasionally **telegraph then fire a thick beam inward through the center** (Galaga); you slide off the line.
- Sitting dead-center is dangerous (everything converges there); win after surviving the tractor volleys.
- If sprites look off-center, nudge `SAUCER_FRAMES` coordinates (and `SAUCER_DRAW_W/H`) until each blue saucer is framed cleanly.
- The fight dropdown lists UFO Invasion, Eye Beams, and Saucer Ring; switching works and config persists.

---

## Self-Review Notes

- **Spec coverage:** green world circle outline (Task 1 draw); `alienCount` saucers orbiting at `ALIEN_R` firing inward (Task 1); little shots pool firing through center + despawn + collision (Task 1); tractor telegraph/fire along inward normal + collision (Task 1); win on volleys with no busy saucer (Task 1); sprite-sheet rendering with fallback + animation (Task 2); registry/selector (Task 3); determinism (per-saucer seed order; `reset` reseeds). All covered.
- **Type consistency:** `SaucerRingConfig`, `createSaucerRing`, `DEFAULT_SAUCER_RING`, `SAUCER_RING`, params list — consistent between impl and tests (definition test asserts the exact key list; saucer-count test asserts `alienCount` domes via the fallback).
- **No placeholders:** complete code; `SAUCER_FRAMES` are concrete starting coordinates with an explicit live-tune step (not a placeholder — real numbers).
- **Allocation:** alien + shot pools built once; the single sprite `Image` is created once at module load (guarded for node); `update`/`draw` use scalars, references, in-place mutation — no per-call literals/closures.
- **Test-env safety:** `typeof Image !== "undefined"` guard means `createSaucerRing` and `draw` never touch DOM APIs under Vitest (node); the asset import resolves to a URL string via Vite.
