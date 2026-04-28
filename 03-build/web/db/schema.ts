/**
 * Drizzle schema — full v1 data model.
 * Source of truth: 01-spec/DATA_MODEL.md
 *
 * Conventions:
 * - Every table has id (uuid), createdAt, updatedAt.
 * - Soft-deletes via deletedAt where the spec calls for it
 *   (Contact, Note, FollowUp, Tag).
 * - All timestamps stored as UTC (timestamp with time zone).
 * - OAuth/agent tokens stored plaintext in v1 but isolated to Supabase
 *   service-role-only access. Column-level encryption is post-v1.
 */
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

// ============================================================
// Enums
// ============================================================
export const sourceKindEnum = pgEnum("source_kind", [
  "apple_contacts",
  "google_contacts",
  "gmail",
  "google_calendar",
  "linkedin_csv",
  "mac_agent",
]);

export const sourceStatusEnum = pgEnum("source_status", [
  "not_connected",
  "connected",
  "needs_reauth",
  "error",
]);

export const importRunStatusEnum = pgEnum("import_run_status", [
  "running",
  "success",
  "partial",
  "failed",
]);

export const categoryEnum = pgEnum("category", [
  "personal",
  "business",
  "both",
]);

export const triageStatusEnum = pgEnum("triage_status", [
  "to_triage",
  "kept",
  "skipped",
]);

export const suggestionStatusEnum = pgEnum("suggestion_status", [
  "active",
  "never",
]);

export const mergeConfidenceEnum = pgEnum("merge_confidence", [
  "exact",
  "high",
  "ambiguous",
]);

export const mergeStatusEnum = pgEnum("merge_status", [
  "pending",
  "approved",
  "split",
  "skipped",
]);

export const followupStatusEnum = pgEnum("followup_status", [
  "open",
  "done",
  "snoozed",
]);

export const followupSourceEnum = pgEnum("followup_source", [
  "manual",
  "extracted",
]);

export const messageDirectionEnum = pgEnum("message_direction", [
  "inbound",
  "outbound",
]);

export const messageChannelEnum = pgEnum("message_channel", [
  "imessage",
  "sms",
]);

export const emailDirectionEnum = pgEnum("email_direction", [
  "inbound",
  "outbound",
]);

export const callDirectionEnum = pgEnum("call_direction", [
  "inbound",
  "outbound",
  "missed",
]);

export const planItemStatusEnum = pgEnum("plan_item_status", [
  "not_yet_reached",
  "reached",
  "connected",
]);

export const planItemSourceEnum = pgEnum("plan_item_source", [
  "suggestions_flow",
  "add_to_this_week",
]);

export const cadenceWindowEnum = pgEnum("cadence_window", [
  "week",
  "month",
  "quarter",
]);

export const themePreferenceEnum = pgEnum("theme_preference", [
  "auto",
  "light",
  "dark",
]);

export const scoreKindEnum = pgEnum("score_kind", ["freshness"]);

export const freshnessLabelEnum = pgEnum("freshness_label", [
  "fresh",
  "warm",
  "fading",
  "cold",
  "dormant",
]);

// ============================================================
// Identity
// ============================================================
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  timezone: text("timezone").notNull().default("America/Los_Angeles"),
  themePreference: themePreferenceEnum("theme_preference")
    .notNull()
    .default("auto"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================
// Ingestion / sources
// ============================================================
export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: sourceKindEnum("kind").notNull(),
    status: sourceStatusEnum("status").notNull().default("not_connected"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSyncError: text("last_sync_error"),
    config: jsonb("config").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqUserKind: uniqueIndex("sources_user_kind_uniq").on(t.userId, t.kind),
  }),
);

