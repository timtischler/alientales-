import type { Cursor } from "./movement";
import { ARENA, CURSOR_SIZE, LOGICAL_HEIGHT, LOGICAL_WIDTH } from "./constants";

export interface Renderer {
  draw(cursor: Cursor, drawFight?: (ctx: CanvasRenderingContext2D) => void): void;
  resize(): void;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("2D canvas context unavailable");

  function resize(): void {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(LOGICAL_WIDTH * dpr);
    canvas.height = Math.round(LOGICAL_HEIGHT * dpr);
    canvas.style.width = `${LOGICAL_WIDTH}px`;
    canvas.style.height = `${LOGICAL_HEIGHT}px`;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.imageSmoothingEnabled = false;
  }

  function draw(
    cursor: Cursor,
    drawFight?: (ctx: CanvasRenderingContext2D) => void,
  ): void {
    ctx!.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    ctx!.fillStyle = "#000";
    ctx!.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    if (drawFight) drawFight(ctx!);

    ctx!.strokeStyle = "#fff";
    ctx!.lineWidth = 2;
    ctx!.strokeRect(ARENA.x + 0.5, ARENA.y + 0.5, ARENA.w - 1, ARENA.h - 1);

    ctx!.fillStyle = "#fff";
    ctx!.fillRect(cursor.pos.x, cursor.pos.y, CURSOR_SIZE, CURSOR_SIZE);
  }

  resize();
  return { draw, resize };
}
