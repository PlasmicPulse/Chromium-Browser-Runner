import { useEffect, useRef, useState } from "react";

export type StickPos = { x: number; y: number };
const TOP = 80, BOTTOM = 60, SIDE = 24;

export function clampStick(x: number, y: number): StickPos {
  const w = window.innerWidth, h = window.innerHeight;
  return {
    x: Math.max(SIDE, Math.min(Math.max(SIDE, w - SIDE), x)),
    y: Math.max(Math.min(TOP, h / 2), Math.min(Math.max(TOP, h - BOTTOM), y)),
  };
}

type Props = {
  name: string;
  pos: StickPos;
  carried: boolean;
  reduced: boolean;
  onMove: (pos: StickPos) => void;
  onGrab: (pos: StickPos) => void;
  onLanded: (pos: StickPos) => void;
};

// A persistent stick prop: drag to move, flick to throw, Enter to toss from the keyboard.
export function FetchStick({ name, pos, carried, reduced, onMove, onGrab, onLanded }: Props) {
  const cb = useRef({ onMove, onLanded }); cb.current = { onMove, onLanded };
  const drag = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number; lx: number; ly: number; lt: number; vx: number; vy: number; moved: boolean } | null>(null);
  const raf = useRef<number | null>(null);
  const [flying, setFlying] = useState(false);
  const [rot, setRot] = useState(-12);

  const stopFlight = () => {
    if (raf.current !== null) window.cancelAnimationFrame(raf.current);
    raf.current = null;
    setFlying(false);
  };
  useEffect(() => () => { if (raf.current !== null) window.cancelAnimationFrame(raf.current); }, []);

  const fly = (from: StickPos, vx: number, vy: number) => {
    stopFlight();
    const cap = 28;
    let sx = Math.max(-cap, Math.min(cap, vx)), sy = Math.max(-cap, Math.min(cap, vy));
    if (reduced) {
      const land = clampStick(from.x + sx * 14, from.y + sy * 14);
      cb.current.onMove(land);
      cb.current.onLanded(land);
      return;
    }
    let x = from.x, y = from.y, r = rot, prev = performance.now();
    const started = prev;
    setFlying(true);
    const frame = (now: number) => {
      const k = Math.min(2, Math.max(0.5, (now - prev) / 16.67));
      prev = now;
      x += sx * k; y += sy * k;
      sx *= Math.pow(0.95, k); sy *= Math.pow(0.95, k);
      r += Math.hypot(sx, sy) * 1.6 * k;
      const c = clampStick(x, y);
      if (c.x !== x) sx *= -0.55;
      if (c.y !== y) sy *= -0.55;
      x = c.x; y = c.y;
      cb.current.onMove(c);
      setRot(r);
      if (Math.hypot(sx, sy) > 0.6 && now - started < 1600) raf.current = window.requestAnimationFrame(frame);
      else { raf.current = null; setFlying(false); cb.current.onLanded(c); }
    };
    raf.current = window.requestAnimationFrame(frame);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    stopFlight();
    onGrab(pos);
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, lx: e.clientX, ly: e.clientY, lt: e.timeStamp, vx: 0, vy: 0, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    e.stopPropagation();
    const mx = e.clientX - d.sx, my = e.clientY - d.sy;
    if (!d.moved && Math.hypot(mx, my) < 4) return;
    d.moved = true;
    const dt = Math.max(1, e.timeStamp - d.lt);
    d.vx = d.vx * 0.4 + (e.clientX - d.lx) / dt * 0.6;
    d.vy = d.vy * 0.4 + (e.clientY - d.ly) / dt * 0.6;
    d.lx = e.clientX; d.ly = e.clientY; d.lt = e.timeStamp;
    onMove(clampStick(d.ox + mx, d.oy + my));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    e.stopPropagation();
    drag.current = null;
    const stale = e.timeStamp - d.lt > 90;
    const speed = Math.hypot(d.vx, d.vy);
    const here = clampStick(d.ox + e.clientX - d.sx, d.oy + e.clientY - d.sy);
    if (d.moved && !stale && speed > 0.45) fly(here, d.vx * 16, d.vy * 16);
    else onMove(here);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const step = e.shiftKey ? 48 : 16;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) { e.preventDefault(); onGrab(pos); onMove(clampStick(pos.x + moves[e.key][0], pos.y + moves[e.key][1])); return; }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onGrab(pos);
      // Throw toward the roomier side of the screen.
      const dir = pos.x < window.innerWidth / 2 ? 1 : -1;
      fly(pos, dir * 20, (pos.y < window.innerHeight / 2 ? 1 : -1) * 9);
    }
  };

  return (
    <button
      type="button"
      className={`pet-stick${flying ? " is-flying" : ""}${carried ? " is-carried" : ""}`}
      style={{ transform: `translate3d(${pos.x - 22}px, ${pos.y - 11}px, 0) rotate(${carried ? -18 : rot}deg)` }}
      aria-label={`Fetch stick. Drag to move it, flick it to throw for ${name}, or press Enter to throw. Arrow keys nudge it.`}
      title="Drag to move. Flick to throw for a game of fetch."
      data-testid="toy-pet-stick"
      data-state={carried ? "carried" : flying ? "flying" : "resting"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onKeyDown={onKeyDown}
      onKeyUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <svg viewBox="0 0 44 22" aria-hidden="true" focusable="false">
        <path d="M4 12h36M27 12l7-7M15 12l-4 6" stroke="#6f5233" strokeWidth="6" strokeLinecap="round" fill="none" />
        <path d="M4 12h36M27 12l7-7" stroke="#b08a5a" strokeWidth="3" strokeLinecap="round" fill="none" />
      </svg>
    </button>
  );
}
