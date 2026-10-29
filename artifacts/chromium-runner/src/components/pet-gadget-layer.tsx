import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { GADGETS, isPower, type GadgetPoint, type GadgetTool, type PowerTool } from "./pet-gadgets";
import { spawnPower, stepPower, VORTEX_RANGE, type Power } from "./pet-powers";
import "./pet-gadgets.css";

type Props = {
  tool: GadgetTool;
  name: string;
  reduced: boolean;
  getPetRect: () => DOMRect | null;
  onBallHit: (vx: number, vy: number) => void;
  onBonk: () => void;
  onBlast: (x: number, y: number) => boolean;
  onKnock: (vx: number, vy: number, mode: "toss" | "pinball") => void;
  onCancel: () => void;
};

type Ball = { x: number; y: number; vx: number; vy: number; born: number; hit: boolean; fx?: number; fy?: number; still?: boolean };
type Particle = { a: number; s: number; size: number; color: string; spin: number };
type Blast = { x: number; y: number; born: number; fired: boolean; parts: Particle[] };
type Ring = { x: number; y: number; born: number; hit: boolean };

const MAX_BALLS = 6, MAX_BLASTS = 3, MAX_RINGS = 6, BLAST_RANGE = 150, DROP_MS = 380, BOOM_MS = 750;
const COLORS = ["#ef7058", "#f4d06f", "#c9f36a", "#7fc8c2", "#f3a6b8"];
const origin = (): GadgetPoint => ({ x: window.innerWidth / 2, y: window.innerHeight - 46 });
const POWER_TEXT: Record<PowerTool, [string, string]> = {
  beam: ["Direct hit. The spirit beam drives {n} back.", "The beam misses. Re-align on {n}."],
  vortex: ["The well collapses and slings {n} outward.", "{n} was beyond the well's reach."],
  lightning: ["Sky bolt lands. {n} is launched upward.", "The bolt misses; {n} was beyond the impact zone."],
};

