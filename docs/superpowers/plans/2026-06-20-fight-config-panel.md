# Fight Config Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A schema-driven, in-page panel for tuning a fight's parameters (apply via a "Restart fight" button), with each fight declaring its own tunable variables and zero impact on the render loop.

**Architecture:** Each fight exposes a `FightDefinition<C>` — a name, a parameter schema, defaults, and a `create(config)` factory. A generic `configPanel` renders number inputs from the schema and, on "Restart fight", reads them into a config via a pure `readConfig` and hands it to `main.ts`, which rebuilds the fight. Config persists to `localStorage`. All of this lives in the DOM, off the hot path.

**Tech Stack:** TypeScript, Vitest, DOM (Canvas2D game already in place).

## Global Constraints

- The panel is DOM-only and must not touch the fixed-timestep loop. The loop reads a plain config object; rebuilding the fight happens only on a "Restart fight" click, never per frame.
- Apply model: changes take effect ONLY when the user clicks "Restart fight" (no live-on-keystroke apply).
- `readConfig` is pure: parse each field, clamp to the param's `min`/`max`, round for `int`/`seed`, and fall back to the default value on `NaN`/empty. It returns every field of the config (param fields updated, non-param fields kept from defaults).
- Persistence key: `bullethell.fight.<def.name>`; load on startup, save on every apply; any parse/validation failure falls back to `def.defaults`.
- UFO Invasion exposes exactly these params, in this order: `seed` (seed), `count` (int), `speedMin` (float), `speedMax` (float), `beamerChance` (float, min 0 max 1 step 0.05), `spawnGapMin` (float), `spawnGapMax` (float).
- Number inputs only (no sliders). The movement dropdown stays unchanged.
- TypeScript strict mode; full suite green; `npm run build` succeeds.

---

### Task 1: `FightDefinition` schema + `UFO_INVASION` definition

**Files:**
- Modify: `src/fights/types.ts`
- Modify: `src/fights/ufoInvasion.ts`
- Test: `src/fights/ufoInvasion.test.ts` (add cases)

**Interfaces:**
- Consumes: `Fight` (already in `types.ts`); `UfoFightConfig`, `DEFAULT_UFO_FIGHT`, `createUfoFight` (already in `ufoInvasion.ts`); `makeCursor` from `../movement`.
- Produces:
  - `src/fights/types.ts`: `interface FightParam { key: string; label: string; kind: "int" | "float" | "seed"; min?: number; max?: number; step?: number }`; `interface FightDefinition<C> { name: string; params: readonly FightParam[]; defaults: C; create(config: C): Fight }`.
  - `src/fights/ufoInvasion.ts`: `const UFO_INVASION: FightDefinition<UfoFightConfig>` (name `"UFO Invasion"`, the 7 params above, `defaults: DEFAULT_UFO_FIGHT`, `create: (c) => createUfoFight(c)`).

- [ ] **Step 1: Write the failing tests**

```ts
// Append to src/fights/ufoInvasion.test.ts
import { UFO_INVASION } from "./ufoInvasion";

describe("UFO_INVASION definition", () => {
  it("exposes the tunable params in order with defaults", () => {
    expect(UFO_INVASION.name).toBe("UFO Invasion");
    expect(UFO_INVASION.defaults).toBe(DEFAULT_UFO_FIGHT);
    const keys = UFO_INVASION.params.map((p) => p.key);
    expect(keys).toEqual([
      "seed", "count", "speedMin", "speedMax", "beamerChance", "spawnGapMin", "spawnGapMax",
    ]);
  });

  it("every param key is a numeric field of the defaults", () => {
    for (const p of UFO_INVASION.params) {
      expect(typeof (DEFAULT_UFO_FIGHT as Record<string, unknown>)[p.key]).toBe("number");
    }
  });

  it("create() builds a working fight", () => {
    const fight = UFO_INVASION.create(UFO_INVASION.defaults);
    const player = makeCursor();
    expect(fight.update(player, 1 / 120)).toBe("running");
  });
});
```

(`DEFAULT_UFO_FIGHT` and `makeCursor` are already imported at the top of this test file from earlier work. Add only the `UFO_INVASION` import.)

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL — `UFO_INVASION` not exported.

- [ ] **Step 3: Add the schema types to `src/fights/types.ts`**

Append:

```ts
export interface FightParam {
  key: string;
  label: string;
  kind: "int" | "float" | "seed";
  min?: number;
  max?: number;
  step?: number;
}

export interface FightDefinition<C> {
  name: string;
  params: readonly FightParam[];
  defaults: C;
  create(config: C): Fight;
}
```

