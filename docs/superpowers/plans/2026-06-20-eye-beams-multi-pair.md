# Eye Beams Multiple Pairs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize Eye Beams from one mirrored eye pair to N independent pairs, with a configurable `pairCount` (default 4) alongside `smallCount`.

**Architecture:** A single rewrite of `src/fights/eyeBeams.ts`. Replace the module-level single-orbiter state with a pre-allocated pool of `Pair` structs, each owning its own orbit/volley state and two rendered eyes (driver + mirror). `update`/`draw` loop over the active pairs; each pair fires independently with its own random aim-driver coin.

**Tech Stack:** TypeScript, Vitest, Canvas2D (all already in the project).

## Global Constraints

- One file changes: `src/fights/eyeBeams.ts` (+ its test). Other modules consume `EYE_BEAMS` generically and need no changes.
- Zero per-step/per-frame allocation in `update`/`draw`: no object/array literals, no closures created per call, no `new`. The pair pool (`MAX_PAIRS = 8`) and small pool (`MAX_SMALL = 64`) are built once at construction; helper functions are defined once per factory call.
- Each `Pair` owns `phaseAngle`, `radiusPhase`, `fireTimer`, `phase`, `stateTimer`, and two `Eye` render states (`driver`, `mirror`). `reset()` activates `activePairs = min(cfg.pairCount, MAX_PAIRS)`.
- Within a pair: `mirror` is `driver` reflected across the vertical center line `x = CX` (CX=400): position `(2*CX - x, y)`; the pair shares one phase driven by the orbiter (`driver`). Each pair is clamped outside the box via `minR = 1 / max(|cosθ|/BOX_HALF_X, |sinθ|/BOX_HALF_Y)`, `BOX_HALF_X/Y = ARENA.w|h/2 + EYE_R + 6`. No eye-body collision.
- Per volley, per pair: a seeded `rng.next() < 0.5` at telegraph lock picks which eye targets the player; the partner's aim is the reflection `(-aimDx, aimDy)`. Telegraph does not damage; only PHASE_FIRE collides, on both eyes of that pair.
- A volley = one pair-fire (`firedVolleys++` on any pair's telegraph→fire). New volleys (and small spawns) stop once `firedVolleys >= cfg.volleys`. **Win** when `firedVolleys >= cfg.volleys` and no pair is in telegraph or fire.
- Config: add `pairCount` (default 4); keep `smallCount` (default 6); other defaults unchanged. `EYE_BEAMS.params` order: `seed, volleys, pairCount, orbitSpeed, telegraphTime, beamTime, beamWidth, eyeFireGapMin, eyeFireGapMax, smallSpeed, smallCount`.
- Determinism: at reset, pairs are seeded in index order (each: phaseAngle, radiusPhase, fireTimer), then the small spawn timer; each volley draws one coin at that pair's lock; `reset()` reseeds. Aiming/homing use live player position.
- TypeScript strict; full suite green; `npm run build` succeeds.

---

### Task 1: Rewrite Eye Beams for N independent pairs

**Files:**
- Modify (full replace): `src/fights/eyeBeams.ts`
- Modify (full replace): `src/fights/eyeBeams.test.ts`

**Interfaces:**
- Consumes: `createRng`; `rectsOverlap`, `distancePointToSegment`; `ARENA`, `CURSOR_SIZE`; `Cursor`, `makeCursor`; `Fight`, `FightStatus`, `FightDefinition`, `FightParam`; `drawEye`, `drawSmallEye`, `drawBeamLine`.
- Produces (unchanged surface, changed config): `createEyeBeams`, `DEFAULT_EYE_BEAMS`, `EYE_BEAMS`, `EyeBeamsConfig`. `EyeBeamsConfig` gains `pairCount`.

- [ ] **Step 1: Replace the test file `src/fights/eyeBeams.test.ts`**

```ts
// src/fights/eyeBeams.test.ts
import { describe, it, expect } from "vitest";
import { createEyeBeams, DEFAULT_EYE_BEAMS, EYE_BEAMS } from "./eyeBeams";
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

// Counts large-eye scleras (drawn at radius EYE_R = 22) via the public draw surface.
function countBigEyes(fight: { draw: (ctx: CanvasRenderingContext2D) => void }): number {
  let big = 0;
  const ctx = {
    fillStyle: "", strokeStyle: "", lineWidth: 0, globalAlpha: 1, lineCap: "",
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
    arc(_x: number, _y: number, r: number) { if (r === 22) big++; },
    fill() {}, stroke() {}, fillRect() {},
  } as unknown as CanvasRenderingContext2D;
  fight.draw(ctx);
  return big;
}

const LOSS_CFG = {
  ...DEFAULT_EYE_BEAMS,
  volleys: 2, pairCount: 1,
  telegraphTime: 0.2, beamTime: 0.3, beamWidth: 26,
  eyeFireGapMin: 0, eyeFireGapMax: 0,
  orbitRadius: 220, orbitRadiusAmp: 0,
  smallSpawnGapMin: 999, smallSpawnGapMax: 999,
};

describe("EyeBeams loss by aimed beam", () => {
  it("kills a stationary player with a locked beam", () => {
    const fight = createEyeBeams({ ...LOSS_CFG });
    expect(runUntilDone(fight, makeCursor(), 400).status).toBe("lost");
  });

  it("is deterministic: same seed kills at the same step", () => {
    const a = createEyeBeams({ ...LOSS_CFG });
    const b = createEyeBeams({ ...LOSS_CFG });
    expect(runUntilDone(a, makeCursor(), 400)).toEqual(runUntilDone(b, makeCursor(), 400));
  });
});

describe("EyeBeams win", () => {
  it("wins quickly with zero volleys", () => {
    const fight = createEyeBeams({ ...DEFAULT_EYE_BEAMS, volleys: 0 });
    expect(runUntilDone(fight, makeCursor(), 100).status).toBe("won");
  });
});

describe("EyeBeams small homing eyes", () => {
  it("a homing small eye kills a stationary player", () => {
    const fight = createEyeBeams({
      ...DEFAULT_EYE_BEAMS,
      volleys: 5,
      eyeFireGapMin: 999, eyeFireGapMax: 999,
      smallSpawnGapMin: 0, smallSpawnGapMax: 0,
      smallSpeed: 120, smallLifetime: 30,
    });
    expect(runUntilDone(fight, makeCursor(), 1000).status).toBe("lost");
  });

  it("never exceeds smallCount active small eyes", () => {
    const fight = createEyeBeams({
      ...DEFAULT_EYE_BEAMS,
      volleys: 50, smallCount: 3,
      eyeFireGapMin: 999, eyeFireGapMax: 999, // no beams
      orbitRadius: 400, orbitRadiusAmp: 0,    // eyes far outside the box
      smallSpawnGapMin: 0, smallSpawnGapMax: 0, // spawn aggressively
      smallSpeed: 0, smallLifetime: 999,       // eyes sit still, never expire
    });
    const player = makeCursor();
    for (let i = 0; i < 50; i++) fight.update(player, 1 / 120);

    // Small eyes draw their sclera at radius SMALL_R (7).
    let smallEyes = 0;
    const ctx = {
      fillStyle: "", strokeStyle: "", lineWidth: 0, globalAlpha: 1, lineCap: "",
      save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
      arc(_x: number, _y: number, r: number) { if (r === 7) smallEyes++; },
      fill() {}, stroke() {}, fillRect() {},
    } as unknown as CanvasRenderingContext2D;
    fight.draw(ctx);
    expect(smallEyes).toBeLessThanOrEqual(3);
    expect(smallEyes).toBe(3); // reaches the cap
  });
});

describe("EyeBeams pairs", () => {
  it("draws two large eyes per active pair", () => {
    const player = makeCursor();
    const one = createEyeBeams({ ...DEFAULT_EYE_BEAMS, volleys: 0, smallCount: 0, pairCount: 1 });
    const three = createEyeBeams({ ...DEFAULT_EYE_BEAMS, volleys: 0, smallCount: 0, pairCount: 3 });
    for (let i = 0; i < 10; i++) {
      one.update(player, 1 / 120);
      three.update(player, 1 / 120);
    }
    expect(countBigEyes(one)).toBe(2);
    expect(countBigEyes(three)).toBe(6);
  });
});

describe("EYE_BEAMS definition", () => {
  it("exposes the tunable params, all numeric fields of the defaults", () => {
    expect(EYE_BEAMS.name).toBe("Eye Beams");
    expect(EYE_BEAMS.defaults).toBe(DEFAULT_EYE_BEAMS);
    expect(EYE_BEAMS.params.map((p) => p.key)).toEqual([
      "seed", "volleys", "pairCount", "orbitSpeed", "telegraphTime", "beamTime",
      "beamWidth", "eyeFireGapMin", "eyeFireGapMax", "smallSpeed", "smallCount",
    ]);
    for (const p of EYE_BEAMS.params) {
      expect(typeof (DEFAULT_EYE_BEAMS as unknown as Record<string, unknown>)[p.key]).toBe("number");
    }
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail (RED)**

Run: `npm test`
Expected: FAIL — current config has no `pairCount` (new test configs / definition list don't match), and the pairs test expects multiple eyes the single-pair impl can't produce.

- [ ] **Step 3: Replace `src/fights/eyeBeams.ts` entirely**

```ts
import { createRng } from "../rng";
import { rectsOverlap, distancePointToSegment } from "../collision";
import { ARENA, CURSOR_SIZE } from "../constants";
import type { Cursor } from "../movement";
import type { Fight, FightStatus, FightDefinition, FightParam } from "./types";
import { drawEye, drawSmallEye, drawBeamLine } from "../sprites";

export interface EyeBeamsConfig {
  seed: number;
  volleys: number;
  pairCount: number;
  orbitSpeed: number;
  orbitRadius: number;
  orbitRadiusAmp: number;
  telegraphTime: number;
  beamTime: number;
  beamWidth: number;
  eyeFireGapMin: number;
  eyeFireGapMax: number;
  smallSpawnGapMin: number;
  smallSpawnGapMax: number;
  smallSpeed: number;
  smallLifetime: number;
  smallCount: number;
}

export const DEFAULT_EYE_BEAMS: EyeBeamsConfig = {
  seed: 2024,
  volleys: 20,
  pairCount: 4,
  orbitSpeed: 0.7,
  orbitRadius: 250,
  orbitRadiusAmp: 70,
  telegraphTime: 0.7,
  beamTime: 0.35,
  beamWidth: 26,
  eyeFireGapMin: 1.6,
  eyeFireGapMax: 3.2,
  smallSpawnGapMin: 1.2,
  smallSpawnGapMax: 2.6,
  smallSpeed: 65,
  smallLifetime: 6,
  smallCount: 6,
};

const CX = ARENA.x + ARENA.w / 2;
const CY = ARENA.y + ARENA.h / 2;
const EYE_R = 22;
const BEAM_LEN = 1200;
const RADIUS_OSC_SPEED = 0.9;
const PLAYER_R = CURSOR_SIZE / 2;
const BOX_HALF_X = ARENA.w / 2 + EYE_R + 6;
const BOX_HALF_Y = ARENA.h / 2 + EYE_R + 6;

const PHASE_ORBIT = 0;
const PHASE_TELEGRAPH = 1;
const PHASE_FIRE = 2;

const MAX_PAIRS = 8;
const MAX_SMALL = 64;
const SMALL_R = 7;
const SMALL_SPAWN_RADIUS = 280;

// A rendered eye: position, pupil look, locked beam direction.
interface Eye {
  x: number;
  y: number;
  lookDx: number;
  lookDy: number;
  aimDx: number;
  aimDy: number;
}

function makeEyeState(): Eye {
  return { x: 0, y: 0, lookDx: 0, lookDy: 1, aimDx: 0, aimDy: 1 };
}

// A mirrored pair with its own orbit + volley state.
interface Pair {
  phaseAngle: number;
  radiusPhase: number;
  fireTimer: number;
  phase: number;
  stateTimer: number;
  driver: Eye;
  mirror: Eye;
}

function makePair(): Pair {
  return {
    phaseAngle: 0, radiusPhase: 0, fireTimer: 0, phase: PHASE_ORBIT, stateTimer: 0,
    driver: makeEyeState(), mirror: makeEyeState(),
  };
}

interface SmallEye {
  active: boolean;
  x: number;
  y: number;
  life: number;
}

function makeSmall(): SmallEye {
  return { active: false, x: 0, y: 0, life: 0 };
}

export function createEyeBeams(cfg: EyeBeamsConfig): Fight {
  const rng = createRng(cfg.seed);

  const pairs: Pair[] = [];
  for (let i = 0; i < MAX_PAIRS; i++) pairs.push(makePair());
  let activePairs = 0;

  const smalls: SmallEye[] = [];
  for (let i = 0; i < MAX_SMALL; i++) smalls.push(makeSmall());
  let smallSpawnTimer = 0;
  let firedVolleys = 0;

  function gap(min: number, max: number): number {
    return min + rng.next() * (max - min);
  }

  function freeSmall(): number {
    for (let i = 0; i < MAX_SMALL; i++) if (!smalls[i].active) return i;
    return -1;
  }

  function activeSmallCount(): number {
    let n = 0;
    for (let i = 0; i < MAX_SMALL; i++) if (smalls[i].active) n++;
    return n;
  }

  function resetEye(e: Eye): void {
    e.x = 0;
    e.y = 0;
    e.lookDx = 0;
    e.lookDy = 1;
    e.aimDx = 0;
    e.aimDy = 1;
  }

  function reset(): void {
    rng.reseed(cfg.seed);
    firedVolleys = 0;
    activePairs = Math.min(cfg.pairCount, MAX_PAIRS);
    for (let i = 0; i < activePairs; i++) {
      const p = pairs[i];
      p.phaseAngle = rng.next() * Math.PI * 2;
      p.radiusPhase = rng.next() * Math.PI * 2;
      p.fireTimer = gap(cfg.eyeFireGapMin, cfg.eyeFireGapMax);
      p.phase = PHASE_ORBIT;
      p.stateTimer = 0;
      resetEye(p.driver);
      resetEye(p.mirror);
    }
    for (let i = 0; i < MAX_SMALL; i++) smalls[i].active = false;
    smallSpawnTimer = gap(cfg.smallSpawnGapMin, cfg.smallSpawnGapMax);
  }

  reset();

  function beamHits(e: Eye, pcx: number, pcy: number): boolean {
    const ex = e.x + e.aimDx * BEAM_LEN;
    const ey = e.y + e.aimDy * BEAM_LEN;
    return distancePointToSegment(pcx, pcy, e.x, e.y, ex, ey) <= cfg.beamWidth / 2 + PLAYER_R;
  }

  function update(player: Cursor, dt: number): FightStatus {
    const pcx = player.pos.x + CURSOR_SIZE / 2;
    const pcy = player.pos.y + CURSOR_SIZE / 2;

    let anyBusy = false;
    for (let pi = 0; pi < activePairs; pi++) {
      const p = pairs[pi];
      const driver = p.driver;
      const mirror = p.mirror;

      // Orbit (frozen during telegraph + fire) and clamp outside the box.
      if (p.phase === PHASE_ORBIT) {
        p.phaseAngle += cfg.orbitSpeed * dt;
        p.radiusPhase += RADIUS_OSC_SPEED * dt;
      }
      const ca = Math.cos(p.phaseAngle);
      const sa = Math.sin(p.phaseAngle);
      let r = cfg.orbitRadius + cfg.orbitRadiusAmp * Math.sin(p.radiusPhase);
      const minR = 1 / Math.max(Math.abs(ca) / BOX_HALF_X, Math.abs(sa) / BOX_HALF_Y);
      if (r < minR) r = minR;
      driver.x = CX + ca * r;
      driver.y = CY + sa * r;
      mirror.x = 2 * CX - driver.x;
      mirror.y = driver.y;

      // Pupils track the player (each eye independently).
      const dlx = pcx - driver.x;
      const dly = pcy - driver.y;
      const dll = Math.hypot(dlx, dly) || 1;
      driver.lookDx = dlx / dll;
      driver.lookDy = dly / dll;
      const mlx = pcx - mirror.x;
      const mly = pcy - mirror.y;
      const mll = Math.hypot(mlx, mly) || 1;
      mirror.lookDx = mlx / mll;
      mirror.lookDy = mly / mll;

      // Volley state machine (per pair).
      if (p.phase === PHASE_ORBIT) {
        p.fireTimer -= dt;
        if (p.fireTimer <= 0 && firedVolleys < cfg.volleys) {
          const aimEye = rng.next() < 0.5 ? driver : mirror;
          const partner = aimEye === driver ? mirror : driver;
          const adx = pcx - aimEye.x;
          const ady = pcy - aimEye.y;
          const al = Math.hypot(adx, ady) || 1;
          aimEye.aimDx = adx / al;
          aimEye.aimDy = ady / al;
          partner.aimDx = -aimEye.aimDx;
          partner.aimDy = aimEye.aimDy;
          p.phase = PHASE_TELEGRAPH;
          p.stateTimer = 0;
        }
      } else if (p.phase === PHASE_TELEGRAPH) {
        anyBusy = true;
        p.stateTimer += dt;
        if (p.stateTimer >= cfg.telegraphTime) {
          p.phase = PHASE_FIRE;
          p.stateTimer = 0;
          firedVolleys++;
        }
      } else {
        anyBusy = true;
        p.stateTimer += dt;
        if (p.stateTimer >= cfg.beamTime) {
          p.phase = PHASE_ORBIT;
          p.fireTimer = gap(cfg.eyeFireGapMin, cfg.eyeFireGapMax);
        }
      }

      // Beam collision (both eyes of this pair, while firing).
      if (p.phase === PHASE_FIRE) {
        if (beamHits(driver, pcx, pcy)) return "lost";
        if (beamHits(mirror, pcx, pcy)) return "lost";
      }
    }

    // Small homing eyes, capped at cfg.smallCount alive at once.
    smallSpawnTimer -= dt;
    while (
      smallSpawnTimer <= 0 &&
      firedVolleys < cfg.volleys &&
      activeSmallCount() < cfg.smallCount
    ) {
      const slot = freeSmall();
      if (slot === -1) break;
      const a = rng.next() * Math.PI * 2;
      const s = smalls[slot];
      s.active = true;
      s.x = CX + Math.cos(a) * SMALL_SPAWN_RADIUS;
      s.y = CY + Math.sin(a) * SMALL_SPAWN_RADIUS;
      s.life = cfg.smallLifetime;
      smallSpawnTimer += gap(cfg.smallSpawnGapMin, cfg.smallSpawnGapMax);
    }
    for (let i = 0; i < MAX_SMALL; i++) {
      const s = smalls[i];
      if (!s.active) continue;
      const sdx = pcx - s.x;
      const sdy = pcy - s.y;
      const slen = Math.hypot(sdx, sdy) || 1;
      s.x += (sdx / slen) * cfg.smallSpeed * dt;
      s.y += (sdy / slen) * cfg.smallSpeed * dt;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        continue;
      }
      if (rectsOverlap(player.pos.x, player.pos.y, CURSOR_SIZE, CURSOR_SIZE,
        s.x - SMALL_R, s.y - SMALL_R, SMALL_R * 2, SMALL_R * 2)) {
        return "lost";
      }
    }

    if (firedVolleys >= cfg.volleys && !anyBusy) return "won";
    return "running";
  }

  function drawPairEye(ctx: CanvasRenderingContext2D, p: Pair, e: Eye): void {
    const ex = e.x + e.aimDx * BEAM_LEN;
    const ey = e.y + e.aimDy * BEAM_LEN;
    if (p.phase === PHASE_TELEGRAPH) {
      drawBeamLine(ctx, e.x, e.y, ex, ey, 3, "#ff5cf0", 0.5);
    } else if (p.phase === PHASE_FIRE) {
      drawBeamLine(ctx, e.x, e.y, ex, ey, cfg.beamWidth, "#ff3b6b", 0.85);
    }
    drawEye(ctx, e.x, e.y, EYE_R, e.lookDx, e.lookDy);
  }

  function draw(ctx: CanvasRenderingContext2D): void {
    for (let pi = 0; pi < activePairs; pi++) {
      const p = pairs[pi];
      drawPairEye(ctx, p, p.driver);
      drawPairEye(ctx, p, p.mirror);
    }
    for (let i = 0; i < MAX_SMALL; i++) {
      const s = smalls[i];
      if (!s.active) continue;
      drawSmallEye(ctx, s.x, s.y, SMALL_R);
    }
  }

  return { update, draw, reset };
}

