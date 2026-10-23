import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { BedDouble } from "lucide-react";
import { PET_APPEARANCES, PetSprite, type PetAppearance } from "./pet-appearance";

const SIZE = 44;
const BED_SIZE = { width: 88, height: 64 };
const BED_KEY = "pet-bed-position:v1";
// Keep clear of the address bar, the right tools toggle and bottom controls.
const PAD = { top: 76, right: 72, bottom: 92, left: 12 };
type Position = { x: number; y: number };
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

function bounds() {
  const w = window.innerWidth, h = window.innerHeight;
  const minX = Math.min(PAD.left, Math.max(0, w - SIZE));
  const minY = Math.min(PAD.top, Math.max(0, h - SIZE));
  const maxX = Math.max(minX, w - PAD.right - SIZE);
  const maxY = Math.max(minY, h - PAD.bottom - SIZE);
  return { minX, minY, maxX, maxY };
}
const clampPos = (x: number, y: number): Position => {
  const b = bounds();
  return { x: Math.min(b.maxX, Math.max(b.minX, x)), y: Math.min(b.maxY, Math.max(b.minY, y)) };
};

function clampBed(x: number, y: number): Position {
  return {
    x: Math.min(Math.max(8, window.innerWidth - BED_SIZE.width - 8), Math.max(8, x)),
    y: Math.min(Math.max(70, window.innerHeight - BED_SIZE.height - 52), Math.max(70, y)),
  };
}

function readBed(): Position {
  if (typeof window === "undefined") return { x: 16, y: 120 };
  try {
    const raw = localStorage.getItem(BED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Position>;
      if (typeof parsed.x === "number" && Number.isFinite(parsed.x) && typeof parsed.y === "number" && Number.isFinite(parsed.y)) {
        return clampBed(parsed.x, parsed.y);
      }
    }
  } catch { /* Use the default when browser storage is unavailable or corrupt. */ }
  return clampBed(window.innerWidth - BED_SIZE.width - 64, window.innerHeight - BED_SIZE.height - 78);
}

function bedDock(bed: Position): Position {
  return clampPos(bed.x + 21, bed.y + 10);
}

type Props = {
  name: string;
  moodKey: string;
  appearance: PetAppearance;
  tucked: boolean;
  open: boolean;
  onOpen: () => void;
  onToggleTucked: () => void;
  onDropInBed: () => void;
};

