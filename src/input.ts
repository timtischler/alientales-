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