const EYE_BEAMS_PARAMS: readonly FightParam[] = [
  { key: "seed", label: "Seed", kind: "seed", min: 0, max: 999999, step: 1 },
  { key: "volleys", label: "Volleys", kind: "int", min: 0, max: 200, step: 1 },
  { key: "pairCount", label: "Eye pairs", kind: "int", min: 1, max: 8, step: 1 },
  { key: "orbitSpeed", label: "Orbit speed", kind: "float", min: 0.1, max: 3, step: 0.1 },
  { key: "telegraphTime", label: "Telegraph (s)", kind: "float", min: 0.1, max: 2, step: 0.05 },
  { key: "beamTime", label: "Beam (s)", kind: "float", min: 0.1, max: 1.5, step: 0.05 },
  { key: "beamWidth", label: "Beam width", kind: "float", min: 6, max: 80, step: 2 },
  { key: "eyeFireGapMin", label: "Fire gap min (s)", kind: "float", min: 0, max: 8, step: 0.1 },
  { key: "eyeFireGapMax", label: "Fire gap max (s)", kind: "float", min: 0, max: 8, step: 0.1 },
  { key: "smallSpeed", label: "Small eye speed", kind: "float", min: 0, max: 200, step: 5 },
  { key: "smallCount", label: "Max small eyes", kind: "int", min: 0, max: 40, step: 1 },
];

