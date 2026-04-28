import { bandColor, type FreshnessResult } from "@/lib/scoring/freshness";

const SIZES = {
  sm: { w: 36, r: 15, sw: 3, fs: 11 },
  md: { w: 64, r: 27, sw: 5, fs: 17 },
  lg: { w: 96, r: 40, sw: 6, fs: 24 },
} as const;

export function FreshnessRing({
  result,
  size = "md",
}: {
  result: FreshnessResult;
  size?: keyof typeof SIZES;
}) {
  const s = SIZES[size];
  const circ = 2 * Math.PI * s.r;
  const p = result.band === "unknown" ? 0 : result.score / 100;
  const color = bandColor(result.band);
  return (
    <div
      style={{
        width: s.w,
        height: s.w,
        position: "relative",
      }}
    >
      <svg
        width={s.w}
        height={s.w}
        style={{ transform: "rotate(-90deg)" }}
        viewBox={`0 0 ${s.w} ${s.w}`}
      >
        <circle
          cx={s.w / 2}
          cy={s.w / 2}
          r={s.r}
          fill="none"
          stroke="var(--rule)"
          strokeWidth={s.sw}
        />
        <circle
          cx={s.w / 2}
          cy={s.w / 2}
          r={s.r}
          fill="none"
          stroke={color}
          strokeWidth={s.sw}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ - circ * p}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: s.fs,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.01em",
          color: result.band === "unknown" ? "var(--ink-faint)" : "var(--ink)",
        }}
      >
        {result.band === "unknown" ? "—" : result.score}
      </div>
    </div>
  );
}
