import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { GADGETS, type GadgetPoint, type GadgetTool } from "./pet-gadgets";
import "./pet-gadgets.css";

type Props = {
  tool: GadgetTool;
  name: string;
  reduced: boolean;
  getPetRect: () => DOMRect | null;
  onBallHit: (vx: number, vy: number) => void;
  onBonk: () => void;
  onBlast: (x: number, y: number) => boolean;
  onStickThrown: (to: GadgetPoint) => void;
  onCancel: () => void;
};

type Ball = { x: number; y: number; vx: number; vy: number; born: number; hit: boolean; fx?: number; fy?: number; still?: boolean };
type Particle = { a: number; s: number; size: number; color: string; spin: number };
type Blast = { x: number; y: number; born: number; fired: boolean; parts: Particle[] };
type Stick = { from: GadgetPoint; to: GadgetPoint; born: number };

const MAX_BALLS = 6, MAX_BLASTS = 3, BLAST_RANGE = 150, DROP_MS = 380, BOOM_MS = 750, STICK_MS = 650;
const COLORS = ["#ef7058", "#f4d06f", "#c9f36a", "#7fc8c2", "#f3a6b8"];
const origin = (): GadgetPoint => ({ x: window.innerWidth / 2, y: window.innerHeight - 46 });

export function PetGadgetLayer(props: Props) {
  const { tool, name, reduced } = props;
  const cb = useRef(props); cb.current = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const aim = useRef<GadgetPoint>({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const down = useRef<GadgetPoint | null>(null);
  const balls = useRef<Ball[]>([]);
  const blasts = useRef<Blast[]>([]);
  const sticks = useRef<Stick[]>([]);
  const [mallet, setMallet] = useState<{ x: number; y: number; id: number } | null>(null);
  const [status, setStatus] = useState("");
  const bonkTimer = useRef<number | undefined>(undefined);
  const burstTimer = useRef<number | undefined>(undefined);
  const [burst, setBurst] = useState<{ x: number; y: number; id: number } | null>(null);
  const info = GADGETS.find((g) => g.id === tool)!;
  const Icon = info.icon;

  useEffect(() => { overlayRef.current?.focus({ preventScroll: true }); setStatus(""); }, [tool]);
  useEffect(() => () => {
    window.clearTimeout(bonkTimer.current);
    window.clearTimeout(burstTimer.current);
  }, []);

  const fire = (to: GadgetPoint) => {
    const o = origin();
    const dx = to.x - o.x, dy = to.y - o.y, d = Math.hypot(dx, dy) || 1;
    if (cb.current.reduced) {
      // Still feedback: a fixed dotted trajectory, hit test against the straight line.
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
    setMallet({ x: at.x, y: at.y, id: performance.now() });
    const r = cb.current.getPetRect();
    const hit = !!r && at.x >= r.left - 12 && at.x <= r.right + 12 && at.y >= r.top - 12 && at.y <= r.bottom + 12;
    window.clearTimeout(bonkTimer.current);
    if (hit) bonkTimer.current = window.setTimeout(() => cb.current.onBonk(), cb.current.reduced ? 0 : 130);
    setStatus(hit ? `Pillow bop. ${name} flattens, then springs back.` : `Whiff. Click right on ${name}.`);
  };

  const strike = (at: GadgetPoint) => {
    const parts = Array.from({ length: 22 }, (_, i) => ({
      a: Math.random() * Math.PI * 2, s: 2 + Math.random() * 4.5, size: 3 + Math.random() * 4,
      color: COLORS[i % COLORS.length], spin: (Math.random() - 0.5) * 0.3,
    }));
    blasts.current = [...blasts.current, { x: at.x, y: at.y, born: performance.now() - (cb.current.reduced ? DROP_MS : 0), fired: false, parts }].slice(-MAX_BLASTS);
  };

  const throwStick = (to: GadgetPoint) => {
    const safe = { x: Math.max(24, Math.min(window.innerWidth - 24, to.x)), y: Math.max(90, Math.min(window.innerHeight - 70, to.y)) };
    if (cb.current.reduced) {
      cb.current.onStickThrown(safe);
      setStatus(`${name} trots off to fetch the stick.`);
      return;
    }
    sticks.current = [{ from: origin(), to: safe, born: performance.now() }];
    setStatus("Stick away.");
  };

  const act = (at: GadgetPoint, dragFrom?: GadgetPoint | null) => {
    if (tool === "foam") fire(at);
    else if (tool === "mallet") bonk(at);
    else if (tool === "airstrike") strike(at);
    else {
      const moved = dragFrom && Math.hypot(at.x - dragFrom.x, at.y - dragFrom.y) > 24;
      throwStick(moved ? { x: at.x + (at.x - dragFrom!.x) * 0.8, y: at.y + (at.y - dragFrom!.y) * 0.8 } : at);
    }
  };
  const actRef = useRef(act); actRef.current = act;

  // Keyboard: Escape exits; arrows aim; Enter/Space fires. Only while a tool is active.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cb.current.onCancel(); return; }
      const target = e.target as HTMLElement | null;
      if (target?.closest(".gadget-toolbar") || target?.closest(".pet-drawer") || target?.tagName === "INPUT") return;
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
          const r = cb.current.getPetRect();
          if (r) actRef.current({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
        } else actRef.current(aim.current);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [tool]);

  // One canvas draws every projectile and effect; all collections are capped.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0;
    let prev = performance.now();
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

      // Aim guides
      if (currentTool !== "mallet") {
        ctx.save();
        ctx.strokeStyle = "rgba(239,112,88,.85)"; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
        if (currentTool === "foam" || currentTool === "stick") {
          ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(a.x, a.y); ctx.stroke();
          ctx.setLineDash([]); ctx.fillStyle = "#1e4e48";
          ctx.beginPath(); ctx.roundRect(o.x - 20, o.y - 10, 40, 26, 9); ctx.fill();
          ctx.fillStyle = "#c9f36a"; ctx.beginPath(); ctx.arc(o.x, o.y, 6, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.strokeStyle = "rgba(30,78,72,.55)";
          ctx.beginPath(); ctx.arc(a.x, a.y, BLAST_RANGE, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.setLineDash([]); ctx.strokeStyle = "#ef7058"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(a.x, a.y, 11, 0, Math.PI * 2);
        ctx.moveTo(a.x - 17, a.y); ctx.lineTo(a.x - 6, a.y); ctx.moveTo(a.x + 6, a.y); ctx.lineTo(a.x + 17, a.y);
        ctx.moveTo(a.x, a.y - 17); ctx.lineTo(a.x, a.y - 6); ctx.moveTo(a.x, a.y + 6); ctx.lineTo(a.x, a.y + 17);
        ctx.stroke();
        ctx.restore();
      }

      // Foam balls
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
        ctx.save(); ctx.globalAlpha = b.hit ? Math.max(0, 1 - (age % 2600) / 2600) : 1;
        drawBall(ctx, b.x, b.y); ctx.restore();
        return true;
      });

      // Toy airstrikes
      blasts.current = blasts.current.filter((bl) => {
        // An input event can arrive after this RAF timestamp was sampled.
        // Clamp the age so a just-created effect never has negative radii.
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

      // Thrown stick
      sticks.current = sticks.current.filter((st) => {
        const t = Math.max(0, Math.min(1, (now - st.born) / STICK_MS));
        const x = st.from.x + (st.to.x - st.from.x) * t;
        const y = st.from.y + (st.to.y - st.from.y) * t - Math.sin(Math.PI * t) * 130;
        drawStick(ctx, x, y, t * Math.PI * 4);
        if (t >= 1) {
          cb.current.onStickThrown(st.to);
          setStatus(`${cb.current.name} is off to fetch the stick.`);
          return false;
        }
        return true;
      });

      raf = window.requestAnimationFrame(draw);
    };
    raf = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(raf);
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
      onPointerDown={(e) => { e.stopPropagation(); if (e.button !== 0) return; down.current = point(e); aim.current = point(e); e.currentTarget.setPointerCapture?.(e.pointerId); }}
      onPointerMove={(e) => { e.stopPropagation(); aim.current = point(e); }}
      onPointerUp={(e) => { e.stopPropagation(); if (!down.current) return; const from = down.current; down.current = null; act(point(e), from); }}
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
      {mallet && (
        <span key={mallet.id} className={`gadget-mallet${reduced ? " is-still" : ""}`} style={{ left: mallet.x, top: mallet.y }} aria-hidden="true" data-testid="effect-pet-mallet"
          onAnimationEnd={() => setMallet(null)}>
          <svg viewBox="0 0 70 70" width="70" height="70">
            <path d="M33 64 46 30" stroke="#8a6a43" strokeWidth="6" strokeLinecap="round" />
            <rect x="22" y="4" width="46" height="30" rx="13" transform="rotate(20 45 19)" fill="#f3a6b8" stroke="#b9677c" strokeWidth="3" />
            <path d="M31 14q12 8 30 10" stroke="#fbe2e8" strokeWidth="3" strokeLinecap="round" fill="none" />
          </svg>
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
      {reduced && mallet && <span className="gadget-still-note" style={{ left: mallet.x, top: mallet.y }} aria-hidden="true" />}
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
export function drawStick(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.strokeStyle = "#8a6a43"; ctx.lineCap = "round"; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(18, 0); ctx.moveTo(4, 0); ctx.lineTo(11, -7); ctx.stroke();
  ctx.restore();
}
