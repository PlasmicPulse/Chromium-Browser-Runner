import { Bomb, CircleDot, Dog, Hammer, type LucideIcon } from "lucide-react";

export type GadgetTool = "foam" | "mallet" | "airstrike" | "stick";
export type GadgetPoint = { x: number; y: number };

export const GADGETS: { id: GadgetTool; label: string; icon: LucideIcon; short: string; help: string }[] = [
  {
    id: "foam", label: "Foam blaster", icon: CircleDot,
    short: "Aim and fire soft foam balls.",
    help: "Click or tap anywhere to fire a foam ball from the launcher at the bottom. Hit Pip to send them tumbling away. Arrow keys aim, Enter fires.",
  },
  {
    id: "mallet", label: "Pillow mallet", icon: Hammer,
    short: "Give Pip a soft pillow bop.",
    help: "Click or tap Pip to bop them with a pillow. They flatten for a moment, then spring right back. Enter bops from the keyboard.",
  },
  {
    id: "airstrike", label: "Toy airstrike", icon: Bomb,
    short: "Drop a confetti popper near Pip.",
    help: "Click or tap a spot to drop a toy popper. If Pip is inside the dashed ring they ricochet around the screen. Arrow keys aim, Enter drops.",
  },
  {
    id: "stick", label: "Fetch stick", icon: Dog,
    short: "Throw a stick for Pip to retrieve.",
    help: "Tap where the stick should land, or drag and release to fling it. Pip runs over, picks it up and brings it back. Arrow keys aim, Enter throws.",
  },
];
