"use client";
import { useEffect, useRef, useState } from "react";
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
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  // The browser may load and fail the SSR-rendered <img> before React
  // hydrates and attaches onError, so check on mount.
  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, []);

  const trimmedUrl = photoUrl?.trim();
  // Google Contacts often sends a "default" placeholder photo (colored
  // circle with white first initial) for contacts without real photos.
  // Those URLs live under the `/a/` path; real photos are under
  // `/contacts/`. Treat the default as missing so we render our monogram.
  const isGoogleDefault =
    !!trimmedUrl &&
    /lh\d+\.googleusercontent\.com\/a\//.test(trimmedUrl);
  const useImg = !!trimmedUrl && !isGoogleDefault && !failed;
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
  if (useImg) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={imgRef}
        src={trimmedUrl}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        style={{ ...style, objectFit: "cover" }}
      />
    );
  }
  return (
    <div style={style} aria-label={name ?? "contact"}>
      {initials(name)}
    </div>
  );
}
