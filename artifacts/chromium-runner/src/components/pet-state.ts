import { isPetAppearance, type PetAppearance } from "./pet-appearance";

export const PET_ROOM_BACKGROUNDS = [
  { id: "fern", label: "Fern hollow", swatch: "#d5e1cf" },
  { id: "ocean", label: "Ocean", swatch: "#9fd5df" },
  { id: "cozy", label: "Cozy room", swatch: "#efcfac" },
  { id: "night", label: "Starlight", swatch: "#37476f" },
] as const;
export type PetRoomBackground = typeof PET_ROOM_BACKGROUNDS[number]["id"];
export function isPetRoomBackground(value: unknown): value is PetRoomBackground {
  return PET_ROOM_BACKGROUNDS.some((background) => background.id === value);
}

export const PET_FURNITURE = [
  { id: "plant", label: "Plant", icon: "🌿" },
  { id: "bed", label: "Bed", icon: "🛏️" },
  { id: "toy", label: "Toy", icon: "🪀" },
  { id: "lamp", label: "Lamp", icon: "💡" },
  { id: "window", label: "Window", icon: "🪟" },
  { id: "bowl", label: "Bowl", icon: "🥣" },
] as const;
export type PetFurniture = typeof PET_FURNITURE[number]["id"];
export function isPetFurniture(value: unknown): value is PetFurniture {
  return PET_FURNITURE.some((item) => item.id === value);
}

export type PetStats = { hunger: number; happiness: number; energy: number; hygiene: number };
export type PetState = PetStats & {
  version: 1;
  name: string;
  updatedAt: number;
  resting: boolean;
  appearance: PetAppearance;
  tuckedAway: boolean;
  roomBackground: PetRoomBackground;
  furniture: PetFurniture[];
};
export type PetAction = "feed" | "play" | "rest" | "clean";

export const PET_KEY = "pet-companion:v1";
const MAX_ELAPSED_MS = 1000 * 60 * 60 * 48;
const PER_HOUR = { hunger: 6, happiness: 4, energy: 3.5, hygiene: 3 };
const FLOOR = 8; // no death, stats never fully empty

// Retain fractional changes: rounding every 30-second tick would erase slow decay.
export const clamp = (n: number) => Math.min(100, Math.max(FLOOR, n));

export function defaultPet(now = Date.now()): PetState {
  return {
    version: 1, name: "Pip", hunger: 78, happiness: 82, energy: 71, hygiene: 86,
    updatedAt: now, resting: false, appearance: "hedgehog", tuckedAway: false,
    roomBackground: "fern", furniture: [],
  };
}

export function sanitizeName(s: unknown): string {
  if (typeof s !== "string") return "Pip";
  const t = s.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 20);
  return t || "Pip";
}

function num(v: unknown, fb: number) {
  return typeof v === "number" && Number.isFinite(v) ? clamp(v) : fb;
}

export function validate(raw: unknown, now = Date.now()): PetState {
  const d = defaultPet(now);
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  const t = typeof r.updatedAt === "number" && Number.isFinite(r.updatedAt) && r.updatedAt <= now ? r.updatedAt : now;
  return {
    version: 1,
    name: sanitizeName(r.name),
    hunger: num(r.hunger, d.hunger),
    happiness: num(r.happiness, d.happiness),
    energy: num(r.energy, d.energy),
    hygiene: num(r.hygiene, d.hygiene),
    updatedAt: t,
    resting: r.resting === true,
    appearance: isPetAppearance(r.appearance) ? r.appearance : d.appearance,
    tuckedAway: r.tuckedAway === true,
    roomBackground: isPetRoomBackground(r.roomBackground) ? r.roomBackground : d.roomBackground,
    furniture: Array.isArray(r.furniture) ? [...new Set(r.furniture.filter(isPetFurniture))] : d.furniture,
  };
}

export function decay(p: PetState, now = Date.now()): PetState {
  const ms = Math.min(MAX_ELAPSED_MS, Math.max(0, now - p.updatedAt));
  const h = ms / 3_600_000;
  return {
    ...p,
    hunger: clamp(p.hunger - PER_HOUR.hunger * h),
    happiness: clamp(p.happiness - PER_HOUR.happiness * h),
    energy: clamp(p.resting ? p.energy + 18 * h : p.energy - PER_HOUR.energy * h),
    hygiene: clamp(p.hygiene - PER_HOUR.hygiene * h),
    updatedAt: now,
  };
}

export function apply(p: PetState, a: PetAction): PetState {
  switch (a) {
    case "feed": return { ...p, resting: false, hunger: clamp(p.hunger + 24), hygiene: clamp(p.hygiene - 3) };
    case "play": return { ...p, resting: false, happiness: clamp(p.happiness + 20), energy: clamp(p.energy - 10), hunger: clamp(p.hunger - 5), hygiene: clamp(p.hygiene - 6) };
    case "rest": return { ...p, resting: !p.resting, energy: clamp(p.energy + (p.resting ? 0 : 8)) };
    case "clean": return { ...p, resting: false, hygiene: clamp(p.hygiene + 30), happiness: clamp(p.happiness + 3) };
  }
}

export type Mood = { key: string; label: string; line: string };
export function mood(p: PetState): Mood {
  if (p.resting) return { key: "sleepy", label: "Napping", line: "Curled up in the moss. Tiny snores." };
  const low = Math.min(p.hunger, p.happiness, p.energy, p.hygiene);
  if (low === p.hunger && low < 35) return { key: "hungry", label: "Peckish", line: "Sniffing around for a clover snack." };
  if (low === p.energy && low < 35) return { key: "tired", label: "Drowsy", line: "Eyes are getting heavy. A nap would help." };
  if (low === p.hygiene && low < 35) return { key: "messy", label: "Muddy", line: "Fur is full of leaf bits. Bath time?" };
  if (low === p.happiness && low < 35) return { key: "bored", label: "Bored", line: "Rolling the acorn back and forth, waiting." };
  const avg = (p.hunger + p.happiness + p.energy + p.hygiene) / 4;
  if (avg > 75) return { key: "joy", label: "Delighted", line: "Doing little hops between the ferns." };
  return { key: "calm", label: "Content", line: "Watching the browser tabs with mild interest." };
}

export function load(): { pet: PetState; storage: boolean } {
  try {
    const s = window.localStorage.getItem(PET_KEY);
    return { pet: decay(validate(s ? JSON.parse(s) : null)), storage: true };
  } catch {
    return { pet: defaultPet(), storage: false };
  }
}

export function save(p: PetState): boolean {
  try { window.localStorage.setItem(PET_KEY, JSON.stringify(p)); return true; } catch { return false; }
}

/** Gentle petting: small happiness lift. Caller applies cooldown. */
export function applyPetting(p: PetState): PetState {
  return { ...p, resting: false, happiness: clamp(p.happiness + 2.5) };
}

/** Acorn-chase result: happiness and a little energy from a good run (no penalty for low scores). */
export function applyGame(p: PetState, score: number): PetState {
  const s = Math.max(0, Math.min(40, Math.floor(score)));
  return { ...p, resting: false, happiness: clamp(p.happiness + Math.min(22, 4 + s * 2)), energy: clamp(p.energy + Math.min(8, s * 0.75)), hunger: clamp(p.hunger - 2) };
}
