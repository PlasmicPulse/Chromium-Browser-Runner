import type { GadgetPoint, PowerTool } from "./pet-gadgets";

// Effects stay on the single shared canvas; geometry and allocations are deliberately capped.
export type Power = {
  kind: PowerTool; x: number; y: number; ox: number; oy: number; born: number;
  fired: boolean; hit: boolean; bolt: GadgetPoint[]; sparks: { a: number; s: number }[];
};
export type PowerHooks = {
  pet: () => { x: number; y: number; r: number } | null;
  knock: (vx: number, vy: number, mode: "toss" | "pinball") => void;
  report: (kind: PowerTool, hit: boolean) => void;
};

export const MAX_POWERS = 3;
export const VORTEX_RANGE = 210;
const LIGHTNING_RANGE = 110;
const TIMING: Record<PowerTool, { charge: number; after: number }> = {
  beam: { charge: 880, after: 900 },
  vortex: { charge: 1150, after: 980 },
  lightning: { charge: 820, after: 900 },
};

export function spawnPower(kind: PowerTool, at: GadgetPoint, origin: GadgetPoint, now: number): Power {
  const bolt: GadgetPoint[] = [];
  if (kind === "lightning") {
    const top = Math.max(64, at.y - 440);
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const jitter = i === 0 || i === 8 ? 0 : (Math.random() - 0.5) * 30 * (1 - t * 0.6);
      bolt.push({ x: at.x + jitter, y: top + (at.y - top) * t });
    }
  }
  const sparks = Array.from({ length: 10 }, () => ({ a: Math.random() * Math.PI * 2, s: 0.5 + Math.random() }));
  return { kind, x: at.x, y: at.y, ox: origin.x, oy: origin.y, born: now, fired: false, hit: false, bolt, sparks };
}

function resolve(p: Power, h: PowerHooks): boolean {
  const pet = h.pet();
  if (!pet) return false;
  if (p.kind === "beam") {
    const dx = p.x - p.ox, dy = p.y - p.oy, d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    const t = (pet.x - p.ox) * ux + (pet.y - p.oy) * uy;
    if (t < 0) return false;
    const off = Math.hypot(p.ox + ux * t - pet.x, p.oy + uy * t - pet.y);
    if (off > pet.r + 24) return false;
    h.knock(ux * 28, uy * 28 - 3, "pinball");
    return true;
  }
  const dx = pet.x - p.x, dy = pet.y - p.y, d = Math.hypot(dx, dy);
  if (p.kind === "vortex") {
    if (d > VORTEX_RANGE) return false;
    const ux = d < 1 ? 1 : dx / d, uy = d < 1 ? 0 : dy / d;
    h.knock(-uy * 19 + ux * 13, ux * 19 + uy * 13 - 4, "pinball");
    return true;
  }
  if (d > LIGHTNING_RANGE) return false;
  h.knock((d < 1 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(dx)) * 12, -26, "toss");
  return true;
}

export function stepPower(ctx: CanvasRenderingContext2D, p: Power, now: number, still: boolean, h: PowerHooks): boolean {
  const timing = TIMING[p.kind], age = Math.max(0, now - p.born);
  ctx.save();
  if (age < timing.charge) {
    drawCharge(ctx, p, age / timing.charge, still ? 0 : age, h);
    ctx.restore();
    return true;
  }
  if (!p.fired) { p.fired = true; p.hit = resolve(p, h); h.report(p.kind, p.hit); }
  const q = Math.max(0, (age - timing.charge) / (still ? timing.after * 2 : timing.after));
  if (q >= 1) { ctx.restore(); return false; }
  drawRelease(ctx, p, q, still);
  ctx.restore();
  return true;
}

function halo(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, alpha: number) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
}

