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
