import type { Cursor } from "../movement";

export type FightStatus = "running" | "won" | "lost";

export interface Fight {
  update(player: Cursor, dt: number): FightStatus;
  draw(ctx: CanvasRenderingContext2D): void;
  reset(): void;
}
