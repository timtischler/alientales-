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
