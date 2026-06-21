# Eye Beams Tweaks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Eye Beams small-eye cap configurable, and turn the large eyes into a mirror-image pair (random aim-driver each volley) that never enters the player's box.

**Architecture:** A single rewrite of `src/fights/eyeBeams.ts`. The orbit/volley state moves to closure variables for one orbiter; `eyes[0]` is the orbiter and `eyes[1]` is its reflection across the vertical center line. A radius clamp keeps the orbiter (and thus its mirror) outside the arena box, so the eye-body hazard is removed. A seeded coin flip at each telegraph lock picks which eye targets the player; the partner fires the mirrored beam. The small-eye pool gains a configurable active cap.

**Tech Stack:** TypeScript, Vitest, Canvas2D (all already in the project).

## Global Constraints

- One file changes: `src/fights/eyeBeams.ts` (+ its test). No other module changes (the registry/selector/panel consume `EYE_BEAMS` generically).
- Zero per-step / per-frame allocation in `update`/`draw`: no object/array literals, no closures created per call, no `new`. The two eyes and the small-eye pool are built once at construction.
- `CX = ARENA.x + ARENA.w/2 = 400`. Reflection across the vertical center line: position `(2*CX - x, y)`, direction `(-dx, dy)`.
- Eyes are kept fully outside the box: clamp the orbit radius to at least `minR = 1 / max(|cosθ|/BOX_HALF_X, |sinθ|/BOX_HALF_Y)` with `BOX_HALF_X = ARENA.w/2 + EYE_R + 6` and `BOX_HALF_Y = ARENA.h/2 + EYE_R + 6`. The eye-body collision check is removed (it can never trigger).
- Aim-driver per volley is chosen by a seeded coin flip (`rng.next() < 0.5`) at telegraph lock; the partner's aim is the reflection of the driver's aim. The telegraph does not damage; only `PHASE_FIRE` collides, on BOTH eyes' beams.
- Config: remove `eyeCount`; add `smallCount` (max small eyes alive at once, default 6). Orbit defaults: `orbitRadius: 250`, `orbitRadiusAmp: 70`.
- `EYE_BEAMS.params` order: `seed, volleys, orbitSpeed, telegraphTime, beamTime, beamWidth, eyeFireGapMin, eyeFireGapMax, smallSpeed, smallCount`.
- Determinism preserved: only the orbiter is seeded (`phaseAngle`, `radiusPhase`, `fireTimer`), then the small spawn timer; each volley draws one coin at lock. `reset()` reseeds.
- TypeScript strict; full suite green; `npm run build` succeeds.

---

### Task 1: Rewrite Eye Beams — small-eye cap + mirrored random-driver pair

**Files:**
- Modify (full replace): `src/fights/eyeBeams.ts`
- Modify (full replace): `src/fights/eyeBeams.test.ts`

**Interfaces:**
- Consumes: `createRng`; `rectsOverlap`, `distancePointToSegment`; `ARENA`, `CURSOR_SIZE`; `Cursor`, `makeCursor`; `Fight`, `FightStatus`, `FightDefinition`, `FightParam`; `drawEye`, `drawSmallEye`, `drawBeamLine`.
- Produces (unchanged surface, changed config): `createEyeBeams(cfg)`, `DEFAULT_EYE_BEAMS`, `EYE_BEAMS`, `EyeBeamsConfig`. `EyeBeamsConfig` drops `eyeCount`, adds `smallCount`.

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

