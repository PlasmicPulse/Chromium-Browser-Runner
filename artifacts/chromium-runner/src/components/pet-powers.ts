import type { GadgetPoint, PowerTool } from "./pet-gadgets";

// Canvas-only, capped, high-intensity powers. No full-screen flashes; alpha only ever fades.
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
  beam: { charge: 650, after: 420 },
  vortex: { charge: 950, after: 480 },
  lightning: { charge: 560, after: 500 },
};

export function spawnPower(kind: PowerTool, at: GadgetPoint, origin: GadgetPoint, now: number): Power {
  const bolt: GadgetPoint[] = [];
  if (kind === "lightning") {
    const top = Math.max(64, at.y - 440);
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const jitter = i === 0 || i === n ? 0 : (Math.random() - 0.5) * 46 * (1 - t * 0.6);
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
    h.knock(ux * 26, uy * 26 - 3, "pinball");
    return true;
  }
  const dx = pet.x - p.x, dy = pet.y - p.y, d = Math.hypot(dx, dy);
  if (p.kind === "vortex") {
    if (d > VORTEX_RANGE) return false;
    const ux = d < 1 ? 1 : dx / d, uy = d < 1 ? 0 : dy / d;
    h.knock(-uy * 18 + ux * 12, ux * 18 + uy * 12 - 4, "pinball");
    return true;
  }
  if (d > LIGHTNING_RANGE) return false;
  h.knock((d < 1 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(dx)) * 11, -24, "toss");
  return true;
}

export function stepPower(ctx: CanvasRenderingContext2D, p: Power, now: number, still: boolean, h: PowerHooks): boolean {
  const T = TIMING[p.kind];
  const age = Math.max(0, now - p.born);
  ctx.save();
  if (age < T.charge) {
    drawCharge(ctx, p, age / T.charge, still ? 0 : age, h);
    ctx.restore();
    return true;
  }
  if (!p.fired) { p.fired = true; p.hit = resolve(p, h); h.report(p.kind, p.hit); }
  const q = Math.max(0, (age - T.charge) / (still ? T.after * 2 : T.after));
  if (q >= 1) { ctx.restore(); return false; }
  drawRelease(ctx, p, q, still);
  ctx.restore();
  return true;
}

function drawCharge(ctx: CanvasRenderingContext2D, p: Power, t: number, spin: number, h: PowerHooks) {
  if (p.kind === "beam") {
    ctx.globalAlpha = 0.4 + 0.6 * t;
    ctx.strokeStyle = "#7fc8c2"; ctx.lineWidth = 2; ctx.setLineDash([3, 7]);
    ctx.beginPath(); ctx.moveTo(p.ox, p.oy); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + spin * 0.004;
      const r = 70 * (1 - t) + 10;
      ctx.strokeStyle = "rgba(201,243,106,.8)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.ox + Math.cos(a) * r, p.oy + Math.sin(a) * r);
      ctx.lineTo(p.ox + Math.cos(a) * (r - 14), p.oy + Math.sin(a) * (r - 14)); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(127,200,194,.45)"; ctx.beginPath(); ctx.arc(p.ox, p.oy, 10 + 22 * t, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fbf7df"; ctx.beginPath(); ctx.arc(p.ox, p.oy, 4 + 10 * t, 0, Math.PI * 2); ctx.fill();
    return;
  }
  if (p.kind === "vortex") {
    ctx.strokeStyle = "rgba(30,78,72,.5)"; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.arc(p.x, p.y, VORTEX_RANGE, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    const pet = h.pet();
    if (pet && Math.hypot(pet.x - p.x, pet.y - p.y) <= VORTEX_RANGE) {
      ctx.strokeStyle = "rgba(239,112,88,.8)"; ctx.lineWidth = 2; ctx.setLineDash([2, 6]);
      ctx.beginPath(); ctx.moveTo(pet.x, pet.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]);
    }
    const rot = spin * 0.006;
    for (let arm = 0; arm < 4; arm++) {
      ctx.strokeStyle = arm % 2 ? "rgba(127,200,194,.9)" : "rgba(30,78,72,.85)";
      ctx.lineWidth = 5 - arm * 0.6;
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) {
        const f = k / 24;
        const r = (12 + 130 * f) * (1 - 0.35 * t);
        const a = rot + arm * Math.PI / 2 + f * 3.4;
        const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
        if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = "#173536"; ctx.beginPath(); ctx.arc(p.x, p.y, 10 + 8 * t, 0, Math.PI * 2); ctx.fill();
    return;
  }
  const top = p.bolt[0];
  ctx.fillStyle = "rgba(30,78,72,.75)";
  for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.ellipse(top.x + i * 26, top.y - 6 - (i ? 0 : 6), 30, 14, 0, 0, Math.PI * 2); ctx.fill(); }
  const r = 72 - 48 * t;
  ctx.strokeStyle = "#ef7058"; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(p.x - r - 10, p.y); ctx.lineTo(p.x - r + 8, p.y); ctx.moveTo(p.x + r - 8, p.y); ctx.lineTo(p.x + r + 10, p.y); ctx.stroke();
  ctx.setLineDash([3, 6]); ctx.strokeStyle = "rgba(244,208,111,.7)";
  ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(p.x, p.y); ctx.stroke();
}

function drawRelease(ctx: CanvasRenderingContext2D, p: Power, q: number, still: boolean) {
  const fade = 1 - q;
  ctx.globalAlpha = fade;
  if (p.kind === "beam") {
    const dx = p.x - p.ox, dy = p.y - p.oy, d = Math.hypot(dx, dy) || 1;
    const ex = p.ox + dx / d * 2400, ey = p.oy + dy / d * 2400;
    ctx.lineCap = "round";
    ([[38, "rgba(127,200,194,.5)"], [18, "#c9f36a"], [6, "#fbf7df"]] as const).forEach(([w, c]) => {
      ctx.strokeStyle = c; ctx.lineWidth = w * (0.4 + 0.6 * fade);
      ctx.beginPath(); ctx.moveTo(p.ox, p.oy); ctx.lineTo(ex, ey); ctx.stroke();
    });
    return;
  }
  if (p.kind === "vortex") {
    ctx.strokeStyle = "#7fc8c2"; ctx.lineWidth = 8 * fade + 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, 20 + (VORTEX_RANGE + 40) * (still ? 0.6 : q), 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#1e4e48"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, 10 + VORTEX_RANGE * 0.6 * (still ? 0.4 : q), 0, Math.PI * 2); ctx.stroke();
    return;
  }
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ([[10, "#ef7058"], [4.5, "#f4d06f"], [1.6, "#fffbe8"]] as const).forEach(([w, c]) => {
    ctx.strokeStyle = c; ctx.lineWidth = w;
    ctx.beginPath(); p.bolt.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y))); ctx.stroke();
  });
  ctx.strokeStyle = "#f4d06f"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(p.x, p.y, 18 + 90 * (still ? 0.5 : q), 0, Math.PI * 2); ctx.stroke();
  if (!still) {
    ctx.fillStyle = "#f4d06f";
    p.sparks.forEach((s) => {
      const dist = s.s * 70 * q;
      ctx.fillRect(p.x + Math.cos(s.a) * dist - 2, p.y + Math.sin(s.a) * dist - 2, 4, 4);
    });
  }
}
