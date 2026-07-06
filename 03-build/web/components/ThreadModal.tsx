"use client";
import { useEffect, useState } from "react";
import { fmtTimeLocale, fmtDateHeader } from "@/lib/format-time";

type MsgRow = {
  id: string;
  direction: "inbound" | "outbound";
  sentAt: string;
  body: string | null;
  channel?: "imessage" | "sms";
  // Sender name/handle for inbound group-thread messages (null otherwise).
  sender?: string | null;
};

type EmailRow = {
  id: string;
  direction: "inbound" | "outbound";
  sentAt: string;
  subject: string | null;
  body: string | null;
  fromEmail: string | null;
  toEmails: string[] | null;
};

type ThreadResponse =
  | { kind: "message"; messages: MsgRow[]; summary: string | null }
  | { kind: "email"; messages: EmailRow[]; summary: string | null };

function sameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export function ThreadModal({
  kind,
  id,
  title,
  onClose,
}: {
  kind: "message" | "email";
  id: string;
  title: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<ThreadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/threads/${kind}/${id}`);
        if (!r.ok) throw new Error(`status ${r.status}`);
        const j = (await r.json()) as ThreadResponse;
        if (!cancelled) setData(j);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(28, 24, 19, 0.32)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 24px",
        opacity: mounted ? 1 : 0,
        transition: "opacity var(--motion-base)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          background: "var(--stone)",
          color: "var(--ink)",
          borderRadius: 4,
          maxWidth: 580,
          width: "100%",
          maxHeight: "min(85vh, 760px)",
          display: "flex",
          flexDirection: "column",
          border: "1px solid var(--rule)",
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.6) inset, 0 24px 60px -20px rgba(28, 24, 19, 0.35), 0 8px 20px -8px rgba(28, 24, 19, 0.18)",
          transform: mounted ? "translateY(0)" : "translateY(8px)",
          opacity: mounted ? 1 : 0,
          transition:
            "opacity var(--motion-base), transform var(--motion-slow)",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            padding: "18px 24px 14px",
            borderBottom: "1px solid var(--rule)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 16,
          }}
        >
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--ink-faint)",
            }}
          >
            {title}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: 0,
              color: "var(--ink-faint)",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: 0,
              lineHeight: 1,
              transition: "color var(--motion-fast)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--ink)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--ink-faint)")
            }
          >
            Close
          </button>
        </header>

        <div
          style={{
            padding: "8px 24px 24px",
            overflowY: "auto",
            flex: 1,
          }}
        >
          {error && (
            <p
              style={{
                color: "var(--cold-red)",
                fontSize: 13,
                marginTop: 16,
              }}
            >
              Couldn&apos;t load thread: {error}
            </p>
          )}
          {!data && !error && <SkeletonBubbles />}
          {data && data.kind === "message" && (
            <MessageBubbles messages={data.messages} />
          )}
          {data && data.kind === "email" && (
            <EmailList messages={data.messages} />
          )}
        </div>
      </div>
    </div>
  );
}

function SkeletonBubbles() {
  const widths = ["62%", "44%", "78%", "38%"];
  const sides = [false, true, false, true];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        marginTop: 24,
      }}
    >
      {widths.map((w, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: sides[i] ? "flex-end" : "flex-start",
          }}
        >
          <div
            style={{
              width: w,
              height: 32,
              borderRadius: 14,
              background: "var(--rule)",
              opacity: 0.5,
              animation: "pulse 1.6s ease-in-out infinite",
              animationDelay: `${i * 120}ms`,
            }}
          />
        </div>
      ))}
      <style>{`@keyframes pulse { 0%,100% { opacity: 0.35; } 50% { opacity: 0.7; } }`}</style>
    </div>
  );
}

function MessageBubbles({ messages }: { messages: MsgRow[] }) {
  if (messages.length === 0)
    return (
      <p
        style={{
          color: "var(--ink-faint)",
          fontSize: 13,
          fontStyle: "italic",
          marginTop: 24,
          textAlign: "center",
        }}
      >
        No messages in this thread.
      </p>
    );
  return (
    <div style={{ display: "flex", flexDirection: "column", paddingTop: 8 }}>
      {messages.map((m, i) => {
        const out = m.direction === "outbound";
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const showDate = !prev || !sameDay(prev.sentAt, m.sentAt);
        const sameSenderAsNext =
          next &&
          next.direction === m.direction &&
          next.sender === m.sender &&
          new Date(next.sentAt).getTime() - new Date(m.sentAt).getTime() <
            2 * 60 * 1000;
        const sameSenderAsPrev =
          prev &&
          prev.direction === m.direction &&
          prev.sender === m.sender &&
          new Date(m.sentAt).getTime() - new Date(prev.sentAt).getTime() <
            2 * 60 * 1000;
        // Group threads: show the sender's name above the start of each of their
        // runs of inbound messages.
        const showSender = !out && !!m.sender && !sameSenderAsPrev;

        const radius = out
          ? `16px ${sameSenderAsPrev ? "4px" : "16px"} ${
              sameSenderAsNext ? "4px" : "16px"
            } 16px`
          : `${sameSenderAsPrev ? "4px" : "16px"} 16px 16px ${
              sameSenderAsNext ? "4px" : "16px"
            }`;

        return (
          <div key={m.id}>
            {showDate && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  margin: i === 0 ? "8px 0 16px" : "24px 0 16px",
                }}
              >
                <span
                  style={{
                    flex: 1,
                    height: 1,
                    background: "var(--rule)",
                  }}
                />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "var(--ink-faint)",
                  }}
                >
                  {fmtDateHeader(m.sentAt)}
                </span>
                <span
                  style={{
                    flex: 1,
                    height: 1,
                    background: "var(--rule)",
                  }}
                />
              </div>
            )}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: out ? "flex-end" : "flex-start",
                marginBottom: sameSenderAsNext ? 2 : 8,
              }}
            >
              {showSender && (
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    color: "var(--ink-faint)",
                    margin: "0 0 2px 6px",
                    letterSpacing: "0.02em",
                  }}
                >
                  {m.sender}
                </span>
              )}
              <div
                style={{
                  maxWidth: "78%",
                  padding: "9px 14px",
                  borderRadius: radius,
                  background: out ? "var(--ink)" : "var(--stone-sunken)",
                  color: out ? "var(--stone)" : "var(--ink)",
                  border: out ? "none" : "1px solid var(--rule)",
                  fontSize: 14,
                  lineHeight: 1.45,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  letterSpacing: "-0.005em",
                }}
                title={fmtTimeLocale(m.sentAt)}
              >
                {m.body || (
                  <span style={{ opacity: 0.5, fontStyle: "italic" }}>
                    (empty)
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmailList({ messages }: { messages: EmailRow[] }) {
  if (messages.length === 0)
    return (
      <p
        style={{
          color: "var(--ink-faint)",
          fontSize: 13,
          fontStyle: "italic",
          marginTop: 24,
          textAlign: "center",
        }}
      >
        No emails in this thread.
      </p>
    );
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        paddingTop: 16,
      }}
    >
      {messages.map((e, i) => (
        <article
          key={e.id}
          style={{
            paddingBottom: 24,
            marginBottom: 24,
            borderBottom:
              i < messages.length - 1 ? "1px solid var(--rule)" : "none",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "baseline",
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-faint)",
              marginBottom: 8,
            }}
          >
            <span
              style={{
                color:
                  e.direction === "outbound"
                    ? "var(--brass-deep)"
                    : "var(--ink-muted)",
              }}
            >
              {e.direction === "outbound" ? "Sent" : "Received"}
            </span>
            <span style={{ color: "var(--ink-faint)" }}>
              {fmtDateHeader(e.sentAt)} · {fmtTimeLocale(e.sentAt)}
            </span>
          </div>
          {e.fromEmail && (
            <div
              style={{
                fontSize: 12,
                color: "var(--ink-muted)",
                marginBottom: 6,
                fontFamily:
                  "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace",
              }}
            >
              {e.fromEmail}
            </div>
          )}
          {e.subject && i === 0 && (
            <h3
              style={{
                fontSize: 18,
                fontWeight: 500,
                margin: "2px 0 12px",
                lineHeight: 1.3,
                color: "var(--ink)",
                letterSpacing: "-0.01em",
              }}
            >
              {e.subject}
            </h3>
          )}
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color: "var(--ink)",
              maxWidth: "65ch",
            }}
          >
            {e.body || (
              <span style={{ color: "var(--ink-faint)", fontStyle: "italic" }}>
                (no body)
              </span>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