export const RoamingPet = forwardRef<HTMLButtonElement, Props>(function RoamingPet(
  { name, moodKey, appearance, tucked, open, onOpen, onToggleTucked, onDropInBed }, ref,
) {
  const [bedPos, setBedPos] = useState<Position>(readBed);
  const bedPosRef = useRef(bedPos);
  bedPosRef.current = bedPos;
  const bedRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState(() => (typeof window === "undefined" ? { x: 16, y: 120 } : clampPos(window.innerWidth * 0.57, window.innerHeight * 0.45)));
  const [face, setFace] = useState(1);
  const [hover, setHover] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [bedDragging, setBedDragging] = useState(false);
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const [walking, setWalking] = useState(false);
  const drag = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const bedDrag = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const suppressBedClick = useRef(false);
  const posRef = useRef(pos); posRef.current = pos;

  const setBed = useCallback((next: Position) => {
    const safe = clampBed(next.x, next.y);
    bedPosRef.current = safe;
    setBedPos(safe);
    try { localStorage.setItem(BED_KEY, JSON.stringify(safe)); } catch { /* The bed remains movable for this session. */ }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const fn = () => setReduced(mq.matches);
    mq.addEventListener?.("change", fn);
    return () => mq.removeEventListener?.("change", fn);
  }, []);

  useEffect(() => {
    const fn = () => {
      const nextBed = clampBed(bedPosRef.current.x, bedPosRef.current.y);
      setBed(nextBed);
      setPos((current) => tucked ? bedDock(nextBed) : clampPos(current.x, current.y));
    };
    window.addEventListener("resize", fn);
    window.visualViewport?.addEventListener("resize", fn);
    return () => { window.removeEventListener("resize", fn); window.visualViewport?.removeEventListener("resize", fn); };
  }, [setBed, tucked]);

  useEffect(() => { if (tucked) setPos(bedDock(bedPos)); }, [bedPos, tucked]);

  const paused = hover || dragging || open || reduced || tucked || moodKey === "sleepy";
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
    const next = clampPos(d.ox + e.clientX - d.sx, d.oy + e.clientY - d.sy);
    const target = bedRef.current?.getBoundingClientRect();
    const centerX = next.x + SIZE / 2, centerY = next.y + SIZE / 2;
    const droppedInBed = d.moved && !!target
      && centerX >= target.left + 5 && centerX <= target.right - 5
      && centerY >= target.top + 5 && centerY <= target.bottom - 5;
    setPos(droppedInBed ? bedDock(bedPosRef.current) : next);
    suppressClick.current = d.moved;
    drag.current = null;
    setDragging(false);
    if (droppedInBed) onDropInBed();
  }, [onDropInBed]);

  const bedPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    bedDrag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: bedPosRef.current.x, oy: bedPosRef.current.y, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const bedPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = bedDrag.current;
    if (!d || d.id !== e.pointerId) return;
    e.stopPropagation();
    const mx = e.clientX - d.sx, my = e.clientY - d.sy;
    if (!d.moved && Math.hypot(mx, my) < 6) return;
    if (!d.moved) { d.moved = true; setBedDragging(true); }
    setBed({ x: d.ox + mx, y: d.oy + my });
  };
  const endBedDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = bedDrag.current;
    if (!d || d.id !== e.pointerId) return;
    e.stopPropagation();
    suppressBedClick.current = d.moved;
    bedDrag.current = null;
    setBedDragging(false);
  };

  const lookLabel = PET_APPEARANCES.find((choice) => choice.id === appearance)?.label ?? "pet";
  return (
    <div className="roam-layer" data-testid="layer-pet-roam">
      <span id="roam-pet-help" className="pet-live">Press Enter or Space, or tap, to open {name}'s care panel. Drag to move {name}. Click the bed or drag {name} into it to stop wandering.</span>
      <button
        ref={bedRef}
        type="button"
        className={`pet-bed${bedDragging ? " is-dragging" : ""}${tucked ? " has-visitor" : ""}`}
        style={{ transform: `translate3d(${bedPos.x}px, ${bedPos.y}px, 0)` }}
        aria-label={tucked ? `Let ${name} out of bed` : `Tuck ${name} into bed`}
        aria-pressed={tucked}
        title="Drag to move the bed; click to tuck the pet in or let them wander."
        data-testid="button-pet-bed"
        onPointerDown={bedPointerDown}
        onPointerMove={bedPointerMove}
        onPointerUp={endBedDrag}
        onPointerCancel={endBedDrag}
        onMouseDown={stop} onTouchStart={stop} onKeyDown={stop} onKeyUp={stop}
        onClick={(e) => { e.stopPropagation(); const ignore = suppressBedClick.current && e.detail > 0; suppressBedClick.current = false; if (!ignore) onToggleTucked(); }}
      >
        <svg viewBox="0 0 88 64" aria-hidden="true" focusable="false">
          <path d="M7 55V21q0-7 8-7h58q8 0 8 7v34" fill="#d5c5a7" stroke="#876b50" strokeWidth="3" strokeLinejoin="round" />
          <path d="M13 32q0-7 8-7h46q8 0 8 7v13H13Z" fill="#ede7d6" stroke="#b39a78" strokeWidth="2" />
          <path d="M17 42q6-13 17-8l8 8m-22 5h43q7 0 9 8H15q0-8 2-8Z" fill="#91aa93" stroke="#64816c" strokeWidth="2" strokeLinejoin="round" />
          <path d="M7 49h8m58 0h8" stroke="#876b50" strokeWidth="4" strokeLinecap="round" />
          <path d="M22 35q4-5 9-1" stroke="#f7f6ee" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="pet-bed-caption"><BedDouble size={11} /> {tucked ? "Tucked in" : "Bed"}</span>
      </button>
      <button
        ref={ref}
        type="button"
        className={`roam-pet mood-${moodKey}${walking ? " is-walking" : ""}${dragging ? " is-dragging" : ""}${open ? " is-open" : ""}${tucked ? " is-tucked" : ""}`}
        style={{ transform: `translate3d(${tucked ? bedDock(bedPos).x : pos.x}px, ${tucked ? bedDock(bedPos).y : pos.y}px, 0)` }}
        aria-label={`${name}, a ${lookLabel}, ${tucked ? "tucked in bed" : "exploring"}. Click to open the care panel`}
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
        <span className="roam-body" style={{ transform: `scaleX(${face})` }}>
          <PetSprite appearance={appearance} sleepy={tucked || moodKey === "sleepy"} className="roam-svg" />
        </span>
        {tucked && <span className="roam-z" aria-hidden="true">z</span>}
        <span className="roam-tag" aria-hidden="true">{name}</span>
      </button>
    </div>
  );
});