- [ ] **Step 4: Add `UFO_INVASION` to `src/fights/ufoInvasion.ts`**

Add `FightDefinition`/`FightParam` to the existing `import type ... from "./types"` line, then append at the end of the file:

```ts
const UFO_PARAMS: readonly FightParam[] = [
  { key: "seed", label: "Seed", kind: "seed", min: 0, max: 999999, step: 1 },
  { key: "count", label: "UFO count", kind: "int", min: 1, max: 200, step: 1 },
  { key: "speedMin", label: "Speed min", kind: "float", min: 10, max: 600, step: 5 },
  { key: "speedMax", label: "Speed max", kind: "float", min: 10, max: 600, step: 5 },
  { key: "beamerChance", label: "Beamer chance", kind: "float", min: 0, max: 1, step: 0.05 },
  { key: "spawnGapMin", label: "Spawn gap min (s)", kind: "float", min: 0, max: 5, step: 0.1 },
  { key: "spawnGapMax", label: "Spawn gap max (s)", kind: "float", min: 0, max: 5, step: 0.1 },
];

export const UFO_INVASION: FightDefinition<UfoFightConfig> = {
  name: "UFO Invasion",
  params: UFO_PARAMS,
  defaults: DEFAULT_UFO_FIGHT,
  create: (config) => createUfoFight(config),
};
```

- [ ] **Step 5: Run to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/fights/types.ts src/fights/ufoInvasion.ts src/fights/ufoInvasion.test.ts
git commit -m "feat: FightDefinition schema and UFO_INVASION definition"
```

---

### Task 2: Pure `readConfig` + `randomizeSeed`

**Files:**
- Create: `src/configPanel.ts`
- Test: `src/configPanel.test.ts`

**Interfaces:**
- Consumes: `FightDefinition`, `FightParam` from `./fights/types`.
- Produces:
  - `function clampToParam(param: FightParam, value: number): number` — clamps to `min`/`max`; rounds when `kind` is `"int"` or `"seed"`.
  - `function readConfig<C>(def: FightDefinition<C>, raw: Record<string, string>): C` — starts from a copy of `def.defaults`; for each param, parses `raw[key]` with `parseFloat`; on `NaN` keeps the default, otherwise stores `clampToParam`. Returns the full config.
  - `function randomizeSeed(param: FightParam, rand: () => number): number` — integer in `[param.min ?? 0, param.max ?? 999999]`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/configPanel.test.ts
import { describe, it, expect } from "vitest";
import { readConfig, randomizeSeed, clampToParam } from "./configPanel";
import type { FightDefinition, FightParam } from "./fights/types";

const DEF: FightDefinition<{ a: number; b: number; seed: number; keep: number }> = {
  name: "t",
  params: [
    { key: "a", label: "A", kind: "float", min: 0, max: 100 },
    { key: "b", label: "B", kind: "int", min: 0, max: 20 },
    { key: "seed", label: "Seed", kind: "seed", min: 0, max: 9 },
  ],
  defaults: { a: 5, b: 10, seed: 1, keep: 42 },
  create: () => ({ update: () => "running", draw: () => {}, reset: () => {} }),
};

describe("clampToParam", () => {
  it("clamps to min/max", () => {
    expect(clampToParam(DEF.params[0], 999)).toBe(100);
    expect(clampToParam(DEF.params[0], -5)).toBe(0);
  });
  it("rounds int and seed kinds", () => {
    expect(clampToParam(DEF.params[1], 12.9)).toBe(13);
    expect(clampToParam(DEF.params[2], 3.4)).toBe(3);
  });
});

describe("readConfig", () => {
  it("parses provided values", () => {
    const c = readConfig(DEF, { a: "7.5", b: "12", seed: "3" });
    expect(c).toEqual({ a: 7.5, b: 12, seed: 3, keep: 42 });
  });
  it("clamps out-of-range values", () => {
    const c = readConfig(DEF, { a: "999", b: "-4", seed: "100" });
    expect(c).toEqual({ a: 100, b: 0, seed: 9, keep: 42 });
  });
  it("falls back to the default on NaN/empty", () => {
    const c = readConfig(DEF, { a: "", b: "abc" });
    expect(c).toEqual({ a: 5, b: 10, seed: 1, keep: 42 });
  });
  it("preserves non-param fields from defaults", () => {
    const c = readConfig(DEF, { a: "1" });
    expect(c.keep).toBe(42);
  });
});

describe("randomizeSeed", () => {
  it("returns min when rand is 0 and max when rand approaches 1", () => {
    expect(randomizeSeed(DEF.params[2], () => 0)).toBe(0);
    expect(randomizeSeed(DEF.params[2], () => 0.999999)).toBe(9);
  });
  it("stays within range", () => {
    for (let i = 0; i < 100; i++) {
      const v = randomizeSeed(DEF.params[2], Math.random);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(9);
    }
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL — module/exports not defined.

- [ ] **Step 3: Implement the pure helpers in `src/configPanel.ts`**

```ts
import type { FightDefinition, FightParam } from "./fights/types";

