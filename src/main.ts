import { createInput } from "./input";
import { makeCursor, stepMovement, resetCursor } from "./movement";
import { createRenderer } from "./render";
import { loadMode, saveMode } from "./settings";
import { FIXED_DT, MAX_FRAME_DT } from "./constants";
import { FIGHTS } from "./fights/registry";
import { createConfigPanel } from "./configPanel";
import { loadFightConfig, saveFightConfig } from "./fightConfigStore";
import type { FightDefinition } from "./fights/types";
import type { MovementMode } from "./types";

const SELECTED_FIGHT_KEY = "bullethell.selectedFight";

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
if (canvas === null) throw new Error("missing #game canvas");

const modeSelect = document.getElementById("mode") as HTMLSelectElement | null;
const fightSelect = document.getElementById("fight-select") as HTMLSelectElement | null;
const victory = document.getElementById("victory");
const configEl = document.getElementById("fight-config");

const renderer = createRenderer(canvas);
const input = createInput(window);
const cursor = makeCursor();

function findFight(name: string | null): FightDefinition<unknown> {
  for (const f of FIGHTS) if (f.name === name) return f;
  return FIGHTS[0];
}

let currentDef: FightDefinition<unknown> = findFight(localStorage.getItem(SELECTED_FIGHT_KEY));
let config: unknown = loadFightConfig(localStorage, currentDef);
let fight = currentDef.create(config);
let won = false;

function clearVictory(): void {
  won = false;
  if (victory !== null) victory.style.display = "none";
}

function buildPanel(): void {
  if (configEl === null) return;
  configEl.innerHTML = "";
  createConfigPanel(configEl, currentDef, config, (next) => {
    config = next;
    saveFightConfig(localStorage, currentDef, config);
    fight = currentDef.create(config);
    resetCursor(cursor);
    clearVictory();
  });
}

function activate(def: FightDefinition<unknown>): void {
  currentDef = def;
  localStorage.setItem(SELECTED_FIGHT_KEY, def.name);
  config = loadFightConfig(localStorage, def);
  fight = def.create(config);
  resetCursor(cursor);
  clearVictory();
  buildPanel();
}

if (fightSelect !== null) {
  for (const f of FIGHTS) {
    const opt = document.createElement("option");
    opt.value = f.name;
    opt.textContent = f.name;
    fightSelect.appendChild(opt);
  }
  fightSelect.value = currentDef.name;
  fightSelect.addEventListener("change", () => {
    activate(findFight(fightSelect.value));
  });
}

buildPanel();

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
