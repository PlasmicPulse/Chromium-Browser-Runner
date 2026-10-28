import { useEffect, useRef } from "react";

export type WallImpact = { x: number; y: number; nx: number; ny: number; id: number };

const SIZE = 180;
const COLORS = ["#d5c9ae", "#8f9896", "#e7e5dc", "#677573"];

/** Canvas keeps a wall collision to one animated element instead of dozens of DOM nodes. */
export function PetImpact({ impact }: { impact: WallImpact }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const left = Math.min(Math.max(0, window.innerWidth - SIZE), Math.max(0, impact.x - SIZE / 2));
  const top = Math.min(Math.max(0, window.innerHeight - SIZE), Math.max(0, impact.y - SIZE / 2));

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = SIZE * ratio;
    canvas.height = SIZE * ratio;
    context.scale(ratio, ratio);

    const x = impact.x - left;
    const y = impact.y - top;
    const along = Math.atan2(impact.ny, impact.nx);
    const particles = Array.from({ length: 14 }, (_, index) => {
      const angle = along + (Math.random() - 0.5) * 2.15;
      const speed = 1.2 + Math.random() * 2.6;
      return {
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.35,
        size: 2.5 + Math.random() * 4.5,
        spin: (Math.random() - 0.5) * 0.22,
        angle: Math.random() * Math.PI,
        color: COLORS[index % COLORS.length],
      };
    });
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Animate the content, plus one small browser viewport shake.
    const shake = reduceMotion
      ? null
      : document.querySelector<HTMLElement>(".viewport-frame")?.animate([
          { translate: "0 0" },
          { translate: `${impact.nx * 3}px ${impact.ny * 3}px` },
          { translate: "-2px 1px" },
          { translate: "1px -1px" },
          { translate: "0 0" },
        ], { duration: 210, easing: "ease-out" });

    if (reduceMotion) {
      context.fillStyle = "rgba(205, 200, 182, .28)";
      context.beginPath();
      context.arc(x, y, 9, 0, Math.PI * 2);
      context.fill();
      return () => shake?.cancel();
    }

    let frame = 0;
    let started = 0;
    const draw = (now: number) => {
      if (!started) started = now;
      const elapsed = now - started;
      const progress = Math.min(1, elapsed / 680);
      context.clearRect(0, 0, SIZE, SIZE);

      const radius = 7 + progress * 34;
      const dust = context.createRadialGradient(x, y, 1, x, y, radius);
      dust.addColorStop(0, `rgba(225,220,204,${0.3 * (1 - progress)})`);
      dust.addColorStop(1, "rgba(180,185,174,0)");
      context.fillStyle = dust;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();

      particles.forEach((particle) => {
        const drag = Math.pow(0.984, elapsed / 16.7);
        const px = x + particle.vx * elapsed / 16.7 * drag;
        const py = y + particle.vy * elapsed / 16.7 * drag + 0.0018 * elapsed * elapsed / 16.7;
        const alpha = 1 - progress;
        context.save();
        context.globalAlpha = alpha;
        context.translate(px, py);
        context.rotate(particle.angle + particle.spin * elapsed / 16.7);
        context.fillStyle = particle.color;
        context.beginPath();
        context.moveTo(-particle.size, -particle.size * 0.45);
        context.lineTo(particle.size * 0.65, -particle.size);
        context.lineTo(particle.size, particle.size * 0.4);
        context.lineTo(-particle.size * 0.35, particle.size);
        context.closePath();
        context.fill();
        context.restore();
      });

      if (progress < 1) frame = window.requestAnimationFrame(draw);
    };
    frame = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(frame);
      shake?.cancel();
    };
  }, [impact, left, top]);

  return (
    <div className="pet-impact" style={{ left, top }} data-testid="effect-pet-wall-impact" aria-hidden="true">
      <canvas ref={canvasRef} className="pet-impact-canvas" width={SIZE} height={SIZE} />
    </div>
  );
}