export const oauthTokens = pgTable("oauth_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: uuid("source_id")
    .notNull()
    .references(() => sources.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  scopes: text("scopes").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const agentTokens = pgTable("agent_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: uuid("source_id")
    .notNull()
    .references(() => sources.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const importRuns = pgTable("import_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: uuid("source_id")
    .notNull()
    .references(() => sources.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: importRunStatusEnum("status").notNull().default("running"),
  recordsSeen: integer("records_seen").notNull().default(0),
  recordsNew: integer("records_new").notNull().default(0),
  recordsUpdated: integer("records_updated").notNull().default(0),
  errorMessage: text("error_message"),
});

// ============================================================
// Contacts (raw + merged)
// ============================================================
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    photoUrl: text("photo_url"),
    primaryPhone: text("primary_phone"),
    primaryEmail: text("primary_email"),
    linkedinUrl: text("linkedin_url"),
    category: categoryEnum("category"),
    triageStatus: triageStatusEnum("triage_status")
      .notNull()
      .default("to_triage"),
    suggestionStatus: suggestionStatusEnum("suggestion_status")
      .notNull()
      .default("active"),
    mergeNotes: text("merge_notes"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userTriageIdx: index("contacts_user_triage_idx").on(
      t.userId,
      t.triageStatus,
    ),
    userCategoryIdx: index("contacts_user_category_idx").on(
      t.userId,
      t.category,
    ),
  }),
);

export const rawContacts = pgTable(
  "raw_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    externalId: text("external_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    name: text("name"),
    emails: text("emails").array(),
    phones: text("phones").array(),
    linkedinUrl: text("linkedin_url"),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqSourceExternal: uniqueIndex("raw_contacts_source_external_uniq").on(
      t.sourceId,
      t.externalId,
    ),
    contactIdx: index("raw_contacts_contact_idx").on(t.contactId),
  }),
);

export const mergeCandidates = pgTable(
  "merge_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rawContactIds: uuid("raw_contact_ids").array().notNull(),
    confidence: mergeConfidenceEnum("confidence").notNull(),
    signals: jsonb("signals").$type<Record<string, unknown>>(),
    status: mergeStatusEnum("status").notNull().default("pending"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resultingContactId: uuid("resulting_contact_id").references(
      () => contacts.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userStatusIdx: index("merge_candidates_user_status_idx").on(
      t.userId,
      t.status,
    ),
  }),
);

// ============================================================
// Tags
// ============================================================
export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqUserName: uniqueIndex("tags_user_name_uniq").on(t.userId, t.name),
  }),
);

export const contactTags = pgTable(
  "contact_tags",
  {
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.contactId, t.tagId] }),
  }),
);

// ============================================================
// Per-contact content
// ============================================================
export const followUps = pgTable(
  "follow_ups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    source: followupSourceEnum("source").notNull().default("manual"),
    status: followupStatusEnum("status").notNull().default("open"),
    snoozeUntil: timestamp("snooze_until", { withTimezone: true }),
    doneAt: timestamp("done_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    contactStatusIdx: index("follow_ups_contact_status_idx").on(
      t.contactId,
      t.status,
    ),
  }),
);

export const notes = pgTable("notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================
// Diary sources — messages, emails, calls, calendar
// ============================================================
export const messageThreads = pgTable(
  "message_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable until the post-merge linking step runs (M4): ingestion
    // creates threads before Contacts exist, so we can't enforce the FK at
    // insert time. After merge, we walk participating raw_contacts → contact.
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    // Phone or email handle from the mac_agent — matches raw_contacts.phones/emails
    // for post-merge relinking. Populated at ingest time.
    handle: text("handle"),
    externalThreadId: text("external_thread_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    messageCount: integer("message_count").notNull().default(0),
    summary: text("summary"),
    summaryGeneratedAt: timestamp("summary_generated_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    contactEndedIdx: index("message_threads_contact_ended_idx").on(
      t.contactId,
      t.endedAt,
    ),
    uniqExternalThread: uniqueIndex("message_threads_external_uniq").on(
      t.externalThreadId,
    ),
    handleIdx: index("message_threads_handle_idx").on(t.handle),
  }),
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    threadId: uuid("thread_id").references(() => messageThreads.id, {
      onDelete: "cascade",
    }),
    externalId: text("external_id").notNull(),
    direction: messageDirectionEnum("direction").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    body: text("body"),
    channel: messageChannelEnum("channel").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqExternal: uniqueIndex("messages_external_uniq").on(t.externalId),
    contactSentIdx: index("messages_contact_sent_idx").on(
      t.contactId,
      t.sentAt,
    ),
  }),
);

export const emailThreads = pgTable(
  "email_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable until the post-merge linking step runs (M4) — see message_threads.
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    externalThreadId: text("external_thread_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    messageCount: integer("message_count").notNull().default(0),
    summary: text("summary"),
    summaryGeneratedAt: timestamp("summary_generated_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqExternalThread: uniqueIndex("email_threads_external_uniq").on(
      t.externalThreadId,
    ),
    contactEndedIdx: index("email_threads_contact_ended_idx").on(
      t.contactId,
      t.endedAt,
    ),
  }),
);

