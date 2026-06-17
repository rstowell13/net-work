// Unified "recent interactions" feed for the triage card: merges the four
// diary channels (texts, emails, calls, calendar events) into one
// newest-first list. Pure function so it can be unit-tested without a DB.

export type RecentChannel = "imessage" | "email" | "call" | "calendar";

export interface RecentInteraction {
  date: Date;
  channel: RecentChannel;
  preview: string;
}

interface RecentSources {
  messages: { sentAt: Date; body: string | null }[];
  emails: { sentAt: Date; subject: string | null }[];
  calls: { startedAt: Date; durationSeconds: number }[];
  calendar: { startsAt: Date; title: string }[];
}

export function mergeRecentInteractions(
  src: RecentSources,
  limit = 3,
): RecentInteraction[] {
  return [
    ...src.messages.map((m) => ({
      date: m.sentAt,
      channel: "imessage" as const,
      preview: (m.body ?? "").slice(0, 200) || "(no text)",
    })),
    ...src.emails.map((e) => ({
      date: e.sentAt,
      channel: "email" as const,
      preview: e.subject ?? "(no subject)",
    })),
    ...src.calls.map((c) => ({
      date: c.startedAt,
      channel: "call" as const,
      preview: `${Math.round(c.durationSeconds / 60)}-minute call`,
    })),
    ...src.calendar.map((ev) => ({
      date: ev.startsAt,
      channel: "calendar" as const,
      preview: ev.title,
    })),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, limit);
}
