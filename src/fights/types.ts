import type { Cursor } from "../movement";

export type FightStatus = "running" | "won" | "lost";

export interface Fight {
  update(player: Cursor, dt: number): FightStatus;
  draw(ctx: CanvasRenderingContext2D): void;
  reset(): void;
}

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
