import { useEffect, type CSSProperties } from "react";

export type WallImpact = { x: number; y: number; nx: number; ny: number; id: number };

/** Cosmetic debris only: the screen and Pip remain intact. */
export function PetImpact({ impact }: { impact: WallImpact }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Shake the display and chrome, not a parent of fixed-position pet controls.
    const animations = Array.from(document.querySelectorAll<HTMLElement>(".viewport-frame, .browser-brandline, .toolbar")).map((element) =>
      element.animate([
        { translate: "0 0" },
        { translate: `${impact.nx * 4 + 1}px ${impact.ny * 4 - 1}px` },
        { translate: "-3px 2px" },
        { translate: "2px -2px" },
        { translate: "-1px 1px" },
        { translate: "0 0" },
      ], { duration: 260, easing: "ease-out" }),
    );
    return () => animations.forEach((animation) => animation.cancel());
  }, [impact]);

  const normalAngle = Math.atan2(impact.ny, impact.nx);
  return (
    <div className="pet-impact" style={{ left: impact.x, top: impact.y }} data-testid="effect-pet-wall-impact" aria-hidden="true">
      <span className="pet-impact-dust" />
      {Array.from({ length: 22 }, (_, index) => {
        const angle = normalAngle + ((index * 0.618 % 1) - 0.5) * 2.7;
        const distance = 28 + (index * 31 % 83);
        const size = 3 + index % 5;
        const style = {
          "--debris-x": `${Math.cos(angle) * distance}px`,
          "--debris-y": `${Math.sin(angle) * distance + 24}px`,
          "--debris-spin": `${(index % 2 ? 1 : -1) * (120 + index * 37)}deg`,
          "--debris-delay": `${index % 4 * 12}ms`,
          width: size,
          height: size * (index % 3 === 0 ? 1.5 : 0.8),
          background: ["#d5c9ae", "#8f9896", "#e7e5dc", "#677573"][index % 4],
        } as CSSProperties;
        return <i key={index} className="pet-wall-particle" style={style} />;
      })}
    </div>
  );
}
