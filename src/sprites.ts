export interface Sprite {
  readonly w: number;
  readonly h: number;
  readonly palette: readonly string[];
  readonly cells: readonly number[];
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  y: number,
  pixel: number,
): void {
  for (let r = 0; r < sprite.h; r++) {
    for (let c = 0; c < sprite.w; c++) {
      const idx = sprite.cells[r * sprite.w + c];
      if (idx === 0) continue;
      ctx.fillStyle = sprite.palette[idx];
      ctx.fillRect(x + c * pixel, y + r * pixel, pixel, pixel);
    }
  }
}

// palette: 0 transparent | 1 body | 2 eyes | 3 antenna tips | 4 mouth
const ALIEN_ROWS: number[][] = [
  [0, 0, 0, 3, 0, 0, 0, 3, 0, 0, 0],
  [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1],
  [1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1],
  [1, 1, 1, 1, 4, 4, 4, 1, 1, 1, 1],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0],
];

export const ALIEN: Sprite = {
  w: 11,
  h: 8,
  palette: ["", "#7df9ff", "#ffffff", "#ff5cf0", "#ff3b3b"],
  cells: ALIEN_ROWS.flat(),
};

export const UFO_COLORS: readonly string[] = [
  "#ff5252", "#ffd740", "#69f0ae", "#40c4ff", "#e040fb", "#ff6e40",
];

export function drawUfo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y + h * 0.45, w, h * 0.35);
  ctx.fillRect(x + w * 0.12, y + h * 0.3, w * 0.76, h * 0.3);
  ctx.fillStyle = "#cfe8ff";
  ctx.fillRect(x + w * 0.32, y + h * 0.05, w * 0.36, h * 0.4);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x + w * 0.18, y + h * 0.62, 3, 3);
  ctx.fillRect(x + w * 0.45, y + h * 0.62, 3, 3);
  ctx.fillRect(x + w * 0.72, y + h * 0.62, 3, 3);
}

export function drawBeam(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  top: number,
  w: number,
  len: number,
  color: string,
): void {
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = color;
  ctx.fillRect(centerX - w / 2, top, w, len);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(centerX - w / 2, top + len - 3, w, 3);
}

export function drawEye(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number,
  lookDx: number, lookDy: number,
): void {
  ctx.fillStyle = "#f4f4ff";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  const ix = x + lookDx * r * 0.4;
  const iy = y + lookDy * r * 0.4;
  ctx.fillStyle = "#7a3cff";
  ctx.beginPath();
  ctx.arc(ix, iy, r * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#0a0010";
  ctx.beginPath();
  ctx.arc(ix, iy, r * 0.24, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(ix - r * 0.12, iy - r * 0.12, r * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

export function drawSmallEye(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number,
): void {
  ctx.fillStyle = "#f4f4ff";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#c0182b";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#0a0010";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.24, 0, Math.PI * 2);
  ctx.fill();
}

// Perspective tunnel: concentric polygon rings receding to a vanishing point at
// (cx, cy), with radial spokes joining the rim vertices. Stroke-only vector web.
export function drawTunnel(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, rimRadius: number,
  lanes: number, rings: number,
): void {
  if (lanes < 3 || rings < 1) return;
  ctx.save();
  ctx.lineJoin = "round";

  function ringPath(radius: number): void {
    ctx.beginPath();
    for (let i = 0; i < lanes; i++) {
      const a = (i / lanes) * Math.PI * 2;
      const x = cx + Math.cos(a) * radius;
      const y = cy + Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  ctx.strokeStyle = "#16314e";
  ctx.lineWidth = 1.5;
  for (let r = 1; r < rings; r++) {
    ringPath(rimRadius * (r / rings));
    ctx.stroke();
  }

  ctx.strokeStyle = "#1c476f";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < lanes; i++) {
    const a = (i / lanes) * Math.PI * 2;
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * rimRadius, cy + Math.sin(a) * rimRadius);
  }
  ctx.stroke();

  ctx.strokeStyle = "#46b4ff";
  ctx.lineWidth = 2.5;
  ringPath(rimRadius);
  ctx.stroke();

  ctx.restore();
}

// A "flipper"-style monster: two triangles meeting at the center, pointing
// outward (toward the rim). One fill + one outline stroke.
export function drawTempestMonster(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, size: number,
  angle: number, color: string,
): void {
  const s = size / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(-s, -s);
  ctx.lineTo(s, 0);
  ctx.lineTo(-s, s);
  ctx.lineTo(-s * 0.35, 0);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1, size * 0.06);
  ctx.stroke();
  ctx.restore();
}

// Rough rock outline: a closed polygon whose vertices are pushed in/out by
// per-asteroid radius multipliers, rotated by `rotation`. Stroke only — vector art.
export function drawAsteroid(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  rotation: number,
  verts: readonly number[],
): void {
  const n = verts.length;
  if (n < 3) return;
  ctx.save();
  ctx.strokeStyle = "#cfd8dc";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rotation + (i / n) * Math.PI * 2;
    const rr = r * verts[i];
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

export function drawBeamLine(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  width: number, color: string, alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}
