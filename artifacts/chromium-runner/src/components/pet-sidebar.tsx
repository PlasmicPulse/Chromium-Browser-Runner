import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Bath, BedDouble, Carrot, Hand, Moon, Pencil, Sparkles, Timer, X } from "lucide-react";
import { RoamingPet } from "./roaming-pet";
import { PET_APPEARANCES, PetSprite } from "./pet-appearance";
import "./pet-sidebar.css";
import {
  PET_FURNITURE,
  PET_ROOM_BACKGROUNDS,
  apply,
  applyGame,
  applyPetting,
  decay,
  load,
  mood,
  sanitizeName,
  save,
  type PetAction,
  type PetFurniture,
  type PetState,
} from "./pet-state";

const TICK_MS = 30_000;
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

function Habitat({ pet, moodKey, dx = 0, onPet }: { pet: PetState; moodKey: string; dx?: number; onPet?: () => void }) {
  const sleeping = moodKey === "sleepy";
  return (
    <svg viewBox="0 0 320 236" role="img" onClick={onPet} aria-label={`${pet.name} the ${pet.appearance} in ${PET_ROOM_BACKGROUNDS.find((background) => background.id === pet.roomBackground)?.label ?? "a habitat"}`}>
      {pet.roomBackground === "fern" && (
        <>
          <rect width="320" height="236" fill="#e8eedf" />
          <circle cx="262" cy="46" r="22" fill={sleeping ? "#d8dccb" : "#f1d9a8"} />
          <path d="M0 150 Q80 120 160 140 T320 130 V236 H0Z" fill="#cddcc6" />
          <path d="M0 186 Q90 166 170 180 T320 176 V236 H0Z" fill="#b7cbb0" />
          <g fill="#7fa48f" opacity=".8">
            <path d="M30 186 q-6-40 14-62 q-2 30 -6 62z" /><path d="M44 186 q10-34 34-44 q-16 22 -26 44z" />
            <path d="M282 182 q-4-36 16-56 q-4 28 -8 56z" /><path d="M270 182 q-14-26 -36-30 q16 14 28 30z" />
          </g>
          <ellipse cx="236" cy="190" rx="16" ry="12" fill="#c98a52" /><path d="M222 184 q14-12 28 0" fill="#7a5a3a" />
          <rect x="64" y="176" width="34" height="14" rx="7" fill="#e5c9a8" />
        </>
      )}
      {pet.roomBackground === "ocean" && (
        <>
          <rect width="320" height="236" fill="#c9e9ee" />
          <path d="M0 143Q70 126 145 145T320 136V236H0Z" fill="#73bdc5" />
          <path d="M0 190Q80 172 160 190T320 179V236H0Z" fill="#4c9da5" />
          <g fill="none" stroke="#f4ffff" opacity=".72">
            <circle cx="48" cy="56" r="9" /><circle cx="76" cy="92" r="5" /><circle cx="260" cy="73" r="7" /><circle cx="286" cy="112" r="4" />
          </g>
          <g fill="#e88979">
            <path d="M16 183q9-34 18 0q8-42 16 0q9-28 17 0z" /><path d="M264 179q7-38 14 0q8-30 15 0q7-44 14 0z" />
          </g>
          <path d="M0 211Q85 197 160 210T320 202V236H0Z" fill="#e5d2a1" />
        </>
      )}
      {pet.roomBackground === "cozy" && (
        <>
          <rect width="320" height="236" fill="#f2dfc8" />
          <path d="M0 153H320V236H0Z" fill="#c98e68" />
          <path d="M0 162Q80 151 160 162T320 158V236H0Z" fill="#d7a27a" />
          <rect x="25" y="32" width="64" height="56" rx="5" fill="#e8f4ed" stroke="#a9785e" strokeWidth="5" />
          <path d="M57 34V86M28 60H86" stroke="#b58366" strokeWidth="3" />
          <ellipse cx="161" cy="198" rx="86" ry="19" fill="#af7480" opacity=".74" />
          <path d="M0 155H320" stroke="#ad765b" strokeWidth="3" opacity=".5" />
        </>
      )}
      {pet.roomBackground === "night" && (
        <>
          <rect width="320" height="236" fill="#263354" />
          <circle cx="265" cy="47" r="21" fill="#f3e5b3" />
          <circle cx="275" cy="40" r="19" fill="#263354" />
          <g fill="#f6edc9">
            <circle cx="42" cy="43" r="2" /><circle cx="87" cy="77" r="1.5" /><circle cx="145" cy="35" r="2" />
            <circle cx="220" cy="88" r="1.5" /><circle cx="294" cy="98" r="2" /><circle cx="110" cy="111" r="1.3" />
          </g>
          <path d="M0 158Q70 122 138 157T320 147V236H0Z" fill="#485b7c" />
          <path d="M0 190Q95 165 177 190T320 178V236H0Z" fill="#35466a" />
          <ellipse cx="160" cy="201" rx="60" ry="9" fill="#a7bad0" opacity=".32" />
        </>
      )}
      {pet.furniture.includes("window") && pet.roomBackground !== "cozy" && (
        <g>
          <rect x="24" y="28" width="58" height="48" rx="5" fill="#d9f3f0" stroke="#8b765a" strokeWidth="4" />
          <path d="M53 30V74M26 52H80" stroke="#8b765a" strokeWidth="2.5" />
          <path d="M30 69Q52 54 76 69" fill="#a6d1aa" opacity=".8" />
        </g>
      )}
      {pet.furniture.includes("plant") && (
        <g>
          <path d="M42 175Q34 145 46 137Q50 154 51 169Q53 143 69 138Q68 160 55 174Q68 158 81 161Q75 177 56 180Z" fill="#538766" />
          <path d="M39 175H70L66 196H44Z" fill="#bd7959" />
          <path d="M43 179H67" stroke="#e7b18a" strokeWidth="3" />
        </g>
      )}
      {pet.furniture.includes("bed") && (
        <g>
          <rect x="228" y="174" width="66" height="24" rx="10" fill="#9c748a" />
          <rect x="233" y="169" width="56" height="20" rx="9" fill="#e7b9c5" />
          <ellipse cx="261" cy="185" rx="17" ry="7" fill="#f5e8df" />
          <path d="M233 191V198M289 191V198" stroke="#72576b" strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
      {pet.furniture.includes("toy") && (
        <g>
          <circle cx="78" cy="190" r="11" fill="#ef8b64" />
          <path d="M69 188Q78 181 87 188M69 193Q78 199 87 193" fill="none" stroke="#fff0ce" strokeWidth="2" />
        </g>
      )}
      {pet.furniture.includes("lamp") && (
        <g>
          <path d="M279 169V113M268 171H291" stroke="#806a4d" strokeWidth="4" strokeLinecap="round" />
          <path d="M264 114Q279 94 294 114L289 125H269Z" fill="#e4b966" stroke="#9a7951" strokeWidth="2" />
          <circle cx="279" cy="132" r="22" fill="#f8e4a1" opacity=".18" />
        </g>
      )}
      {pet.furniture.includes("bowl") && (
        <g>
          <path d="M257 185H303Q300 202 280 202Q260 201 257 185Z" fill="#76a9b3" />
          <path d="M261 188H299" stroke="#d9f2eb" strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="280" cy="185" rx="23" ry="5" fill="#a8d8d7" />
        </g>
      )}
      {!sleeping && moodKey === "joy" && (
        <g fill="#c98a52"><circle className="pet-spark" cx="108" cy="92" r="3" /><circle className="pet-spark" cx="214" cy="84" r="2.5" /></g>
      )}
      <svg x="96" y="100" width="128" height="112" viewBox="0 0 64 56" className="pet-chase" style={{ transform: `translateX(${dx}px)` }} aria-hidden="true">
        <PetSprite appearance={pet.appearance} sleepy={sleeping} className="pet-critter" />
      </svg>
      {sleeping && <text className="pet-z" x="212" y="104" fill="#5d706c" fontSize="18" fontWeight="800">z</text>}
    </svg>
  );
}

export function PetSidebar() {
  const [open, setOpen] = useState(false);
  const [{ pet, storage }, setBox] = useState(load);
  const [stored, setStored] = useState(storage);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [bounce, setBounce] = useState(false);
  const [notice, setNotice] = useState("");
  const bounceT = useRef<number | undefined>(undefined);
  const petT = useRef(0);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const [hearts, setHearts] = useState(0);
  const [game, setGame] = useState<{ on: boolean; score: number; left: number; ax: number; ay: number; best: number }>({ on: false, score: 0, left: 0, ax: 160, ay: 120, best: 0 });
  const [dx, setDx] = useState(0);
  const scoreRef = useRef(0);

  const update = useCallback((fn: (p: PetState) => PetState) => {
    setBox((b) => {
      const next = fn(decay(b.pet));
      setStored(save(next));
      return { pet: next, storage: b.storage };
    });
  }, []);

  // Decay only ticks while panel is open; elapsed time is caught up via timestamps.
  useEffect(() => {
    if (!open) return;
    update((p) => p);
    const id = window.setInterval(() => update((p) => p), TICK_MS);
    return () => window.clearInterval(id);
  }, [open, update]);

  useEffect(() => () => window.clearTimeout(bounceT.current), []);

  const react = (msg: string) => {
    setNotice(msg);
    setBounce(true);
    window.clearTimeout(bounceT.current);
    bounceT.current = window.setTimeout(() => setBounce(false), 1000);
  };

  const petPip = () => {
    const now = Date.now();
    setHearts((h) => h + 1);
    if (now - petT.current < 4000) { setNotice(`${pet.name} leans into the scratch.`); return; }
    petT.current = now;
    update(applyPetting);
    react(pet.resting ? `${pet.name} snuffles in their sleep and smiles.` : [`${pet.name} gives a tiny happy purr.`, `Happy wiggle. ${pet.name} rolls half over.`, `${pet.name} boops your hand with a damp nose.`][now % 3]);
  };

  const newAcorn = () => ({ ax: 40 + Math.random() * 240, ay: 70 + Math.random() * 110 });
  const startGame = () => {
    if (pet.resting) update((p) => ({ ...p, resting: false }));
    scoreRef.current = 0;
    setGame((g) => ({ ...g, on: true, score: 0, left: 15, ...newAcorn() }));
    setNotice(`Acorn chase! Tap the acorns before ${pet.name} loses interest.`);
  };
  const catchAcorn = () => {
    scoreRef.current += 1;
    setDx(Math.max(-110, Math.min(110, game.ax - 160)));
    setGame((g) => ({ ...g, score: g.score + 1, ...newAcorn() }));
    react(scoreRef.current % 5 === 0 ? `${scoreRef.current} acorns! ${pet.name} is on a roll.` : `Got it! ${pet.name} scurries over.`);
  };
  // Countdown + acorn hops away if not caught.
  useEffect(() => {
    if (!game.on) return;
    const id = window.setInterval(() => {
      setGame((g) => {
        if (!g.on) return g;
        const left = g.left - 1;
        if (left <= 0) return { ...g, on: false, left: 0, best: Math.max(g.best, g.score) };
        return left % 2 === 0 ? { ...g, left, ...newAcorn() } : { ...g, left };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [game.on]);
  const wasOn = useRef(false);
  useEffect(() => {
    if (wasOn.current && !game.on) {
      const s = scoreRef.current;
      update((p) => applyGame(p, s));
      setDx(0);
      react(s === 0 ? `${pet.name} sniffs around. Next round?` : `Round over: ${s} acorn${s === 1 ? "" : "s"}. ${pet.name} is beaming and a bit more awake.`);
    }
    wasOn.current = game.on;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.on]);
  useEffect(() => { if (!open) setGame((g) => (g.on ? { ...g, on: false, left: 0, best: Math.max(g.best, g.score) } : g)); }, [open]);

  const act = (a: PetAction) => {
    update((p) => apply(p, a));
    const msg = { feed: "Crunch crunch. Clover biscuit gone.", play: "Acorn chase! Happy wiggles all round.", rest: pet.resting ? "Stretching awake." : "Settling in for a nap.", clean: "Splash. All clean again." }[a];
    react(msg);
  };

  const toggleBed = () => {
    const tucked = !pet.tuckedAway;
    if (tucked) setGame((g) => g.on ? { ...g, on: false, left: 0, best: Math.max(g.best, g.score) } : g);
    update((p) => ({ ...p, tuckedAway: !p.tuckedAway }));
    react(tucked ? `${pet.name} is tucked in. The roaming has paused.` : `${pet.name} is back out exploring.`);
  };

  const toggleFurniture = (item: PetFurniture) => {
    update((p) => ({
      ...p,
      furniture: p.furniture.includes(item) ? p.furniture.filter((placed) => placed !== item) : [...p.furniture, item],
    }));
  };

  const m = mood(pet);
  const meters: [keyof PetState, string][] = [["hunger", "Fullness"], ["happiness", "Happiness"], ["energy", "Energy"], ["hygiene", "Tidiness"]];

  return (
    <Dialog.Root open={open} onOpenChange={setOpen} modal={false}>
      <RoamingPet
        ref={avatarRef}
        name={pet.name}
        moodKey={m.key}
        appearance={pet.appearance}
        tucked={pet.tuckedAway}
        open={open}
        onOpen={() => setOpen(true)}
        onToggleTucked={toggleBed}
        onDropInBed={() => update((p) => ({ ...p, tuckedAway: true }))}
        onLiftFromBed={() => update((p) => ({ ...p, tuckedAway: false }))}
      />
      <Dialog.Portal>
        <Dialog.Content
          className={`pet-drawer mood-${m.key}${bounce ? " pet-bounce" : ""}`}
          data-testid="panel-pet"
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => { e.preventDefault(); avatarRef.current?.focus({ preventScroll: true }); }}
          onKeyDown={stop} onKeyUp={stop} onKeyPress={stop}
          onPointerDown={stop} onMouseDown={stop} onWheel={stop} onTouchStart={stop}
        >
          <div className="pet-head">
            <div>
              <div className="pet-kicker">Companion</div>
              <Dialog.Title asChild><h2>Fern hollow</h2></Dialog.Title>
            </div>
            <Dialog.Close className="pet-close" aria-label="Close pet companion" data-testid="button-pet-close"><X size={16} /></Dialog.Close>
          </div>
          <div className="pet-body">
             <Dialog.Description className="pet-live">Choose a look and care for your companion. Saved only on this browser.</Dialog.Description>
            <div className={`pet-habitat${game.on ? " is-game" : ""}`}>
              <Habitat pet={pet} moodKey={game.on ? "joy" : m.key} dx={dx} onPet={game.on ? undefined : petPip} />
              {!game.on && <span key={hearts} className={hearts ? "pet-heart" : "pet-heart is-idle"} aria-hidden="true" />}
              {game.on && (
                <button type="button" className="pet-acorn" style={{ left: `${(game.ax / 320) * 100}%`, top: `${(game.ay / 236) * 100}%` }}
                  onClick={catchAcorn} aria-label={`Catch the acorn. Score ${game.score}, ${game.left} seconds left`} data-testid="button-pet-acorn">
                  <svg viewBox="0 0 24 28" aria-hidden="true"><path d="M3 10 Q12 2 21 10 Z" fill="#6b4a2e" /><path d="M12 3 v-3" stroke="#6b4a2e" strokeWidth="2" /><path d="M4 10 h16 q0 14 -8 16 q-8 -2 -8 -16z" fill="#c98a52" /></svg>
                </button>
              )}
              {game.on && <div className="pet-scoreboard" data-testid="status-pet-game"><span>Acorns {game.score}</span><span><Timer size={11} /> {game.left}s</span></div>}
            </div>
            <div className="pet-game-row">
              <button type="button" className="pet-small-btn" onClick={petPip} disabled={game.on} data-testid="button-pet-pet"><Hand size={12} /> Pet</button>
              <button type="button" className="pet-small-btn is-game" onClick={game.on ? () => setGame((g) => ({ ...g, on: false, left: 0, best: Math.max(g.best, g.score) })) : startGame} data-testid="button-pet-game">
                <Sparkles size={12} /> {game.on ? "End chase" : "Acorn chase"}
              </button>
              {game.best > 0 && <span className="pet-best" data-testid="text-pet-best">Best {game.best}</span>}
            </div>
            <p className="pet-hint">Tap {pet.name} in the hollow to pet. In Acorn chase, tap or press Enter on each acorn within 15 seconds; every catch lifts happiness and energy.</p>
            <div className="pet-looks" role="group" aria-label="Choose your pet's look" data-testid="group-pet-appearances">
              {PET_APPEARANCES.map((look) => (
                <button
                  key={look.id}
                  type="button"
                  className={`pet-look${pet.appearance === look.id ? " is-selected" : ""}`}
                  aria-label={`Choose ${look.label}`}
                  aria-pressed={pet.appearance === look.id}
                  onClick={() => { update((p) => ({ ...p, appearance: look.id })); react(`${pet.name} looks like a ${look.label.toLowerCase()} now.`); }}
                  data-testid={`button-pet-look-${look.id}`}
                >
                  <PetSprite appearance={look.id} className="pet-look-sprite" />
                  <span>{look.label}</span>
                </button>
              ))}
            </div>
            <section className="pet-customizer" aria-label="Customize your pet's room" data-testid="panel-pet-customizer">
              <h3>Your habitat</h3>
              <span className="pet-customizer-label">Background</span>
              <div className="pet-room-backgrounds" role="group" aria-label="Choose a room background">
                {PET_ROOM_BACKGROUNDS.map((background) => (
                  <button
                    key={background.id}
                    type="button"
                    className={`pet-room-background${pet.roomBackground === background.id ? " is-selected" : ""}`}
                    aria-label={`Set background to ${background.label}`}
                    aria-pressed={pet.roomBackground === background.id}
                    onClick={() => update((p) => ({ ...p, roomBackground: background.id }))}
                    data-testid={`button-pet-room-${background.id}`}
                  >
                    <span className="pet-room-swatch" style={{ background: background.swatch }} aria-hidden="true" />
                    <span>{background.label}</span>
                  </button>
                ))}
              </div>
              <span className="pet-customizer-label">Furniture &amp; things</span>
              <div className="pet-furniture-grid" role="group" aria-label="Add or remove room items">
                {PET_FURNITURE.map((item) => {
                  const placed = pet.furniture.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`pet-furniture-item${placed ? " is-selected" : ""}`}
                      aria-label={`${placed ? "Remove" : "Add"} ${item.label}`}
                      aria-pressed={placed}
                      onClick={() => toggleFurniture(item.id)}
                      data-testid={`button-pet-furniture-${item.id}`}
                    >
                      <span aria-hidden="true">{item.icon}</span>{item.label}
                    </button>
                  );
                })}
              </div>
            </section>
            <div className="pet-nameplate">
              <span className="pet-name" data-testid="text-pet-name">{pet.name}</span>
              <span className="pet-mood-chip" data-testid="status-pet-mood">{m.label}</span>
            </div>
            <p className="pet-line" role="status" aria-live="polite" data-testid="text-pet-feedback">{notice || m.line}</p>
            {editing ? (
              <form className="pet-edit" onSubmit={(e) => { e.preventDefault(); update((p) => ({ ...p, name: sanitizeName(draft) })); setEditing(false); }}>
                <input aria-label="Pet name" maxLength={20} value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} data-testid="input-pet-name" />
                <button type="submit" className="pet-small-btn" data-testid="button-pet-name-save">Save</button>
              </form>
            ) : (
              <div className="pet-edit">
                <button type="button" className="pet-small-btn" onClick={() => { setDraft(pet.name); setEditing(true); }} data-testid="button-pet-rename"><Pencil size={12} /> Rename</button>
              </div>
            )}
            <div className="pet-meters">
              {meters.map(([k, label]) => {
                const v = Math.round(pet[k] as number);
                return (
                  <label key={k} className={`pet-meter-row${v < 35 ? " is-low" : ""}`}>
                    <span>{label}</span>
                    <progress max={100} value={v} data-testid={`meter-pet-${k}`} />
                    <span>{v}</span>
                  </label>
                );
              })}
            </div>
            <div className="pet-actions">
              <button type="button" className="pet-action" onClick={() => act("feed")} data-testid="button-pet-feed"><Carrot size={15} /> Feed</button>
              <button type="button" className="pet-action" onClick={() => act("play")} data-testid="button-pet-play"><Sparkles size={15} /> Play</button>
              <button type="button" className="pet-action" aria-pressed={pet.resting} onClick={() => act("rest")} data-testid="button-pet-rest"><Moon size={15} /> {pet.resting ? "Wake" : "Rest"}</button>
              <button type="button" className="pet-action" onClick={() => act("clean")} data-testid="button-pet-clean"><Bath size={15} /> Clean</button>
              <button type="button" className="pet-action pet-action-bed" aria-pressed={pet.tuckedAway} onClick={toggleBed} data-testid="button-pet-tuck"><BedDouble size={15} /> {pet.tuckedAway ? "Let wander" : "Tuck into bed"}</button>
            </div>
            <p className="pet-note" data-testid="text-pet-storage">
              {stored
                ? <><strong>Pet saved on this browser only.</strong> {pet.name} lives in local storage, not on the server. Stats drift slowly while you're away, but never hit zero. Required site activity logging still applies.</>
                : <><strong>Storage unavailable.</strong> {pet.name} will be here this session but won't be remembered after reload. Pet state is not sent to the server. Required site activity logging still applies.</>}
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default PetSidebar;
