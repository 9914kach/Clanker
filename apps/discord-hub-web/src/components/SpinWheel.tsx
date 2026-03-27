import { motion } from "framer-motion";
import { memo, useMemo } from "react";

function polarToCartesian(cx: number, cy: number, r: number, angleRad: number) {
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function wedgePath(params: {
  cx: number;
  cy: number;
  r: number;
  startRad: number;
  endRad: number;
}) {
  const { cx, cy, r, startRad, endRad } = params;
  const p1 = polarToCartesian(cx, cy, r, startRad);
  const p2 = polarToCartesian(cx, cy, r, endRad);
  const largeArc = endRad - startRad > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${p1.x} ${p1.y} A ${r} ${r} 0 ${largeArc} 1 ${p2.x} ${p2.y} Z`;
}

const COLORS = ["#7dd3fc", "#60a5fa", "#34d399", "#fbbf24", "#fb7185", "#a78bfa", "#f97316"];

export type SpinWheelProps = {
  participants: readonly string[];
  rotationDeg: number;
  highlightIndex: number | null;
  spinning: boolean;
  onAnimationComplete?: () => void;
  className?: string;
};

function SpinWheelInner(props: SpinWheelProps) {
  const { participants, rotationDeg, highlightIndex, spinning, onAnimationComplete, className } = props;

  const slices = Math.max(1, participants.length);
  const r = 176;
  const cx = 200;
  const cy = 200;

  const segments = useMemo(() => {
    const sliceRad = (2 * Math.PI) / slices;
    const startBase = -Math.PI / 2;
    return participants.map((label, i) => {
      const startRad = startBase + i * sliceRad;
      const endRad = startBase + (i + 1) * sliceRad;
      const midRad = (startRad + endRad) / 2;
      return {
        i,
        label,
        path: wedgePath({ cx, cy, r, startRad, endRad }),
        midRad,
        fill: COLORS[i % COLORS.length]!,
      };
    });
  }, [participants, slices]);

  return (
    <div
      className={[
        "relative mx-auto w-full select-none",
        className ?? "max-w-[26rem]",
      ].join(" ")}
    >
      <div className="pointer-events-none absolute left-1/2 top-1 z-10 -translate-x-1/2">
        <div
          className="h-0 w-0 border-x-[16px] border-b-[28px] border-x-transparent drop-shadow-[0_12px_28px_rgba(15,23,42,0.45)]"
          style={{ borderBottomColor: "#e5f0ff" }}
        />
      </div>

      <div className="relative aspect-square w-full">
        <motion.div
          className="absolute inset-0"
          animate={{ rotate: rotationDeg }}
          transition={{
            duration: spinning ? 2.8 : 0.35,
            ease: spinning ? [0.12, 0.92, 0.18, 1] : "easeOut",
          }}
          style={{ transformOrigin: "50% 50%" }}
          onAnimationComplete={onAnimationComplete}
        >
          <svg viewBox="0 0 400 400" className="h-full w-full">
            <defs>
              <filter id="hubWheelShadow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="18" stdDeviation="18" floodColor="#020617" floodOpacity="0.4" />
              </filter>
              <radialGradient id="hubWheelCore" cx="50%" cy="45%" r="65%">
                <stop offset="0%" stopColor="#1e293b" />
                <stop offset="65%" stopColor="#0f172a" />
                <stop offset="100%" stopColor="#020617" />
              </radialGradient>
              <linearGradient id="hubWheelRim" x1="0%" x2="100%" y1="0%" y2="100%">
                <stop offset="0%" stopColor="#eff6ff" stopOpacity="0.96" />
                <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.7" />
              </linearGradient>
            </defs>

            <circle cx={cx} cy={cy} r={r + 18} fill="#020617" opacity={0.78} filter="url(#hubWheelShadow)" />
            <circle cx={cx} cy={cy} r={r + 10} fill="#07111f" />
            <circle cx={cx} cy={cy} r={r + 5} fill="none" stroke="url(#hubWheelRim)" strokeOpacity="0.45" strokeWidth={3} />

            <g>
              {segments.map((seg) => (
                <path
                  key={seg.i}
                  d={seg.path}
                  fill={seg.fill}
                  opacity={highlightIndex === null ? 0.95 : highlightIndex === seg.i ? 1 : 0.45}
                  stroke="#08111d"
                  strokeWidth={2.5}
                />
              ))}
            </g>

            <g>
              {segments.map((seg) => {
                const angleDeg = (seg.midRad * 180) / Math.PI;
                const shouldFlip = angleDeg > 90 && angleDeg < 270;
                const rotate = shouldFlip ? angleDeg + 180 : angleDeg;
                return (
                  <g
                    key={`t-${seg.i}`}
                    transform={`translate(${cx} ${cy}) rotate(${rotate}) translate(0 ${-r * 0.62})`}
                    opacity={highlightIndex === null ? 1 : highlightIndex === seg.i ? 1 : 0.5}
                  >
                    <text
                      x={0}
                      y={0}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#08111d"
                      fontSize={12}
                      fontWeight={700}
                      transform={shouldFlip ? "rotate(180)" : undefined}
                      style={{ paintOrder: "stroke", stroke: "rgba(241,245,249,0.4)", strokeWidth: 1.2 }}
                    >
                      {seg.label.length > 18 ? `${seg.label.slice(0, 18)}...` : seg.label}
                    </text>
                  </g>
                );
              })}
            </g>

            <circle cx={cx} cy={cy} r={52} fill="#020617" opacity={0.92} />
            <circle cx={cx} cy={cy} r={46} fill="url(#hubWheelCore)" opacity={0.95} />
            <circle cx={cx} cy={cy} r={34} fill="#0f172a" opacity={0.95} />
            <circle cx={cx} cy={cy} r={24} fill="#020617" opacity={0.82} />
          </svg>
        </motion.div>

        <div className="absolute inset-0 rounded-full ring-1 ring-white/10" />
      </div>
    </div>
  );
}

const SpinWheel = memo(SpinWheelInner);
export default SpinWheel;
