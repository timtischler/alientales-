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
