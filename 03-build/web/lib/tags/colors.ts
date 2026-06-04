/**
 * Tag colors. The 10 hues mirror --av-1..--av-10 in app/globals.css so tag
 * chips sit in the same earthy palette as avatars. We store the resolved hex
 * on the tag row (theme-independent) and blend toward the active theme's ink
 * at render time so chips stay legible in both light and dark mode.
 */
export const TAG_PALETTE = [
  "#8b4a1f", // burnt umber
  "#5a7a3a", // moss
  "#a8841f", // mustard
  "#9c4828", // clay
  "#3e5e5a", // deep teal-earth
  "#722f3a", // plum
  "#6e8a6a", // sage
  "#5a4a3c", // slate-brown
  "#876522", // brass
  "#4a5e2c", // deep olive
] as const;

/** Next palette color for a new tag, cycling so early tags are visually distinct. */
export function nextTagColor(existingCount: number): string {
  return TAG_PALETTE[existingCount % TAG_PALETTE.length];
}

/** Trim and collapse whitespace; preserve case for display. */
export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * Inline chip colors derived from a tag's stored hue. color-mix keeps the hue
 * recognizable while blending the text toward --ink for contrast in either theme.
 */
export function tagChipStyle(hue: string | null): {
  background: string;
  color: string;
} {
  if (!hue) {
    return { background: "var(--stone-sunken)", color: "var(--ink-muted)" };
  }
  return {
    background: `color-mix(in srgb, ${hue} 16%, transparent)`,
    color: `color-mix(in srgb, ${hue} 62%, var(--ink))`,
  };
}