export const EYE_BEAMS: FightDefinition<EyeBeamsConfig> = {
  name: "Eye Beams",
  params: EYE_BEAMS_PARAMS,
  defaults: DEFAULT_EYE_BEAMS,
  create: (config) => createEyeBeams(config),
};
```

- [ ] **Step 4: Run the tests and type-check (GREEN)**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all tests pass (loss, determinism, win, small-kill, small-cap, pairs 1→2 / 3→6, definition params).

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/fights/eyeBeams.ts src/fights/eyeBeams.test.ts
git commit -m "feat: multiple independent eye pairs (configurable pairCount, default 4)"
```

- [ ] **Step 7: Manual verification in the Windows browser**

Run: `npm run dev` (leave running), open `http://localhost:5173`, select **Eye Beams**, and confirm:
- Four mirrored pairs (eight large eyes) orbit outside the box, each spread around and moving independently.
- Pairs telegraph and fire on their own cadences (not in unison); within each pair the targeting eye still varies per volley, and the partner fires the mirrored beam.
- The config panel shows an **"Eye pairs"** knob and a **"Max small eyes"** knob; changing "Eye pairs" + Restart fight changes how many pairs are on screen.
- Dying restarts the seeded wave; surviving the volleys shows VICTORY.
- Motion stays smooth with eight eyes plus small eyes.

---

## Self-Review Notes

- **Spec coverage:** `pairCount` config + param (default 4); pooled `Pair` structs each with own orbit/volley state + driver/mirror eyes; `activePairs = min(pairCount, MAX_PAIRS)`; independent orbit/fire/coin per pair; per-pair mirror + clamp outside box; volleys total across pairs; win gates on no busy pair; both-eye beam collision per firing pair; `smallCount` retained; params list updated; determinism (per-pair seed order + per-volley coin). All covered.
- **Type consistency:** `EyeBeamsConfig` (with `pairCount`), `Pair`, `Eye`, `createEyeBeams`, `DEFAULT_EYE_BEAMS`, `EYE_BEAMS`, params list — consistent between impl and test (definition test asserts the exact key list; pairs test asserts 2·pairCount eyes).
- **No placeholders:** complete file + complete test.
- **Allocation:** pair pool + small pool built once; `update`/`draw`/`beamHits`/`drawPairEye`/`resetEye` defined once; loops use scalars, references, and in-place mutation — no per-call literals/closures.
- **Determinism:** reset reseeds and seeds pairs in index order then the small timer; one coin per volley per pair; the determinism test (`pairCount: 1`) asserts identical loss step across two same-seed fights.