const LOSS_CFG = {
  ...DEFAULT_EYE_BEAMS,
  volleys: 2,
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

    // Small eyes draw their sclera at radius SMALL_R (7); big eyes at EYE_R (22).
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

describe("EYE_BEAMS definition", () => {
  it("exposes the tunable params, all numeric fields of the defaults", () => {
    expect(EYE_BEAMS.name).toBe("Eye Beams");
    expect(EYE_BEAMS.defaults).toBe(DEFAULT_EYE_BEAMS);
    expect(EYE_BEAMS.params.map((p) => p.key)).toEqual([
      "seed", "volleys", "orbitSpeed", "telegraphTime", "beamTime",
      "beamWidth", "eyeFireGapMin", "eyeFireGapMax", "smallSpeed", "smallCount",
    ]);
    for (const p of EYE_BEAMS.params) {
      expect(typeof (DEFAULT_EYE_BEAMS as unknown as Record<string, unknown>)[p.key]).toBe("number");
    }
  });
});

describe("EyeBeams mirrored pair", () => {
  it("always draws exactly two large eyes", () => {
    const fight = createEyeBeams({ ...DEFAULT_EYE_BEAMS, volleys: 0, smallCount: 0 });
    const player = makeCursor();
    for (let i = 0; i < 10; i++) fight.update(player, 1 / 120);

    let bigEyes = 0;
    const ctx = {
      fillStyle: "", strokeStyle: "", lineWidth: 0, globalAlpha: 1, lineCap: "",
      save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
      arc(_x: number, _y: number, r: number) { if (r === 22) bigEyes++; },
      fill() {}, stroke() {}, fillRect() {},
    } as unknown as CanvasRenderingContext2D;
    fight.draw(ctx);
    expect(bigEyes).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail (RED)**

Run: `npm test`
Expected: FAIL — the current `EyeBeamsConfig` has no `smallCount`, so the new test configs do not type-check (and `npx tsc` / vitest report errors), and the definition/cap/mirror assertions do not match the current implementation.

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

const MAX_SMALL = 64;
const SMALL_R = 7;
const SMALL_SPAWN_RADIUS = 280;

// A rendered eye: position, pupil look direction, and locked beam direction.
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

  // eyes[0] is the orbiter (drives position + the shared phase); eyes[1] mirrors it.
  const eyes: Eye[] = [makeEyeState(), makeEyeState()];

  // Orbit/volley state for the orbiter (shared by the pair).
  let phaseAngle = 0;
  let radiusPhase = 0;
  let fireTimer = 0;
  let phase = PHASE_ORBIT;
  let stateTimer = 0;

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

  function reset(): void {
    rng.reseed(cfg.seed);
    firedVolleys = 0;
    phase = PHASE_ORBIT;
    stateTimer = 0;
    phaseAngle = rng.next() * Math.PI * 2;
    radiusPhase = rng.next() * Math.PI * 2;
    fireTimer = gap(cfg.eyeFireGapMin, cfg.eyeFireGapMax);
    for (let i = 0; i < 2; i++) {
      const e = eyes[i];
      e.x = 0;
      e.y = 0;
      e.lookDx = 0;
      e.lookDy = 1;
      e.aimDx = 0;
      e.aimDy = 1;
    }
    for (let i = 0; i < MAX_SMALL; i++) smalls[i].active = false;
    smallSpawnTimer = gap(cfg.smallSpawnGapMin, cfg.smallSpawnGapMax);
  }

  reset();

  function update(player: Cursor, dt: number): FightStatus {
    const pcx = player.pos.x + CURSOR_SIZE / 2;
    const pcy = player.pos.y + CURSOR_SIZE / 2;

    const driver = eyes[0];
    const mirror = eyes[1];

    // 1. Advance orbit (frozen during telegraph + fire) and clamp outside the box.
    if (phase === PHASE_ORBIT) {
      phaseAngle += cfg.orbitSpeed * dt;
      radiusPhase += RADIUS_OSC_SPEED * dt;
    }
    const ca = Math.cos(phaseAngle);
    const sa = Math.sin(phaseAngle);
    let r = cfg.orbitRadius + cfg.orbitRadiusAmp * Math.sin(radiusPhase);
    const minR = 1 / Math.max(Math.abs(ca) / BOX_HALF_X, Math.abs(sa) / BOX_HALF_Y);
    if (r < minR) r = minR;
    driver.x = CX + ca * r;
    driver.y = CY + sa * r;

    // 2. Mirror across the vertical center line.
    mirror.x = 2 * CX - driver.x;
    mirror.y = driver.y;

    // 3. Pupils track the player (each eye independently).
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

    // 4. Volley state machine. The pair shares one phase, driven by the orbiter.
    let anyBusy = false;
    if (phase === PHASE_ORBIT) {
      fireTimer -= dt;
      if (fireTimer <= 0 && firedVolleys < cfg.volleys) {
        // Random aim-driver: which eye targets the player flips each volley.
        const aimEye = rng.next() < 0.5 ? driver : mirror;
        const partner = aimEye === driver ? mirror : driver;
        const adx = pcx - aimEye.x;
        const ady = pcy - aimEye.y;
        const al = Math.hypot(adx, ady) || 1;
        aimEye.aimDx = adx / al;
        aimEye.aimDy = ady / al;
        partner.aimDx = -aimEye.aimDx; // reflection across the vertical axis
        partner.aimDy = aimEye.aimDy;
        phase = PHASE_TELEGRAPH;
        stateTimer = 0;
      }
    } else if (phase === PHASE_TELEGRAPH) {
      anyBusy = true;
      stateTimer += dt;
      if (stateTimer >= cfg.telegraphTime) {
        phase = PHASE_FIRE;
        stateTimer = 0;
        firedVolleys++;
      }
    } else {
      anyBusy = true;
      stateTimer += dt;
      if (stateTimer >= cfg.beamTime) {
        phase = PHASE_ORBIT;
        fireTimer = gap(cfg.eyeFireGapMin, cfg.eyeFireGapMax);
      }
    }

    // 5. Beam collision (both eyes, while firing). No eye-body collision: the
    //    radius clamp keeps the eyes outside the box, so they cannot reach the player.
    if (phase === PHASE_FIRE) {
      for (let i = 0; i < 2; i++) {
        const e = eyes[i];
        const ex = e.x + e.aimDx * BEAM_LEN;
        const ey = e.y + e.aimDy * BEAM_LEN;
        if (distancePointToSegment(pcx, pcy, e.x, e.y, ex, ey) <= cfg.beamWidth / 2 + PLAYER_R) {
          return "lost";
        }
      }
    }

    // 6. Small homing eyes, capped at cfg.smallCount alive at once.
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

  function draw(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < 2; i++) {
      const e = eyes[i];
      const ex = e.x + e.aimDx * BEAM_LEN;
      const ey = e.y + e.aimDy * BEAM_LEN;
      if (phase === PHASE_TELEGRAPH) {
        drawBeamLine(ctx, e.x, e.y, ex, ey, 3, "#ff5cf0", 0.5);
      } else if (phase === PHASE_FIRE) {
        drawBeamLine(ctx, e.x, e.y, ex, ey, cfg.beamWidth, "#ff3b6b", 0.85);
      }
      drawEye(ctx, e.x, e.y, EYE_R, e.lookDx, e.lookDy);
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
Expected: no type errors; all tests pass (loss, determinism, win, small-kill, small-cap=3, definition params, mirrored-pair=2 eyes).

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/fights/eyeBeams.ts src/fights/eyeBeams.test.ts
git commit -m "feat: configurable small-eye cap and mirrored random-driver eye pair kept outside the box"
```

- [ ] **Step 7: Manual verification in the Windows browser**

Run: `npm run dev` (leave running), open `http://localhost:5173`, select the **Eye Beams** fight, and confirm:
- Two eyes form a left/right mirror pair that orbits the **outside** of the box and never crosses into the play area.
- Each volley, the eye that locks onto you varies (sometimes the left eye targets you, sometimes the right); the other fires the mirrored beam. The telegraph still matches where each beam fires.
- The config panel shows a "Max small eyes" knob (and no "Eyes" knob); lowering/raising it changes how many small eyes are alive at once after "Restart fight".
- Dying restarts the seeded wave; surviving the volleys shows VICTORY.
- Motion stays smooth.

---

## Self-Review Notes

- **Spec coverage:** configurable `smallCount` cap with `MAX_SMALL` pool (update spawn loop + cap test); `eyeCount` removed; mirrored pair `eyes[1] = reflect(eyes[0])`; random aim-driver coin at lock with partner mirror-aim; radius clamp keeps eyes outside the box; eye-body collision removed; both beams collide during fire; orbit defaults nudged; params updated. All covered.
- **Type consistency:** `EyeBeamsConfig` (now with `smallCount`, no `eyeCount`), `createEyeBeams`, `DEFAULT_EYE_BEAMS`, `EYE_BEAMS`, and the params list are consistent between the impl and the test (definition test asserts the exact new key list).
- **No placeholders:** complete file + complete test provided.
- **Allocation:** the two eyes and the small pool are built once; `update`/`draw` use only scalars, references, and in-place mutation — no per-call literals/closures. The radius clamp and coin flip are scalar ops.
- **Determinism:** only the orbiter is seeded plus one coin per volley and the small spawn draws, all on the fixed-step timeline; `reset()` reseeds. The determinism test asserts identical loss step across two same-seed fights.
