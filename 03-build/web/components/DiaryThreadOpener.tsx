"use client";
import { useState, type ReactNode } from "react";
import { ThreadModal } from "./ThreadModal";

export function DiaryThreadOpener({
  kind,
  refId,
  title,
  children,
}: {
  kind: "message" | "email";
  refId: string;
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          background: "transparent",
          border: 0,
          padding: 0,
          margin: 0,
          textAlign: "left",
          width: "100%",
          color: "inherit",
          cursor: "pointer",
          font: "inherit",
        }}
      >
        {children}
      </button>
      {open && (
        <ThreadModal
          kind={kind}
          id={refId}
          title={title}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
