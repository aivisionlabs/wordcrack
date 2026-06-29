import { useMemo } from "react";
import { motion } from "motion/react";

const CONFETTI_COLORS = [
  "#16a34a",
  "#1a73e8",
  "#d97706",
  "#ec4899",
  "#8b5cf6",
  "#f59e0b",
];

interface ConfettiBurstProps {
  /** Number of confetti pieces. */
  count?: number;
  /** Max radial distance (px) a piece travels from the centre. */
  spread?: number;
}

/**
 * A subtle, self-contained radial confetti burst. Renders an absolutely
 * positioned overlay (fill a `relative` parent) whose pieces fly outward from
 * the centre and fade. Mount a fresh instance (e.g. via a changing `key`) each
 * time you want it to fire.
 */
export default function ConfettiBurst({
  count = 20,
  spread = 150,
}: ConfettiBurstProps) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
        const dist = spread * (0.5 + Math.random() * 0.5);
        return {
          id: i,
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist - 20, // slight upward bias
          rotate: Math.random() * 540 - 270,
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          size: 6 + Math.round(Math.random() * 5),
          delay: Math.random() * 0.08,
        };
      }),
    [count, spread],
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center overflow-hidden">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-[1px]"
          style={{ width: p.size, height: p.size, backgroundColor: p.color }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
          animate={{
            x: p.dx,
            y: p.dy,
            opacity: 0,
            scale: 0.5,
            rotate: p.rotate,
          }}
          transition={{
            duration: 1.2,
            ease: [0.2, 0.7, 0.3, 1],
            delay: p.delay,
          }}
        />
      ))}
    </div>
  );
}
