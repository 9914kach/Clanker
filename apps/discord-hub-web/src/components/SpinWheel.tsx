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

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export type SpinWheelProps = {
  participants: readonly string[];
  rotationDeg: number;
  highlightIndex: number | null;
  spinning: boolean;
  onAnimationComplete?: () => void;
};

function SpinWheelInner(props: SpinWheelProps) {
  const { participants, rotationDeg, highlightIndex, spinning, onAnimationComplete } = props;

  const slices = Math.max(1, participants.length);
  const r = 164;
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
    <div className="relative mx-auto w-full max-w-[26rem] select-none">
      <div className="pointer-events-none absolute left-1/2 top-1.5 z-10 -translate-x-1/2">
        <div className="h-0 w-0 border-x-[12px] border-b-[20px] border-x-transparent border-b-primary drop-shadow" />
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
                <feDropShadow dx="0" dy="8" stdDeviation="10" floodOpacity="0.22" />
              </filter>
            </defs>

            <circle cx={cx} cy={cy} r={r + 10} fill="var(--card)" filter="url(#hubWheelShadow)" />

            <g>
              {segments.map((seg) => (
                <path
                  key={seg.i}
                  d={seg.path}
                  fill={seg.fill}
                  opacity={highlightIndex === null ? 0.95 : highlightIndex === seg.i ? 1 : 0.45}
                  stroke="var(--background)"
                  strokeWidth={2}
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
                      fill="var(--background)"
                      fontSize={12}
                      fontWeight={600}
                      transform={shouldFlip ? "rotate(180)" : undefined}
                      style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.18)", strokeWidth: 1.5 }}
                    >
                      {seg.label.length > 18 ? `${seg.label.slice(0, 18)}…` : seg.label}
                    </text>
                  </g>
                );
              })}
            </g>

            <circle cx={cx} cy={cy} r={52} fill="var(--card)" opacity={0.9} />
            <circle cx={cx} cy={cy} r={46} fill="var(--background)" opacity={0.5} />
            <circle cx={cx} cy={cy} r={34} fill="var(--card)" opacity={0.95} />
          </svg>
        </motion.div>

        <div className="absolute inset-0 rounded-full ring-1 ring-border" />
      </div>
    </div>
  );
}

const SpinWheel = memo(SpinWheelInner);
export default SpinWheel;

