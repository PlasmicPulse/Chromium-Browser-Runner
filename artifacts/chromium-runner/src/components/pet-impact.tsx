import { useEffect, useRef } from "react";

export type WallImpact = { x: number; y: number; nx: number; ny: number; id: number; speed: number };

const SIZE = 180;
const COLORS = ["#d5c9ae", "#8f9896", "#e7e5dc", "#677573"];

/** Canvas keeps a wall collision to one animated element instead of dozens of DOM nodes. */
export function PetImpact({ impact }: { impact: WallImpact }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRect = document.querySelector<HTMLElement>(".remote-viewport")?.getBoundingClientRect()
    ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
  const effectX = Math.min(viewportRect.right, Math.max(viewportRect.left, impact.x));
  const effectY = Math.min(viewportRect.bottom, Math.max(viewportRect.top, impact.y));
  const left = Math.min(Math.max(0, window.innerWidth - SIZE), Math.max(0, effectX - SIZE / 2));
  const top = Math.min(Math.max(0, window.innerHeight - SIZE), Math.max(0, effectY - SIZE / 2));

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = SIZE * ratio;
    canvas.height = SIZE * ratio;
    context.scale(ratio, ratio);

    const x = effectX - left;
    const y = effectY - top;
    const along = Math.atan2(impact.ny, impact.nx);
    const intensity = Math.min(1, Math.max(0, (impact.speed - 2) / 22));
    const particleCount = Math.min(30, 8 + Math.round(intensity * 22));
    const particles = Array.from({ length: particleCount }, (_, index) => {
      const angle = along + (Math.random() - 0.5) * 2.15;
      const speed = (0.6 + intensity * 3.8) * (0.65 + Math.random() * 0.7);
      return {
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.35,
        size: Math.min(8, 1.5 + intensity * 4.8 + Math.random() * (1 + intensity * 2)),
        spin: (Math.random() - 0.5) * 0.22,
        angle: Math.random() * Math.PI,
        color: COLORS[index % COLORS.length],
      };
    });
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clipLeft = Math.max(0, viewportRect.left - left);
    const clipTop = Math.max(0, viewportRect.top - top);
    const clipRight = Math.min(SIZE, viewportRect.right - left);
    const clipBottom = Math.min(SIZE, viewportRect.bottom - top);
    if (clipRight <= clipLeft || clipBottom <= clipTop) return;
    context.beginPath();
    context.rect(clipLeft, clipTop, clipRight - clipLeft, clipBottom - clipTop);
    context.clip();

    // Animate the content, plus one small browser viewport shake.
    const shake = reduceMotion
      ? null
      : document.querySelector<HTMLElement>(".remote-viewport")?.animate([
          { translate: "0 0" },
          { translate: `${impact.nx * (1 + intensity * 10)}px ${impact.ny * (1 + intensity * 10)}px` },
          { translate: `${-impact.nx * intensity * 3}px ${impact.ny * intensity * 2}px` },
          { translate: `${impact.nx * intensity * 1.5}px ${-impact.ny * intensity * 1.5}px` },
          { translate: "0 0" },
        ], { duration: 150 + intensity * 180, easing: "ease-out" });

    if (reduceMotion) {
      context.fillStyle = "rgba(205, 200, 182, .28)";
      context.beginPath();
      context.arc(x, y, 4 + intensity * 10, 0, Math.PI * 2);
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

      const radius = 4 + intensity * 8 + progress * (12 + intensity * 42);
      const dust = context.createRadialGradient(x, y, 1, x, y, radius);
      dust.addColorStop(0, `rgba(225,220,204,${(0.12 + intensity * 0.28) * (1 - progress)})`);
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
