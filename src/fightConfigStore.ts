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
