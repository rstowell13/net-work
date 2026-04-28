"use client";

export default function ContactsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      style={{
        background: "var(--stone)",
        minHeight: "100dvh",
        padding: "64px 56px",
        fontFamily: "var(--font-sans, sans-serif)",
        color: "var(--ink)",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-serif, 'Source Serif 4'), Georgia, serif",
          fontStyle: "italic",
          fontWeight: 500,
          fontSize: 36,
          letterSpacing: "-0.02em",
          margin: "0 0 12px",
        }}
      >
        Something went wrong loading contacts.
      </h1>
      <p
        style={{
          color: "var(--ink-muted)",
          fontSize: 14,
          margin: "0 0 16px",
          maxWidth: 720,
        }}
      >
        <code style={{ color: "var(--cold-red)" }}>{error.message}</code>
        {error.digest && (
          <span style={{ color: "var(--ink-faint)" }}>
            {" "}
            (digest: <code>{error.digest}</code>)
          </span>
        )}
      </p>
      <button
        onClick={() => reset()}
        style={{
          background: "var(--ink)",
          color: "var(--stone)",
          border: 0,
          padding: "8px 16px",
          borderRadius: 8,
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </div>
  );
}