export function clampToParam(param: FightParam, value: number): number {
  let v = value;
  if (param.min !== undefined && v < param.min) v = param.min;
  if (param.max !== undefined && v > param.max) v = param.max;
  if (param.kind === "int" || param.kind === "seed") v = Math.round(v);
  return v;
}

export function readConfig<C>(def: FightDefinition<C>, raw: Record<string, string>): C {
  const out = { ...def.defaults } as Record<string, number>;
  for (const param of def.params) {
    const parsed = parseFloat(raw[param.key] ?? "");
    if (Number.isNaN(parsed)) continue;
    out[param.key] = clampToParam(param, parsed);
  }
  return out as unknown as C;
}

export function randomizeSeed(param: FightParam, rand: () => number): number {
  const min = param.min ?? 0;
  const max = param.max ?? 999999;
  return Math.floor(min + rand() * (max - min + 1));
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/configPanel.ts src/configPanel.test.ts
git commit -m "feat: pure readConfig and randomizeSeed for the config panel"
```

---

### Task 3: `createConfigPanel` DOM builder

**Files:**
- Modify: `src/configPanel.ts`

**Interfaces:**
- Consumes: `readConfig`, `randomizeSeed` (Task 2); `FightDefinition` from `./fights/types`.
- Produces: `function createConfigPanel<C>(container: HTMLElement, def: FightDefinition<C>, initial: C, onApply: (config: C) => void): void` — appends a title, one labeled number input per param (seed params also get a 🎲 button that fills a random seed), and a "Restart fight" button. On click it reads inputs via `readConfig`, reflects the clamped values back into the inputs, and calls `onApply(config)`. No unit test (DOM rendering is verified live in the browser).

- [ ] **Step 1: Append `createConfigPanel` to `src/configPanel.ts`**

```ts
export function createConfigPanel<C>(
  container: HTMLElement,
  def: FightDefinition<C>,
  initial: C,
  onApply: (config: C) => void,
): void {
  const initialRec = initial as unknown as Record<string, number>;
  const inputs: Record<string, HTMLInputElement> = {};

  const title = document.createElement("div");
  title.textContent = def.name;
  title.style.fontWeight = "bold";
  title.style.marginBottom = "4px";
  container.appendChild(title);

  for (const param of def.params) {
    const row = document.createElement("label");
    row.style.display = "block";
    row.style.margin = "2px 0";
    row.textContent = `${param.label} `;

    const input = document.createElement("input");
    input.type = "number";
    if (param.min !== undefined) input.min = String(param.min);
    if (param.max !== undefined) input.max = String(param.max);
    if (param.step !== undefined) input.step = String(param.step);
    input.value = String(initialRec[param.key]);
    input.style.width = "72px";
    row.appendChild(input);
    inputs[param.key] = input;

    if (param.kind === "seed") {
      const dice = document.createElement("button");
      dice.type = "button";
      dice.textContent = "🎲";
      dice.addEventListener("click", () => {
        input.value = String(randomizeSeed(param, Math.random));
      });
      row.appendChild(dice);
    }

    container.appendChild(row);
  }

  const apply = document.createElement("button");
  apply.type = "button";
  apply.textContent = "Restart fight";
  apply.style.marginTop = "4px";
  apply.addEventListener("click", () => {
    const raw: Record<string, string> = {};
    for (const param of def.params) raw[param.key] = inputs[param.key].value;
    const config = readConfig(def, raw);
    const rec = config as unknown as Record<string, number>;
    for (const param of def.params) inputs[param.key].value = String(rec[param.key]);
    onApply(config);
  });
  container.appendChild(apply);
}
```

- [ ] **Step 2: Type-check and run the suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all tests still pass.

- [ ] **Step 3: Commit**

```bash
git add src/configPanel.ts
git commit -m "feat: createConfigPanel DOM builder"
```

---

### Task 4: Config persistence

**Files:**
- Create: `src/fightConfigStore.ts`
- Test: `src/fightConfigStore.test.ts`

**Interfaces:**
- Consumes: `FightDefinition` from `./fights/types`.
- Produces:
  - `function loadFightConfig<C>(storage: Pick<Storage, "getItem" | "setItem">, def: FightDefinition<C>): C` — reads JSON from `bullethell.fight.<def.name>`; returns `def.defaults` if absent, unparseable, not an object, or if any param key is not a finite number; otherwise returns defaults with each defaults-key overwritten by the stored finite number when present.
  - `function saveFightConfig<C>(storage: Pick<Storage, "getItem" | "setItem">, def: FightDefinition<C>, config: C): void` — writes `JSON.stringify(config)` to the key.

- [ ] **Step 1: Write the failing tests**

```ts
// src/fightConfigStore.test.ts
import { describe, it, expect } from "vitest";
import { loadFightConfig, saveFightConfig } from "./fightConfigStore";
import type { FightDefinition } from "./fights/types";

const DEF: FightDefinition<{ seed: number; count: number; keep: number }> = {
  name: "UFO Invasion",
  params: [
    { key: "seed", label: "Seed", kind: "seed" },
    { key: "count", label: "Count", kind: "int" },
  ],
  defaults: { seed: 1337, count: 30, keep: 7 },
  create: () => ({ update: () => "running", draw: () => {}, reset: () => {} }),
};

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    map,
  };
}