function drawCharge(ctx: CanvasRenderingContext2D, p: Power, t: number, clock: number, h: PowerHooks) {
  if (p.kind === "beam") {
    const dx = p.x - p.ox, dy = p.y - p.oy, d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
    const reach = Math.max(20, d - 26);
    ctx.globalAlpha = 0.18 + t * 0.34;
    ctx.strokeStyle = "#a8d9d5"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p.ox, p.oy); ctx.lineTo(p.ox + ux * reach, p.oy + uy * reach); ctx.stroke();
    ctx.globalAlpha = 0.28 + t * 0.5;
    ctx.strokeStyle = "#71c8d0"; ctx.lineWidth = 1.5 + t * 2;
    ctx.beginPath();
    ctx.moveTo(p.ox + nx * (7 + t * 9), p.oy + ny * (7 + t * 9));
    ctx.lineTo(p.ox + ux * reach + nx * (7 + t * 9), p.oy + uy * reach + ny * (7 + t * 9));
    ctx.moveTo(p.ox - nx * (7 + t * 9), p.oy - ny * (7 + t * 9));
    ctx.lineTo(p.ox + ux * reach - nx * (7 + t * 9), p.oy + uy * reach - ny * (7 + t * 9));
    ctx.stroke();
    const pulse = 13 + t * 20;
    ctx.globalAlpha = 0.18 + t * 0.4;
    ctx.strokeStyle = "#bceff0"; ctx.lineWidth = 2 + t * 2;
    ctx.beginPath(); ctx.arc(p.ox, p.oy, pulse, 0, Math.PI * 2); ctx.stroke();
    halo(ctx, p.ox, p.oy, 5 + t * 7, "#efffff", 0.65 + t * 0.25);
    return;
  }
  if (p.kind === "vortex") {
    const pet = h.pet();
    ctx.globalAlpha = 0.12 + t * 0.2; ctx.strokeStyle = "#8b9dde"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, VORTEX_RANGE, 0, Math.PI * 2); ctx.stroke();
    if (pet && Math.hypot(pet.x - p.x, pet.y - p.y) <= VORTEX_RANGE) {
      ctx.globalAlpha = 0.28 + t * 0.35; ctx.strokeStyle = "#c9d8ff"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(pet.x, pet.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    }
    const shrink = 1 - t * 0.56;
    ctx.globalAlpha = 0.3 + t * 0.5;
    for (let ring = 0; ring < 3; ring++) {
      const radius = (38 + ring * 39) * shrink;
      ctx.strokeStyle = ring === 1 ? "#9eb6f3" : "#556eaa";
      ctx.lineWidth = ring === 1 ? 2.5 : 1.4;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, radius, radius * 0.56, -0.18, 0, Math.PI * 2); ctx.stroke();
    }
    halo(ctx, p.x, p.y, 8 + t * 9, "#101b3d", 0.85);
    ctx.globalAlpha = 0.75; ctx.strokeStyle = "#d7e6ff"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, 5 + t * 3, 0, Math.PI * 2); ctx.stroke();
    return;
  }
  const top = p.bolt[0], r = 25 + 24 * (1 - t);
  ctx.globalAlpha = 0.14 + t * 0.22; ctx.strokeStyle = "#f2c271"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(p.x, p.y); ctx.stroke();
  ctx.globalAlpha = 0.55 + t * 0.3; ctx.strokeStyle = "#f4c875"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(p.x - r - 10, p.y); ctx.lineTo(p.x - r + 2, p.y);
  ctx.moveTo(p.x + r - 2, p.y); ctx.lineTo(p.x + r + 10, p.y);
  ctx.moveTo(p.x, p.y - r - 10); ctx.lineTo(p.x, p.y - r + 2);
  ctx.moveTo(p.x, p.y + r - 2); ctx.lineTo(p.x, p.y + r + 10); ctx.stroke();
  halo(ctx, p.x, p.y, 4 + t * 5, "#fff2cc", 0.7);
  if (clock % 900 < 120) {
    ctx.globalAlpha = 0.5; ctx.strokeStyle = "#fff0c4"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(p.x, p.y); ctx.stroke();
  }
}

function drawRelease(ctx: CanvasRenderingContext2D, p: Power, q: number, still: boolean) {
  const fade = 1 - q;
  const ease = 1 - Math.pow(1 - q, 3);
  if (p.kind === "beam") {
    const dx = p.x - p.ox, dy = p.y - p.oy, d = Math.hypot(dx, dy) || 1;
    const ex = p.ox + dx / d * 2400, ey = p.oy + dy / d * 2400;
    ctx.globalAlpha = fade; ctx.lineCap = "round";
    ([[44, "rgba(76,190,205,.18)"], [23, "rgba(112,219,226,.52)"], [9, "#e8ffff"], [2.5, "#ffffff"]] as const)
      .forEach(([width, color]) => {
        ctx.strokeStyle = color; ctx.lineWidth = width * (0.72 + 0.28 * fade);
        ctx.beginPath(); ctx.moveTo(p.ox, p.oy); ctx.lineTo(ex, ey); ctx.stroke();
      });
    ctx.globalAlpha = fade * 0.7; ctx.strokeStyle = "#d8ffff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.ox - dy / d * 13, p.oy + dx / d * 13); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.globalAlpha = fade * 0.75; ctx.strokeStyle = "#9fe5e9"; ctx.lineWidth = 2 + 14 * ease;
    ctx.beginPath(); ctx.arc(p.ox, p.oy, 18 + 72 * ease, 0, Math.PI * 2); ctx.stroke();
    return;
  }
  if (p.kind === "vortex") {
    const collapse = 1 - Math.min(1, q * 1.55);
    const ringRadius = 18 + 240 * ease;
    ctx.globalAlpha = fade * 0.85; ctx.strokeStyle = "#aebeff"; ctx.lineWidth = 7 * fade + 1;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, ringRadius, ringRadius * 0.63, -0.18, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = fade * 0.5; ctx.strokeStyle = "#6479c3"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 12 + 118 * ease, 0, Math.PI * 2); ctx.stroke();
    halo(ctx, p.x, p.y, 26 * Math.max(0, collapse) + 3, "#111b3b", fade * 0.9);
    ctx.globalAlpha = fade * 0.8; ctx.strokeStyle = "#e3e9ff"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(p.x, p.y, 8 + 16 * Math.max(0, collapse), 0, Math.PI * 2); ctx.stroke();
    return;
  }
  ctx.globalAlpha = fade; ctx.lineJoin = "round"; ctx.lineCap = "round";
  ([[22, "rgba(237,176,83,.2)"], [11, "#eab25c"], [5, "#fff0c8"], [1.8, "#ffffff"]] as const)
    .forEach(([width, color]) => {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath(); p.bolt.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y))); ctx.stroke();
    });
  ctx.globalAlpha = fade * 0.82; ctx.strokeStyle = "#fff0c8"; ctx.lineWidth = 3 + 13 * ease;
  ctx.beginPath(); ctx.ellipse(p.x, p.y, 20 + 100 * ease, 9 + 33 * ease, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = fade * 0.45; ctx.strokeStyle = "#e9b45f"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(p.x, p.y, 14 + 150 * ease, 0, Math.PI * 2); ctx.stroke();
  if (!still) {
    ctx.globalAlpha = fade * 0.75; ctx.fillStyle = "#ffe9b5";
    p.sparks.forEach((spark) => {
      const dist = spark.s * 86 * ease;
      ctx.fillRect(p.x + Math.cos(spark.a) * dist - 1, p.y + Math.sin(spark.a) * dist - 2, 2, 4);
    });
  }
}
