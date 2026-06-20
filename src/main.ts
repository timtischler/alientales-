import { createInput } from "./input";
import { makeCursor, stepMovement, resetCursor } from "./movement";
import { createRenderer } from "./render";
import { loadMode, saveMode } from "./settings";
import { FIXED_DT, MAX_FRAME_DT } from "./constants";
import { createUfoFight, DEFAULT_UFO_FIGHT } from "./fights/ufoInvasion";
import type { MovementMode } from "./types";

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
if (canvas === null) throw new Error("missing #game canvas");

const modeSelect = document.getElementById("mode") as HTMLSelectElement | null;
const victory = document.getElementById("victory");

const renderer = createRenderer(canvas);
const input = createInput(window);
const cursor = makeCursor();
const fight = createUfoFight(DEFAULT_UFO_FIGHT);

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
let won = false;

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
