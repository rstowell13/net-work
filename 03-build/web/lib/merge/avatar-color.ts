/**
 * Deterministic ID → av-1..av-10 hash. Temporary home for M4; M5 will move
 * this to a shared lib/avatar-color.ts and unit-test the distribution.
 */
export function avatarColorVar(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return `var(--av-${(h % 10) + 1})`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return "··";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "··";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