export function PetGadgetLayer(props: Props) {
  const { tool, name, reduced } = props;
  const cb = useRef(props); cb.current = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const malletRef = useRef<HTMLSpanElement>(null);
  const aim = useRef<GadgetPoint>({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const down = useRef<GadgetPoint | null>(null);
  const balls = useRef<Ball[]>([]);
  const blasts = useRef<Blast[]>([]);
  const powers = useRef<Power[]>([]);
  const rings = useRef<Ring[]>([]);
  const [swing, setSwing] = useState(0);
  const [status, setStatus] = useState("");
  const bonkTimer = useRef<number | undefined>(undefined);
  const burstTimer = useRef<number | undefined>(undefined);
  const [burst, setBurst] = useState<{ x: number; y: number; id: number } | null>(null);
  const info = GADGETS.find((g) => g.id === tool)!;
  const Icon = info.icon;

  const petCenter = () => {
    const r = cb.current.getPetRect();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2, r: r.width / 2 } : null;
  };
  const placeMallet = (at: GadgetPoint, visible = true) => {
    const el = malletRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${at.x}px, ${at.y}px, 0)`;
    el.style.opacity = visible ? "1" : "0";
  };

  useEffect(() => {
    overlayRef.current?.focus({ preventScroll: true });
    setStatus("");
    if (tool === "mallet") {
      const p = petCenter();
      placeMallet(p ?? aim.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);
  useEffect(() => () => {
    window.clearTimeout(bonkTimer.current);
    window.clearTimeout(burstTimer.current);
  }, []);

  const fire = (to: GadgetPoint) => {
    const o = origin();
    const dx = to.x - o.x, dy = to.y - o.y, d = Math.hypot(dx, dy) || 1;
    if (cb.current.reduced) {
      const r = cb.current.getPetRect();
      let hit = false;
      if (r) {
        const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
        const t = Math.max(0, Math.min(1, ((cx - o.x) * dx + (cy - o.y) * dy) / (d * d)));
        hit = Math.hypot(o.x + dx * t - cx, o.y + dy * t - cy) < r.width / 2 + 9;
        if (hit) cb.current.onBallHit(dx / d * 16, dy / d * 16);
      }
      balls.current = [...balls.current, { x: o.x, y: o.y, vx: 0, vy: 0, born: performance.now(), hit, fx: to.x, fy: to.y, still: true }].slice(-MAX_BALLS);
      setStatus(hit ? `Direct hit. ${name} scoots away.` : "Missed. Try aiming closer.");
      return;
    }
    balls.current = [...balls.current, { x: o.x, y: o.y, vx: dx / d * 17, vy: dy / d * 17 - 1.5, born: performance.now(), hit: false }].slice(-MAX_BALLS);
  };

  const bonk = (at: GadgetPoint) => {
    placeMallet(at);
    setSwing((n) => n + 1);
    const r = cb.current.getPetRect();
    const hit = !!r && at.x >= r.left - 16 && at.x <= r.right + 16 && at.y >= r.top - 16 && at.y <= r.bottom + 16;
    rings.current = [...rings.current, { x: at.x, y: at.y, born: performance.now() + (cb.current.reduced ? 0 : 90), hit }].slice(-MAX_RINGS);
    window.clearTimeout(bonkTimer.current);
    if (hit) bonkTimer.current = window.setTimeout(() => cb.current.onBonk(), cb.current.reduced ? 0 : 90);
    setStatus(hit ? `Pillow bop. ${name} flattens, then springs back.` : `Whiff. Swing right on ${name}.`);
  };

  const strike = (at: GadgetPoint) => {
    const parts = Array.from({ length: 22 }, (_, i) => ({
      a: Math.random() * Math.PI * 2, s: 2 + Math.random() * 4.5, size: 3 + Math.random() * 4,
      color: COLORS[i % COLORS.length], spin: (Math.random() - 0.5) * 0.3,
    }));
    blasts.current = [...blasts.current, { x: at.x, y: at.y, born: performance.now() - (cb.current.reduced ? DROP_MS : 0), fired: false, parts }].slice(-MAX_BLASTS);
  };

  const act = (at: GadgetPoint) => {
    if (tool === "foam") fire(at);
    else if (tool === "mallet") bonk(at);
    else if (tool === "airstrike") strike(at);
    else if (isPower(tool)) {
      powers.current = [...powers.current, spawnPower(tool, at, origin(), performance.now())];
      setStatus(tool === "beam" ? "Spirit beam charging." : tool === "vortex" ? "Gravity well forming." : "Sky bolt charging.");
    }
  };
  const actRef = useRef(act); actRef.current = act;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cb.current.onCancel(); return; }
      const target = e.target as HTMLElement | null;
      if (target?.closest(".gadget-toolbar") || target?.closest(".pet-drawer") || target?.closest(".pet-chase-alert") || target?.tagName === "INPUT") return;
      const step = e.shiftKey ? 64 : 24;
      const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (moves[e.key]) {
        e.preventDefault(); e.stopPropagation();
        aim.current = {
          x: Math.max(10, Math.min(window.innerWidth - 10, aim.current.x + moves[e.key][0])),
          y: Math.max(80, Math.min(window.innerHeight - 20, aim.current.y + moves[e.key][1])),
        };
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault(); e.stopPropagation();
        if (tool === "mallet") {
          const p = petCenter();
          if (p) actRef.current({ x: p.x, y: p.y });
        } else actRef.current(aim.current);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0;
    let prev = performance.now();
    const hooks = {
      pet: petCenter,
      knock: (vx: number, vy: number, mode: "toss" | "pinball") => cb.current.onKnock(vx, vy, mode),
      report: (kind: PowerTool, hit: boolean) => setStatus(POWER_TEXT[kind][hit ? 0 : 1].replace("{n}", cb.current.name)),
    };
    const draw = (now: number) => {
      const s = Math.min(2, Math.max(0.5, (now - prev) / 16.67));
      prev = now;
      const w = window.innerWidth, h = window.innerHeight, ratio = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
        canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const still = cb.current.reduced;
      const currentTool = cb.current.tool;
      const a = aim.current, o = origin();

      if (currentTool !== "mallet") {
        ctx.save();
        if (currentTool === "beam") {
          const dx = a.x - o.x, dy = a.y - o.y, d = Math.hypot(dx, dy) || 1;
          const nx = -dy / d, ny = dx / d;
          ctx.globalAlpha = 0.42; ctx.strokeStyle = "#9bdde0"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(a.x, a.y); ctx.stroke();
          ctx.globalAlpha = 0.36; ctx.strokeStyle = "#68c2ca"; ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(o.x + nx * 8, o.y + ny * 8); ctx.lineTo(a.x + nx * 8, a.y + ny * 8);
          ctx.moveTo(o.x - nx * 8, o.y - ny * 8); ctx.lineTo(a.x - nx * 8, a.y - ny * 8);
          ctx.stroke();
          ctx.globalAlpha = 0.8; ctx.fillStyle = "#dffeff";
          ctx.beginPath(); ctx.arc(o.x, o.y, 6, 0, Math.PI * 2); ctx.fill();
        } else if (currentTool === "foam") {
          ctx.strokeStyle = "rgba(239,112,88,.85)"; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
          ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(a.x, a.y); ctx.stroke();
          ctx.setLineDash([]); ctx.fillStyle = "#1e4e48";
          ctx.beginPath(); ctx.roundRect(o.x - 20, o.y - 10, 40, 26, 9); ctx.fill();
          ctx.fillStyle = "#c9f36a"; ctx.beginPath(); ctx.arc(o.x, o.y, 6, 0, Math.PI * 2); ctx.fill();
        } else if (currentTool === "vortex") {
          ctx.strokeStyle = "rgba(130,151,217,.3)"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(a.x, a.y, VORTEX_RANGE, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = "rgba(165,184,244,.8)"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(a.x, a.y, VORTEX_RANGE - 5, 0, Math.PI * 2); ctx.stroke();
        } else if (currentTool === "lightning") {
          ctx.strokeStyle = "rgba(226,174,95,.36)"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, 64); ctx.lineTo(a.x, a.y - 28); ctx.stroke();
          ctx.strokeStyle = "rgba(241,197,118,.5)"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(a.x, a.y, 52, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.arc(a.x, a.y, 46, 0, Math.PI * 2); ctx.stroke();
        } else if (currentTool === "airstrike") {
          ctx.strokeStyle = "rgba(30,78,72,.55)";
          ctx.beginPath(); ctx.arc(a.x, a.y, BLAST_RANGE, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.strokeStyle = currentTool === "beam" ? "#dffeff" : currentTool === "vortex" ? "#bbc9ff" : currentTool === "lightning" ? "#ffe1a5" : "#ef7058";
        ctx.lineWidth = currentTool === "beam" || currentTool === "vortex" || currentTool === "lightning" ? 1.8 : 2.5;
        ctx.beginPath(); ctx.arc(a.x, a.y, 11, 0, Math.PI * 2);
        ctx.moveTo(a.x - 17, a.y); ctx.lineTo(a.x - 6, a.y); ctx.moveTo(a.x + 6, a.y); ctx.lineTo(a.x + 17, a.y);
        ctx.moveTo(a.x, a.y - 17); ctx.lineTo(a.x, a.y - 6); ctx.moveTo(a.x, a.y + 6); ctx.lineTo(a.x, a.y + 17);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      balls.current = balls.current.filter((b) => {
        const age = Math.max(0, now - b.born);
        if (b.still) {
          if (age > 800) return false;
          ctx.save(); ctx.globalAlpha = 1 - age / 800;
          ctx.strokeStyle = "#f4d06f"; ctx.lineWidth = 3; ctx.setLineDash([3, 8]);
          ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.fx!, b.fy!); ctx.stroke();
          drawBall(ctx, b.fx!, b.fy!); ctx.restore();
          return true;
        }
        b.x += b.vx * s; b.y += b.vy * s; b.vy += 0.14 * s;
        if (!b.hit) {
          const r = cb.current.getPetRect();
          if (r && Math.hypot(b.x - (r.x + r.width / 2), b.y - (r.y + r.height / 2)) < r.width / 2 + 9) {
            b.hit = true;
            cb.current.onBallHit(b.vx, b.vy);
            setStatus(`Direct hit. ${cb.current.name} tumbles away.`);
            b.vx *= -0.35; b.vy = -4;
          }
        }
        if (age > 2600 || b.y > h + 30 || b.x < -30 || b.x > w + 30) return false;
        ctx.save(); ctx.globalAlpha = b.hit ? Math.max(0, 1 - age / 2600) : 1;
        drawBall(ctx, b.x, b.y); ctx.restore();
        return true;
      });

      blasts.current = blasts.current.filter((bl) => {
        const age = Math.max(0, now - bl.born);
        if (age < DROP_MS) {
          const t = age / DROP_MS;
          const y = bl.y - 260 * (1 - t * t);
          ctx.fillStyle = "#1e4e48"; ctx.beginPath(); ctx.arc(bl.x, y, 9, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#f4d06f"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bl.x, y - 9); ctx.quadraticCurveTo(bl.x + 6, y - 15, bl.x + 3, y - 19); ctx.stroke();
          ctx.fillStyle = "rgba(30,78,72,.2)"; ctx.beginPath(); ctx.ellipse(bl.x, bl.y, 12 * t, 4 * t, 0, 0, Math.PI * 2); ctx.fill();
          return true;
        }
        if (!bl.fired) {
          bl.fired = true;
          setBurst({ x: bl.x, y: bl.y, id: now });
          window.clearTimeout(burstTimer.current);
          burstTimer.current = window.setTimeout(() => setBurst(null), 1500);
          const hit = cb.current.onBlast(bl.x, bl.y);
          setStatus(hit ? `${cb.current.name} ricochets around the screen.` : `${cb.current.name} was out of range and watches the confetti.`);
        }
        const life = still ? 900 : BOOM_MS;
        const p = (age - DROP_MS) / life;
        if (p >= 1) return false;
        if (still) {
          ctx.save(); ctx.globalAlpha = 0.9;
          ctx.strokeStyle = "#ef7058"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(bl.x, bl.y, 60, 0, Math.PI * 2); ctx.stroke();
          drawStar(ctx, bl.x, bl.y, 28, 12, "#f4d06f"); ctx.restore();
          return true;
        }
        const e = 1 - Math.pow(1 - p, 3);
        ctx.save();
        ctx.globalAlpha = 1 - p;
        ctx.fillStyle = "#fff3c4"; ctx.beginPath(); ctx.arc(bl.x, bl.y, 18 + 40 * e * (1 - p), 0, Math.PI * 2); ctx.fill();
        drawStar(ctx, bl.x, bl.y, 26 + 34 * e, 12 + 10 * e, "#f4d06f");
        ctx.lineWidth = 7 * (1 - p); ctx.strokeStyle = "#ef7058";
        ctx.beginPath(); ctx.arc(bl.x, bl.y, 20 + BLAST_RANGE * e, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 3 * (1 - p); ctx.strokeStyle = "#c9f36a";
        ctx.beginPath(); ctx.arc(bl.x, bl.y, 12 + BLAST_RANGE * 0.7 * e, 0, Math.PI * 2); ctx.stroke();
        const ms = age - DROP_MS;
        bl.parts.forEach((pt) => {
          const dist = pt.s * ms / 16.67 * Math.pow(0.985, ms / 16.67);
          ctx.save();
          ctx.translate(bl.x + Math.cos(pt.a) * dist, bl.y + Math.sin(pt.a) * dist + 0.0009 * ms * ms / 16.67);
          ctx.rotate(pt.spin * ms / 16.67);
          ctx.fillStyle = pt.color; ctx.fillRect(-pt.size / 2, -pt.size / 4, pt.size, pt.size / 2);
          ctx.restore();
        });
        ctx.restore();
        return true;
      });

      powers.current = powers.current.filter((p) => stepPower(ctx, p, now, still, hooks));

      // Pillow impacts: a capped set of soft rings, no DOM particles.
      rings.current = rings.current.filter((r) => {
        const age = Math.max(0, now - r.born);
        const life = still ? 500 : 360;
        if (age >= life) return false;
        if (now < r.born) return true;
        const t = age / life;
        ctx.save();
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = r.hit ? "#f3a6b8" : "rgba(84,113,107,.6)"; ctx.lineWidth = r.hit ? 4 : 2;
        ctx.beginPath(); ctx.ellipse(r.x, r.y + 8, 14 + (still ? 10 : 30 * t), 6 + (still ? 4 : 12 * t), 0, 0, Math.PI * 2); ctx.stroke();
        if (r.hit && !still) {
          ctx.fillStyle = "#fbe2e8";
          for (let i = 0; i < 5; i++) {
            const ang = -Math.PI / 2 + (i - 2) * 0.55;
            ctx.beginPath(); ctx.arc(r.x + Math.cos(ang) * (18 + 26 * t), r.y + Math.sin(ang) * (18 + 26 * t), 3, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.restore();
        return true;
      });

      raf = window.requestAnimationFrame(draw);
    };
    raf = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const point = (e: React.PointerEvent): GadgetPoint => ({ x: e.clientX, y: e.clientY });

  return (
    <div
      ref={overlayRef}
      className={`gadget-overlay tool-${tool}`}
      data-testid="overlay-pet-gadget"
      data-tool={tool}
      tabIndex={-1}
      role="application"
      aria-label={`${info.label} play mode. ${info.help} Press Escape to exit.`}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.button !== 0) return;
        aim.current = point(e);
        if (tool === "mallet") { bonk(point(e)); return; }
        down.current = point(e);
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        aim.current = point(e);
        if (tool === "mallet") placeMallet(point(e), !(e.target as HTMLElement).closest(".gadget-toolbar"));
      }}
      onPointerLeave={() => { if (tool === "mallet") placeMallet(aim.current, false); }}
      onPointerUp={(e) => { e.stopPropagation(); if (!down.current) return; down.current = null; act(point(e)); }}
      onPointerCancel={() => { down.current = null; }}
      onWheel={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} className="gadget-canvas" aria-hidden="true" />
      {burst && (
        <svg key={burst.id} className={`gadget-explosion${reduced ? " is-still" : ""}`}
          style={{ left: burst.x, top: burst.y }} viewBox="0 0 200 200"
          aria-hidden="true" data-testid="effect-pet-airstrike">
          <path d="M100 9 113 45 143 23 139 60 180 54 158 86 195 103 157 119 177 153 137 145 139 183 110 158 94 195 80 158 48 178 53 140 15 144 38 114 5 94 44 80 24 47 63 55 64 18 87 47Z"
            fill="#ef7058" stroke="#b94c36" strokeWidth="3" />
          <path d="m100 36 12 32 30-14-6 31 30 16-31 12 12 31-32-11-16 32-12-31-33 11 14-32-28-16 33-10-9-31 29 13Z"
            fill="#f4d06f" />
          <path d="M65 111a21 21 0 0 1 5-39 22 22 0 0 1 39-9 23 23 0 0 1 34 28 22 22 0 0 1-10 39H76a16 16 0 0 1-11-19Z"
            fill="#fff3d3" stroke="#e5b65a" strokeWidth="3" />
        </svg>
      )}
      {tool === "mallet" && (
        <span ref={malletRef} className="gadget-mallet-cursor" aria-hidden="true" data-testid="cursor-pet-mallet">
          <span key={swing} className={`gadget-mallet-swing${swing && !reduced ? " is-swing" : ""}${swing && reduced ? " is-still" : ""}`} data-testid="effect-pet-mallet">
            <svg viewBox="0 0 70 70" width="70" height="70">
              <path d="M33 64 46 30" stroke="#8a6a43" strokeWidth="6" strokeLinecap="round" />
              <g className="gadget-pillow">
                <rect x="22" y="4" width="46" height="30" rx="13" transform="rotate(20 45 19)" fill="#f3a6b8" stroke="#b9677c" strokeWidth="3" />
                <path d="M31 14q12 8 30 10" stroke="#fbe2e8" strokeWidth="3" strokeLinecap="round" fill="none" />
              </g>
            </svg>
          </span>
        </span>
      )}
      <div className="gadget-toolbar" data-testid="toolbar-pet-gadget"
        onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
        <span className="gadget-toolbar-icon" aria-hidden="true"><Icon size={16} /></span>
        <div className="gadget-toolbar-text">
          <strong data-testid="text-pet-gadget-title">{info.label}</strong>
          <span>{info.help} Esc exits.</span>
          {status && <em role="status" aria-live="polite" data-testid="status-pet-gadget">{status}</em>}
        </div>
        <button type="button" className="gadget-cancel" onClick={() => props.onCancel()} data-testid="button-pet-gadget-cancel" aria-label="Exit toy mode">
          <X size={14} /> Done
        </button>
      </div>
    </div>
  );
}

function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#f4d06f"; ctx.strokeStyle = "#d85c45"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 8, y - 2); ctx.quadraticCurveTo(x, y + 5, x + 8, y - 2); ctx.stroke();
}
function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, outer: number, inner: number, color: string) {
  ctx.fillStyle = color; ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const r = i % 2 ? inner : outer, a = (i / 16) * Math.PI * 2;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath(); ctx.fill();
}
