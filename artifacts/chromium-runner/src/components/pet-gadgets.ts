import { Bomb, CircleDot, CloudLightning, Hammer, Tornado, Zap, type LucideIcon } from "lucide-react";

export type GadgetTool = "foam" | "mallet" | "airstrike" | "beam" | "vortex" | "lightning";
export type PowerTool = "beam" | "vortex" | "lightning";
export type GadgetPoint = { x: number; y: number };

type Gadget = { id: GadgetTool; group: "toy" | "power"; label: string; icon: LucideIcon; short: string; help: string };

export const GADGETS: Gadget[] = [
  {
    id: "foam", group: "toy", label: "Foam blaster", icon: CircleDot,
    short: "Aim and fire soft foam balls.",
    help: "Click or tap anywhere to fire a foam ball from the launcher at the bottom. Hit Pip to send them tumbling away. Arrow keys aim, Enter fires.",
  },
  {
    id: "mallet", group: "toy", label: "Pillow mallet", icon: Hammer,
    short: "Bop Pip with a soft pillow.",
    help: "The pillow follows your pointer. Click or tap Pip to bop them, as fast as you like. Enter bops from the keyboard.",
  },
  {
    id: "airstrike", group: "toy", label: "Toy airstrike", icon: Bomb,
    short: "Drop a confetti popper near Pip.",
    help: "Click or tap a spot to drop a toy popper. If Pip is inside the dashed ring they ricochet around the screen. Arrow keys aim, Enter drops.",
  },
  {
    id: "beam", group: "power", label: "Spirit beam", icon: Zap,
    short: "Charge and fire a focused energy beam.",
    help: "Click or tap to charge at the bottom emitter, then the beam fires along the dotted line. Anything on the line gets pushed hard. Arrow keys aim, Enter fires.",
  },
  {
    id: "vortex", group: "power", label: "Gravity well", icon: Tornado,
    short: "Open a swirling well that slings Pip.",
    help: "Click or tap to open a gravity well. If Pip is inside the ring when it collapses, they get slung into orbit. Arrow keys aim, Enter opens.",
  },
  {
    id: "lightning", group: "power", label: "Sky bolt", icon: CloudLightning,
    short: "Call a bolt down onto a marked spot.",
    help: "Click or tap to mark a spot. A bolt comes down a moment later and launches Pip if they are close. Arrow keys aim, Enter calls it.",
  },
];

export const POWER_IDS: PowerTool[] = ["beam", "vortex", "lightning"];
export const isPower = (tool: GadgetTool | null): tool is PowerTool => !!tool && (POWER_IDS as string[]).includes(tool);
