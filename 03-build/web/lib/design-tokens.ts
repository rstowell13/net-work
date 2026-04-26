/**
 * Design tokens — single source of truth: 02-design/DESIGN_SYSTEM.md
 * Mirrored in app/globals.css as CSS custom properties.
 *
 * Use the CSS variables (var(--brass)) in styles.
 * Use these TS constants when computing colors at runtime (e.g. SVG strokes
 * derived from a freshness band, deterministic avatar color from a contact ID).
 */

// Light surfaces / ink (the dark theme overrides live in CSS)
export const colors = {
  stone: "#f7f4ec",
  stoneRaised: "#ffffff",
  stoneSunken: "#ece9e0",
  ink: "#1c1813",
  inkMuted: "#544a3c",
  inkFaint: "#9d9382",
  rule: "#e6dfd1",
  brass: "#876522",
  brassDeep: "#5e4715",
  brassSoft: "#ece2c0",
  sage: "#6e8a6a",
  madder: "#b14228",
  freshGreen: "#5a7a3a",
  fadingYellow: "#a8841f",
  coldRed: "#9c4828",
} as const;

// 10-color earthy avatar palette, ordered av-1..av-10
export const avatarPalette = [
  "#8b4a1f", // 1 burnt umber
  "#5a7a3a", // 2 moss
  "#a8841f", // 3 mustard
  "#9c4828", // 4 clay
  "#3e5e5a", // 5 deep teal-earth
  "#722f3a", // 6 plum
  "#6e8a6a", // 7 sage
  "#5a4a3c", // 8 slate-brown
  "#876522", // 9 brass
  "#4a5e2c", // 10 deep olive
] as const;

// Freshness bands (0-100 score, inclusive ranges)
export type FreshnessBand =
  | "fresh"
  | "warm"
  | "fading"
  | "cold"
  | "dormant";

export const freshnessBands: Record<
  FreshnessBand,
  { label: string; color: string; min: number; max: number }
> = {
  fresh: { label: "Fresh", color: colors.freshGreen, min: 80, max: 100 },
  warm: { label: "Warm", color: colors.freshGreen, min: 60, max: 79 },
  fading: { label: "Fading", color: colors.fadingYellow, min: 35, max: 59 },
  cold: { label: "Cold", color: colors.coldRed, min: 15, max: 34 },
  dormant: { label: "Dormant", color: colors.coldRed, min: 0, max: 14 },
};

export function freshnessBand(score: number): FreshnessBand {
  if (score >= 80) return "fresh";
  if (score >= 60) return "warm";
  if (score >= 35) return "fading";
  if (score >= 15) return "cold";
  return "dormant";
}

// Motion tokens (durations + easing curves) — mirrored from globals.css
export const motion = {
  fast: "120ms cubic-bezier(0.16, 1, 0.3, 1)",
  base: "200ms cubic-bezier(0.22, 1, 0.36, 1)",
  slow: "320ms cubic-bezier(0.19, 1, 0.22, 1)",
  page: "420ms cubic-bezier(0.19, 1, 0.22, 1)",
} as const;
