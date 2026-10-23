import { forwardRef, useCallback, useEffect, useRef, useState } from "react";

const SIZE = 56;
// Keep clear of the address bar (top), the right tools toggle and bottom controls.
const PAD = { top: 76, right: 72, bottom: 92, left: 12 };
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

function bounds() {
  const w = window.innerWidth, h = window.innerHeight;
  const minX = Math.min(PAD.left, Math.max(0, w - SIZE));
  const minY = Math.min(PAD.top, Math.max(0, h - SIZE));
  const maxX = Math.max(minX, w - PAD.right - SIZE);
  const maxY = Math.max(minY, h - PAD.bottom - SIZE);
  return { minX, minY, maxX, maxY };
}
const clampPos = (x: number, y: number) => {
  const b = bounds();
  return { x: Math.min(b.maxX, Math.max(b.minX, x)), y: Math.min(b.maxY, Math.max(b.minY, y)) };
};

type Props = { name: string; moodKey: string; open: boolean; onOpen: () => void };

export const RoamingPet = forwardRef<HTMLButtonElement, Props>(function RoamingPet({ name, moodKey, open, onOpen }, ref) {
  const [pos, setPos] = useState(() => (typeof window === "undefined" ? { x: 16, y: 120 } : clampPos(window.innerWidth - PAD.right - SIZE - 24, window.innerHeight - PAD.bottom - SIZE)));
  const [face, setFace] = useState(1);
  const [hover, setHover] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const [walking, setWalking] = useState(false);
  const drag = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const posRef = useRef(pos); posRef.current = pos;

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const fn = () => setReduced(mq.matches);
    mq.addEventListener?.("change", fn);
    return () => mq.removeEventListener?.("change", fn);
  }, []);

  useEffect(() => {
    const fn = () => setPos((p) => clampPos(p.x, p.y));
    window.addEventListener("resize", fn);
    window.visualViewport?.addEventListener("resize", fn);
    return () => { window.removeEventListener("resize", fn); window.visualViewport?.removeEventListener("resize", fn); };
  }, []);

  const paused = hover || dragging || open || reduced || moodKey === "sleepy";
  useEffect(() => {
    if (paused) { setWalking(false); return; }
    let stopT: number | undefined;
    const id = window.setInterval(() => {
      const b = bounds(), cur = posRef.current;
      const nx = cur.x + (Math.random() - 0.5) * 260, ny = cur.y + (Math.random() - 0.5) * 160;
      const next = { x: Math.min(b.maxX, Math.max(b.minX, nx)), y: Math.min(b.maxY, Math.max(b.minY, ny)) };
      setFace(next.x >= cur.x ? 1 : -1);
      setWalking(true);
      setPos(next);
      window.clearTimeout(stopT);
      stopT = window.setTimeout(() => setWalking(false), 2600);
    }, 6500);
    return () => { window.clearInterval(id); window.clearTimeout(stopT); };
  }, [paused]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const current = clampPos(rect.x, rect.y);
    setPos(current);
    setWalking(false);
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: current.x, oy: current.y, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    e.stopPropagation();
    const mx = e.clientX - d.sx, my = e.clientY - d.sy;
    if (!d.moved && Math.hypot(mx, my) < 6) return;
    if (!d.moved) { d.moved = true; setDragging(true); }
    if (mx) setFace(mx > 0 ? 1 : -1);
    setPos(clampPos(d.ox + mx, d.oy + my));
  };
  const endDrag = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    e.stopPropagation();
    suppressClick.current = d.moved;
    drag.current = null;
    setDragging(false);
  }, []);

  return (
    <div className="roam-layer" data-testid="layer-pet-roam">
      <span id="roam-pet-help" className="pet-live">Press Enter or Space, or tap, to open {name}'s care panel. Drag to move {name} around the screen.</span>
      <button
        ref={ref}
        type="button"
        className={`roam-pet mood-${moodKey}${walking ? " is-walking" : ""}${dragging ? " is-dragging" : ""}${open ? " is-open" : ""}`}
        style={{ transform: `translate3d(${pos.x}px, ${pos.y}px, 0)` }}
        aria-label={`${name} the moss-hedgehog. Open care panel`}
        aria-describedby="roam-pet-help"
        aria-expanded={open}
        title={`${name} - click to care, drag to move`}
        data-testid="button-pet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onMouseDown={stop} onTouchStart={stop} onKeyDown={stop} onKeyUp={stop}
        onPointerEnter={event => {
          const rect = event.currentTarget.getBoundingClientRect();
          setPos(clampPos(rect.x, rect.y)); setWalking(false); setHover(true);
        }}
        onPointerLeave={event => setHover(document.activeElement === event.currentTarget)}
        onFocus={event => {
          const rect = event.currentTarget.getBoundingClientRect();
          setPos(clampPos(rect.x, rect.y)); setWalking(false); setHover(true);
        }}
        onBlur={() => setHover(false)}
        onClick={(e) => { e.stopPropagation(); const ignore = suppressClick.current && e.detail > 0; suppressClick.current = false; if (!ignore) onOpen(); }}
      >
        <span className="roam-shadow" aria-hidden="true" />
        <svg className="roam-body" viewBox="0 0 64 56" aria-hidden="true" style={{ ["--face" as string]: face }}>
          <g className="roam-bob">
            <path d="M6 44 Q4 14 30 10 Q52 10 56 36 L58 44Z" fill="#567c6c" />
            <g fill="#3f6556"><path d="M10 26 l4 -9 l4 9z" /><path d="M18 18 l4 -9 l4 9z" /><path d="M27 15 l4 -9 l4 9z" /><path d="M36 16 l4 -8 l4 9z" /></g>
            <path d="M34 44 Q36 22 50 24 Q62 28 60 40 Q56 46 34 44Z" fill="#f2e6cf" />
            <circle cx="62" cy="36" r="2.4" fill="#b76845" />
            {moodKey === "sleepy" ? <path d="M48 32 q3 2 6 0" stroke="#293b3d" strokeWidth="1.8" fill="none" strokeLinecap="round" /> : <><circle cx="51" cy="31" r="2.6" fill="#293b3d" /><circle cx="52" cy="30" r=".9" fill="#fff8ec" /></>}
            <circle cx="46" cy="38" r="3" fill="#e9a990" opacity=".6" />
            <ellipse className="roam-foot a" cx="18" cy="46" rx="5" ry="3" fill="#3f6556" />
            <ellipse className="roam-foot b" cx="44" cy="46" rx="5" ry="3" fill="#3f6556" />
          </g>
        </svg>
        <span className="roam-tag" aria-hidden="true">{name}</span>
      </button>
    </div>
  );
});
