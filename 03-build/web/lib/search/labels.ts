import type { MentionSource } from "./queries";

/**
 * Display labels for MentionSource. Split out from queries.ts (server-only)
 * so client components can import it without pulling in DB code.
 */
export const SOURCE_LABEL: Record<MentionSource, string> = {
  note: "Note",
  email: "Email",
  message: "Message",
  summary: "Summary",
  event: "Event",
};
