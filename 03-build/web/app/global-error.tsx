"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            background: "var(--stone, #f7f4ec)",
            minHeight: "100dvh",
            padding: "64px 56px",
            fontFamily: "var(--font-sans, sans-serif)",
            color: "var(--ink, #1c1813)",
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
            Something went wrong.
          </h1>
          <p
            style={{
              color: "var(--ink-muted, #544a3c)",
              fontSize: 14,
              margin: "0 0 16px",
              maxWidth: 720,
            }}
          >
            <code style={{ color: "var(--cold-red, #9c4828)" }}>
              {error.message}
            </code>
            {error.digest && (
              <span style={{ color: "var(--ink-faint, #9d9382)" }}>
                {" "}
                (digest: <code>{error.digest}</code>)
              </span>
            )}
          </p>
          <button
            onClick={() => reset()}
            style={{
              background: "var(--ink, #1c1813)",
              color: "var(--stone, #f7f4ec)",
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
      </body>
    </html>
  );
}
