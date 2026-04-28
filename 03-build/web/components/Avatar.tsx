import { avatarColorVar, initials } from "@/lib/avatar-color";

const SIZES = {
  sm: { w: 28, fs: 11 },
  md: { w: 40, fs: 15 },
  lg: { w: 64, fs: 24 },
  xl: { w: 96, fs: 38 },
} as const;

export function Avatar({
  id,
  name,
  photoUrl,
  size = "md",
}: {
  id: string;
  name: string | null;
  photoUrl?: string | null;
  size?: keyof typeof SIZES;
}) {
  const s = SIZES[size];
  const style: React.CSSProperties = {
    width: s.w,
    height: s.w,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--stone)",
    fontFamily: "var(--font-serif, 'Source Serif 4'), Georgia, serif",
    fontStyle: "italic",
    fontWeight: 500,
    fontSize: s.fs,
    fontVariationSettings: "'opsz' 60",
    background: avatarColorVar(id),
    overflow: "hidden",
    flexShrink: 0,
  };
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name ?? "contact"}
        style={{ ...style, objectFit: "cover" }}
      />
    );
  }
  return <div style={style}>{initials(name)}</div>;
}
