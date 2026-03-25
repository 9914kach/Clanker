"use client";

import { motion, useReducedMotion } from "framer-motion";

type LeagueRankTextProps = {
  text: string;
  colors: readonly string[];
  className?: string;
};

function rotateColors(colors: readonly string[], startIndex: number): string[] {
  if (colors.length === 0) {
    return [];
  }
  return colors.map((_, index) => colors[(index + startIndex) % colors.length]);
}

export default function LeagueRankText({ text, colors, className }: LeagueRankTextProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const glyphs = Array.from(text);

  if (colors.length === 0) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span aria-label={text} className={className}>
      {glyphs.map((glyph, index) => {
        const staticColor = colors[index % colors.length] ?? "currentColor";
        const animatedColors = rotateColors(colors, index % colors.length);

        return (
          <motion.span
            key={`${glyph}-${index}`}
            aria-hidden="true"
            className="inline-block whitespace-pre"
            initial={{ color: staticColor }}
            animate={reducedMotion ? { color: staticColor } : { color: animatedColors }}
            transition={
              reducedMotion
                ? undefined
                : {
                    duration: 7.5,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "easeInOut",
                    delay: index * 0.06,
                  }
            }
          >
            {glyph === " " ? "\u00A0" : glyph}
          </motion.span>
        );
      })}
    </span>
  );
}