export const emails = pgTable(
  "emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    threadId: uuid("thread_id").references(() => emailThreads.id, {
      onDelete: "cascade",
    }),
    externalId: text("external_id").notNull(),
    direction: emailDirectionEnum("direction").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    subject: text("subject"),
    body: text("body"),
    fromEmail: text("from_email"),
    toEmails: text("to_emails").array(),
    ccEmails: text("cc_emails").array(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqExternal: uniqueIndex("emails_external_uniq").on(t.externalId),
  }),
);

export const callLogs = pgTable(
  "call_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    externalId: text("external_id").notNull(),
    // Phone handle from the mac_agent — matches raw_contacts.phones for
    // post-merge relinking.
    handle: text("handle"),
    direction: callDirectionEnum("direction").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqExternal: uniqueIndex("call_logs_external_uniq").on(t.externalId),
    contactStartedIdx: index("call_logs_contact_started_idx").on(
      t.contactId,
      t.startedAt,
    ),
    handleIdx: index("call_logs_handle_idx").on(t.handle),
  }),
);

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable until post-merge linking — see message_threads.
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    attendees: text("attendees").array(),
    selfAttended: boolean("self_attended").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // Unique on externalId alone — Google Calendar event IDs are globally
    // unique across the user's calendar, and contactId may be null at
    // ingest time.
    uniqExternal: uniqueIndex("calendar_events_external_uniq").on(
      t.externalId,
    ),
  }),
);

// ============================================================
// Summaries + scores
// ============================================================
export const relationshipSummaries = pgTable(
  "relationship_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    model: text("model").notNull(),
    inputsHash: text("inputs_hash").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    contactGeneratedIdx: index("relationship_summaries_contact_idx").on(
      t.contactId,
      t.generatedAt,
    ),
  }),
);

export const scores = pgTable(
  "scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    kind: scoreKindEnum("kind").notNull(),
    value: integer("value").notNull(),
    label: freshnessLabelEnum("label"),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    inputsSummary: jsonb("inputs_summary").$type<Record<string, unknown>>(),
  },
  (t) => ({
    uniqContactKind: uniqueIndex("scores_contact_kind_uniq").on(
      t.contactId,
      t.kind,
    ),
  }),
);

export const scoreHistory = pgTable("score_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  kind: scoreKindEnum("kind").notNull(),
  value: integer("value").notNull(),
  label: freshnessLabelEnum("label"),
  computedAt: timestamp("computed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================
// Weekly plan
// ============================================================
export const weeklyPlans = pgTable(
  "weekly_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    isoYear: integer("iso_year").notNull(),
    isoWeek: integer("iso_week").notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => ({
    uniqUserWeek: uniqueIndex("weekly_plans_user_week_uniq").on(
      t.userId,
      t.isoYear,
      t.isoWeek,
    ),
  }),
);

export const weeklyPlanItems = pgTable(
  "weekly_plan_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => weeklyPlans.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    status: planItemStatusEnum("status").notNull().default("not_yet_reached"),
    reachedAt: timestamp("reached_at", { withTimezone: true }),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    source: planItemSourceEnum("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqPlanContact: uniqueIndex("weekly_plan_items_plan_contact_uniq").on(
      t.planId,
      t.contactId,
    ),
  }),
);

// ============================================================
// Cadence
// ============================================================
export const cadenceRules = pgTable("cadence_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  targetPerWeek: integer("target_per_week").notNull().default(5),
  personalPct: integer("personal_pct").notNull().default(60),
  minDaysSinceLastContact: integer("min_days_since_last_contact")
    .notNull()
    .default(30),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tagCadenceRules = pgTable("tag_cadence_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tagId: uuid("tag_id")
    .notNull()
    .references(() => tags.id, { onDelete: "cascade" }),
  targetCount: integer("target_count").notNull(),
  window: cadenceWindowEnum("window").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================
// Suggestion state
// ============================================================
export const suggestionState = pgTable("suggestion_state", {
  contactId: uuid("contact_id")
    .primaryKey()
    .references(() => contacts.id, { onDelete: "cascade" }),
  lastSuggestedAt: timestamp("last_suggested_at", { withTimezone: true }),
  lastDismissedAt: timestamp("last_dismissed_at", { withTimezone: true }),
  dismissCount: integer("dismiss_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
