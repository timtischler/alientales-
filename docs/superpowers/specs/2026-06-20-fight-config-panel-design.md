# Schema-Driven Fight Config Panel

**Date:** 2026-06-20
**Status:** Approved

## Goal

Add an in-page configuration panel — in the spirit of the existing movement
dropdown — for tuning a fight's parameters live, without compromising the
game's responsiveness. The panel is **schema-driven**: each fight declares its
own tunable variables, and a single generic panel renders controls from that
declaration. New fights gain a config panel for free by declaring their params.

## Why performance is not affected

The panel is plain HTML form controls living **outside** the `<canvas>`, exactly
like the movement dropdown. The fixed-timestep game loop never reads the DOM; it
reads a plain config object in memory. Editing a control changes nothing in the
hot path. The only allocation is rebuilding the fight (a fresh RNG + a pool of
12 structs) when the user clicks "Restart fight" — a one-time cost on a click,
never per frame. No new GC pressure during play.

## The Generalization: `FightDefinition`

Rather than hardcoding UFO fields into a panel, a fight exposes a parameter
schema plus a factory. The panel and the game wire themselves from this one
object.

```ts
// src/fights/types.ts (added alongside Fight / FightStatus)
export interface FightParam {
  key: string;                    // matches a field name in the config object
  label: string;                  // shown next to the control
  kind: "int" | "float" | "seed"; // controls parsing/step and the randomize button
  min?: number;
  max?: number;
  step?: number;
}

export interface FightDefinition<C> {
  name: string;                   // e.g. "UFO Invasion"
  params: readonly FightParam[];  // what the panel renders
  defaults: C;                    // starting config
  create(config: C): Fight;       // (re)build the fight with a given config
}
```

The UFO fight ships:

```ts
export const UFO_INVASION: FightDefinition<UfoFightConfig>;
```

It wraps the existing `createUfoFight` and declares its params: `seed` (kind
`seed`), `count` (`int`), `speedMin`/`speedMax` (`float`), `spawnGapMin`/
`spawnGapMax` (`float`), `beamerChance` (`float`, min 0 max 1 step 0.05). Its
`defaults` is `DEFAULT_UFO_FIGHT`. `main.ts` builds both the panel and the fight
from this single definition.

## The Panel

`src/configPanel.ts` exports `createConfigPanel(container, def, initialConfig,
onApply)`:

- Renders one labeled `<input type="number">` per `FightParam`, applying the
  schema's `min`/`max`/`step`. `kind: "seed"` controls also get a **🎲
  randomize** button that fills a fresh random integer.
- A **"Restart fight"** button (the chosen apply model). On click it reads all
  inputs into a fresh config via the pure `readConfig`, then calls
  `onApply(config)`. Nothing changes mid-dodge until the button is clicked.
- Lives in a top-right `#fight-config` container, monospace, the same visual
  spirit as `#settings`.

## Data Flow

1. On startup, `main.ts` loads the saved config (or `def.defaults`) and builds
   the fight and the panel from `UFO_INVASION`.
2. The user edits inputs (no effect yet) and clicks "Restart fight".
3. The panel calls the pure `readConfig(def, rawValues) → C`, which parses each
   field, clamps it to the param's `min`/`max`, and falls back to the default
   value on `NaN`/empty.
4. The panel invokes `onApply(config)`; `main.ts` does `fight =
   def.create(config)` (and persists the config). The render loop and
   `fight.update`/`fight.draw` are untouched throughout.

## Persistence

`src/fightConfigStore.ts` mirrors `settings.ts`:

- `loadFightConfig(storage, def) → C` — reads JSON from
  `bullethell.fight.<def.name>`, validates that every `def.params` key is a
  finite number, and returns it; on any failure returns `def.defaults`.
- `saveFightConfig(storage, def, config) → void` — writes the config as JSON.

`main.ts` loads on startup and saves whenever a config is applied.

## Files

- `src/fights/types.ts` — add `FightParam`, `FightDefinition<C>`.
- `src/fights/ufoInvasion.ts` — add `UFO_INVASION: FightDefinition<UfoFightConfig>`.
- `src/configPanel.ts` — generic panel builder + pure `readConfig` + `randomizeSeed`.
- `src/fightConfigStore.ts` — `loadFightConfig` / `saveFightConfig`.
- `src/main.ts` — build the panel and fight from `UFO_INVASION`; `onApply`
  rebuilds the fight and persists the config; existing win-latch resets so a new
  wave can be played after applying.
- `index.html` — a `#fight-config` container, top-right.

## Testing

The pure logic is unit-tested:

- `readConfig`: parses numbers, clamps to `min`/`max`, falls back to the default
  on `NaN`/empty, and produces every config field.
- `randomizeSeed`: returns an integer within the seed param's range.
- `loadFightConfig` / `saveFightConfig`: round-trip with a fake storage;
  malformed or partial stored JSON falls back to `def.defaults`.

The DOM rendering and the live "Restart fight" behavior are verified in the
browser.

## Non-Goals

- No sliders — number inputs are precise and handle min/max pairs cleanly.
- No live-on-keystroke apply — only the explicit "Restart fight" button.
- The movement dropdown stays exactly as-is; this panel is separate.
- No per-fight UI beyond what the schema produces (label + number input).