describe("fight config persistence", () => {
  it("returns defaults when nothing stored", () => {
    expect(loadFightConfig(fakeStorage(), DEF)).toEqual(DEF.defaults);
  });
  it("returns defaults on malformed JSON", () => {
    const s = fakeStorage({ "bullethell.fight.UFO Invasion": "{not json" });
    expect(loadFightConfig(s, DEF)).toEqual(DEF.defaults);
  });
  it("returns defaults when a param key is missing or non-numeric", () => {
    const s = fakeStorage({ "bullethell.fight.UFO Invasion": JSON.stringify({ seed: "x", count: 5 }) });
    expect(loadFightConfig(s, DEF)).toEqual(DEF.defaults);
  });
  it("round-trips a saved config", () => {
    const s = fakeStorage();
    saveFightConfig(s, DEF, { seed: 42, count: 12, keep: 7 });
    expect(loadFightConfig(s, DEF)).toEqual({ seed: 42, count: 12, keep: 7 });
  });
  it("keeps default values for keys absent from the stored object", () => {
    const s = fakeStorage({ "bullethell.fight.UFO Invasion": JSON.stringify({ seed: 9, count: 3 }) });
    expect(loadFightConfig(s, DEF)).toEqual({ seed: 9, count: 3, keep: 7 });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL — module/exports not defined.

- [ ] **Step 3: Implement `src/fightConfigStore.ts`**

```ts
import type { FightDefinition } from "./fights/types";

type ReadWrite = Pick<Storage, "getItem" | "setItem">;

function keyFor(name: string): string {
  return `bullethell.fight.${name}`;
}

export function loadFightConfig<C>(storage: ReadWrite, def: FightDefinition<C>): C {
  const raw = storage.getItem(keyFor(def.name));
  if (raw === null) return def.defaults;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return def.defaults;
  }
  if (typeof parsed !== "object" || parsed === null) return def.defaults;

  const obj = parsed as Record<string, unknown>;
  for (const param of def.params) {
    const v = obj[param.key];
    if (typeof v !== "number" || !Number.isFinite(v)) return def.defaults;
  }

  const merged = { ...def.defaults } as Record<string, number>;
  for (const k of Object.keys(merged)) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) merged[k] = v;
  }
  return merged as unknown as C;
}

export function saveFightConfig<C>(storage: ReadWrite, def: FightDefinition<C>, config: C): void {
  storage.setItem(keyFor(def.name), JSON.stringify(config));
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/fightConfigStore.ts src/fightConfigStore.test.ts
git commit -m "feat: fight config localStorage persistence"
```

---

### Task 5: Wire the panel into the game

**Files:**
- Modify: `index.html`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `UFO_INVASION` (Task 1); `createConfigPanel` (Task 3); `loadFightConfig`/`saveFightConfig` (Task 4); `resetCursor` (existing).
- Produces: the running game with a tunable config panel. The fight is built from the loaded config; applying rebuilds it, recenters the player, clears any victory state, and persists the config.

- [ ] **Step 1: Add the panel container to `index.html`**

Insert immediately after the `<div id="victory">…</div>` block (before the `<script>`):

```html
    <div id="fight-config" style="position: fixed; top: 8px; right: 8px; color: #aaa; font: 12px monospace; background: rgba(0, 0, 0, 0.45); padding: 6px 8px; border: 1px solid #333;"></div>
```

- [ ] **Step 2: Update `src/main.ts`**

Replace the fight import and construction, and add the panel wiring. The full file becomes:

```ts
import { createInput } from "./input";
import { makeCursor, stepMovement, resetCursor } from "./movement";
import { createRenderer } from "./render";
import { loadMode, saveMode } from "./settings";
import { FIXED_DT, MAX_FRAME_DT } from "./constants";
import { UFO_INVASION } from "./fights/ufoInvasion";
import { createConfigPanel } from "./configPanel";
import { loadFightConfig, saveFightConfig } from "./fightConfigStore";
import type { MovementMode } from "./types";

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
if (canvas === null) throw new Error("missing #game canvas");

const modeSelect = document.getElementById("mode") as HTMLSelectElement | null;
const victory = document.getElementById("victory");
const configEl = document.getElementById("fight-config");

const renderer = createRenderer(canvas);
const input = createInput(window);
const cursor = makeCursor();

let config = loadFightConfig(localStorage, UFO_INVASION);
let fight = UFO_INVASION.create(config);
let won = false;

let mode: MovementMode = loadMode(localStorage);
if (modeSelect !== null) {
  modeSelect.value = mode;
  modeSelect.addEventListener("change", () => {
    mode = modeSelect.value === "accelerated" ? "accelerated" : "digital";
    saveMode(localStorage, mode);
  });
}

if (configEl !== null) {
  createConfigPanel(configEl, UFO_INVASION, config, (next) => {
    config = next;
    saveFightConfig(localStorage, UFO_INVASION, config);
    fight = UFO_INVASION.create(config);
    resetCursor(cursor);
    won = false;
    if (victory !== null) victory.style.display = "none";
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
    if (!won) {
      const status = fight.update(cursor, FIXED_DT);
      if (status === "lost") {
        resetCursor(cursor);
        fight.reset();
      } else if (status === "won") {
        won = true;
        if (victory !== null) victory.style.display = "block";
      }
    }
    accumulator -= FIXED_DT;
  }

  renderer.draw(cursor, fight.draw);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
```

- [ ] **Step 3: Type-check, run the suite, and build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: no type errors; all tests pass; build succeeds.

- [ ] **Step 4: Manual verification in the Windows browser**

Run: `npm run dev` (leave running), open `http://localhost:5173`, and confirm:
- A "UFO Invasion" panel appears top-right with number inputs for seed, UFO count, speed min/max, beamer chance, and spawn gap min/max, plus a 🎲 next to seed and a "Restart fight" button.
- Editing a value does nothing until "Restart fight" is clicked; clicking it restarts the wave with the new values (e.g. lower spawn gaps = denser, higher beamer chance = more beams).
- 🎲 fills a new seed; clicking "Restart fight" then plays that seed.
- Out-of-range entries are clamped on apply (the input snaps to the clamped value).
- Reloading the page preserves the last applied config.
- Gameplay stays smooth — no stutter introduced by the panel.

- [ ] **Step 5: Commit**

```bash
git add index.html src/main.ts
git commit -m "feat: wire the fight config panel into the game"
```

---

## Self-Review Notes

- **Spec coverage:** `FightDefinition`/`FightParam` schema (Task 1); `UFO_INVASION` with the exact 7 params (Task 1); generic panel with number inputs + 🎲 + "Restart fight" (Task 3); pure `readConfig` parse/clamp/NaN→default + non-param preservation (Task 2); `randomizeSeed` (Task 2); persistence to `bullethell.fight.<name>` with defaults fallback (Task 4); apply-only-on-click rebuild that recenters + clears victory + persists (Task 5); DOM-only/no hot-path cost (Tasks 3, 5 — loop untouched, rebuild on click). All covered.
- **Type consistency:** `FightParam`, `FightDefinition<C>`, `UFO_INVASION`, `clampToParam`, `readConfig`, `randomizeSeed`, `createConfigPanel(container, def, initial, onApply)`, `loadFightConfig`/`saveFightConfig(storage, def[, config])` are used identically across producing and consuming tasks.
- **No placeholders:** every code step is complete; the DOM builder (Task 3) has no unit test by design (verified live), consistent with `render.ts`.
- **Performance:** the loop in Task 5 is unchanged except reading the mutable `fight`/`won`; `fight.draw` is still passed as a stable reference; all config parsing/rebuilding happens in click handlers, off the hot path.
