/**
 * Drizzle tablo tanımları. Kaynak gerçeklik `migrations/*.sql` dosyalarıdır; burası tipli sorgular
 * içindir ve migration ile birebir tutulmalıdır (bkz. test/schema-sync.test.ts).
 */
import {
  bigint,
  bigserial,
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => ts('created_at').notNull().defaultNow();

export const appUser = pgTable('app_user', {
  id: id(),
  email: text('email').notNull(),
  emailVerifiedAt: ts('email_verified_at'),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('Europe/Istanbul'),
  isAdmin: boolean('is_admin').notNull().default(false),
  status: text('status').$type<'active' | 'suspended' | 'deleted'>().notNull().default('active'),
  createdAt: createdAt(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: id(),
  userId: uuid('user_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  client: text('client').$type<'web' | 'mobile'>().notNull(),
  expiresAt: ts('expires_at').notNull(),
  revokedAt: ts('revoked_at'),
  replacedBy: uuid('replaced_by'),
  createdAt: createdAt(),
});

export const emailToken = pgTable('email_token', {
  id: id(),
  userId: uuid('user_id').notNull(),
  purpose: text('purpose').$type<'verify_email' | 'reset_password'>().notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  createdAt: createdAt(),
});

export const plan = pgTable('plan', {
  id: id(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  isPublic: boolean('is_public').notNull().default(false),
  isFree: boolean('is_free').notNull().default(false),
  createdAt: createdAt(),
});

export const planVersion = pgTable('plan_version', {
  id: id(),
  planId: uuid('plan_id').notNull(),
  version: integer('version').notNull(),
  activeStudentLimit: integer('active_student_limit').notNull(),
  aiMonthlyQuota: integer('ai_monthly_quota').notNull(),
  priceMinor: integer('price_minor'),
  currency: text('currency').notNull().default('TRY'),
  period: text('period').$type<'monthly' | 'yearly'>().notNull().default('monthly'),
  isCurrent: boolean('is_current').notNull().default(true),
  applyToExisting: boolean('apply_to_existing').notNull().default(false),
  storeProductIds: jsonb('store_product_ids').$type<Record<string, string>>().notNull().default({}),
  createdAt: createdAt(),
});

export const workspace = pgTable('workspace', {
  id: id(),
  ownerUserId: uuid('owner_user_id').notNull(),
  displayName: text('display_name').notNull(),
  timezone: text('timezone').notNull().default('Europe/Istanbul'),
  scheduledDeletionAt: ts('scheduled_deletion_at'),
  createdAt: createdAt(),
});

export type SubscriptionStatus = 'free' | 'active' | 'canceled' | 'past_due' | 'expired';
export const subscription = pgTable('subscription', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull(),
  planVersionId: uuid('plan_version_id').notNull(),
  status: text('status').$type<SubscriptionStatus>().notNull(),
  provider: text('provider'),
  providerRef: text('provider_ref'),
  currentPeriodEnd: ts('current_period_end'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  overLimitSince: ts('over_limit_since'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const paymentEvent = pgTable('payment_event', {
  id: id(),
  provider: text('provider').notNull(),
  eventId: text('event_id').notNull(),
  type: text('type').notNull(),
  workspaceId: uuid('workspace_id'),
  payload: jsonb('payload').notNull(),
  processedAt: ts('processed_at'),
  createdAt: createdAt(),
});

export const checkoutSession = pgTable('checkout_session', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull(),
  planVersionId: uuid('plan_version_id').notNull(),
  provider: text('provider').notNull(),
  status: text('status').$type<'pending' | 'completed' | 'failed' | 'expired'>().notNull().default('pending'),
  completedAt: ts('completed_at'),
  createdAt: createdAt(),
});

export const student = pgTable('student', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull(),
  displayName: text('display_name').notNull(),
  level: text('level'),
  goal: text('goal'),
  subject: text('subject'),
  contactNote: text('contact_note'),
  color: text('color'),
  status: text('status').$type<'active' | 'archived'>().notNull().default('active'),
  archivedAt: ts('archived_at'),
  createdAt: createdAt(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const studentAccountLink = pgTable('student_account_link', {
  id: id(),
  studentId: uuid('student_id').notNull(),
  workspaceId: uuid('workspace_id').notNull(),
  userId: uuid('user_id').notNull(),
  createdAt: createdAt(),
});

export const guardianLink = pgTable('guardian_link', {
  id: id(),
  studentId: uuid('student_id').notNull(),
  workspaceId: uuid('workspace_id').notNull(),
  userId: uuid('user_id').notNull(),
  canRequestChanges: boolean('can_request_changes').notNull().default(false),
  createdAt: createdAt(),
});

export const invite = pgTable('invite', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull(),
  studentId: uuid('student_id').notNull(),
  kind: text('kind').$type<'student' | 'guardian'>().notNull(),
  codeHash: text('code_hash').notNull(),
  canRequestChanges: boolean('can_request_changes').notNull().default(false),
  expiresAt: ts('expires_at').notNull(),
  revokedAt: ts('revoked_at'),
  acceptedAt: ts('accepted_at'),
  acceptedBy: uuid('accepted_by'),
  createdAt: createdAt(),
});

export const studentGroup = pgTable('student_group', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  archivedAt: ts('archived_at'),
  createdAt: createdAt(),
});

export const groupMembership = pgTable('group_membership', {
  id: id(),
  groupId: uuid('group_id').notNull(),
  studentId: uuid('student_id').notNull(),
  joinedAt: ts('joined_at').notNull().defaultNow(),
  leftAt: ts('left_at'),
});

export const lessonSeries = pgTable('lesson_series', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull(),
  studentId: uuid('student_id'),
  groupId: uuid('group_id'),
  weekdays: integer('weekdays').array().notNull(),
  localStartTime: time('local_start_time').notNull(),
  durationMin: integer('duration_min').notNull(),
  timezone: text('timezone').notNull(),
  startsOn: date('starts_on', { mode: 'string' }).notNull(),
  untilDate: date('until_date', { mode: 'string' }),
  occurrenceCount: integer('occurrence_count'),
  title: text('title'),
  mode: text('mode').$type<'online' | 'in_person'>().notNull().default('in_person'),
  location: text('location'),
  meetingUrl: text('meeting_url'),
  note: text('note'),
  previousSeriesId: uuid('previous_series_id'),
  createdAt: createdAt(),
});

export type LessonStatus = 'scheduled' | 'done' | 'cancelled';
export const lesson = pgTable('lesson', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull(),
  seriesId: uuid('series_id'),
  studentId: uuid('student_id'),
  groupId: uuid('group_id'),
  startsAt: ts('starts_at').notNull(),
  endsAt: ts('ends_at').notNull(),
  timezone: text('timezone').notNull(),
  title: text('title'),
  mode: text('mode').$type<'online' | 'in_person'>().notNull().default('in_person'),
  location: text('location'),
  meetingUrl: text('meeting_url'),
  note: text('note'),
  status: text('status').$type<LessonStatus>().notNull().default('scheduled'),
  isException: boolean('is_exception').notNull().default(false),
  cancelReason: text('cancel_reason'),
  topicsCovered: text('topics_covered'),
  nextPlan: text('next_plan'),
  completedAt: ts('completed_at'),
  createdAt: createdAt(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const lessonParticipant = pgTable(
  'lesson_participant',
  {
    lessonId: uuid('lesson_id').notNull(),
    studentId: uuid('student_id').notNull(),
    attendance: text('attendance').$type<'unknown' | 'present' | 'absent'>().notNull().default('unknown'),
  },
  (t) => [primaryKey({ columns: [t.lessonId, t.studentId] })],
);

export const changeRequest = pgTable('change_request', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull(),
  lessonId: uuid('lesson_id').notNull(),
  studentId: uuid('student_id').notNull(),
  requestedBy: uuid('requested_by').notNull(),
  kind: text('kind').$type<'cancel' | 'reschedule'>().notNull(),
  message: text('message'),
  proposedStartsAt: ts('proposed_starts_at'),
  status: text('status').$type<'pending' | 'approved' | 'rejected' | 'withdrawn'>().notNull().default('pending'),
  response: text('response'),
  decidedAt: ts('decided_at'),
  createdAt: createdAt(),
});

export type Visibility = 'private' | 'student' | 'student_guardian';
export const note = pgTable('note', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull(),
  studentId: uuid('student_id').notNull(),
  lessonId: uuid('lesson_id'),
  kind: text('kind').$type<'observation' | 'lesson_summary' | 'strength' | 'weakness'>().notNull().default('observation'),
  topic: text('topic'),
  body: text('body').notNull(),
  visibility: text('visibility').$type<Visibility>().notNull().default('private'),
  createdByAi: boolean('created_by_ai').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const assessment = pgTable('assessment', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull(),
  studentId: uuid('student_id').notNull(),
  title: text('title').notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  topic: text('topic'),
  score: numeric('score', { mode: 'number' }),
  maxScore: numeric('max_score', { mode: 'number' }),
  feedback: text('feedback'),
  visibility: text('visibility').$type<Visibility>().notNull().default('private'),
  createdAt: createdAt(),
});

export type FilePurpose = 'assignment' | 'answer_key' | 'submission' | 'material' | 'ai_input';
export const fileObject = pgTable('file_object', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull(),
  uploadedBy: uuid('uploaded_by'),
  storageKey: text('storage_key').notNull(),
  originalName: text('original_name').notNull(),
  mime: text('mime').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  purpose: text('purpose').$type<FilePurpose>().notNull(),
  status: text('status').$type<'pending' | 'ready' | 'rejected'>().notNull().default('pending'),
  readyAt: ts('ready_at'),
  createdAt: createdAt(),
});

export const material = pgTable('material', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  url: text('url'),
  fileId: uuid('file_id'),
  tags: text('tags').array().notNull().default([]),
  createdAt: createdAt(),
});

export const assignment = pgTable('assignment', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull(),
  groupId: uuid('group_id'),
  title: text('title').notNull(),
  description: text('description'),
  dueAt: ts('due_at'),
  links: text('links').array().notNull().default([]),
  status: text('status').$type<'draft' | 'published'>().notNull().default('draft'),
  publishedAt: ts('published_at'),
  answerKeyText: text('answer_key_text'),
  answerKeyVisibility: text('answer_key_visibility').$type<'hidden' | 'after_review' | 'at_date'>().notNull().default('hidden'),
  answerKeyVisibleAt: ts('answer_key_visible_at'),
  createdAt: createdAt(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const assignmentFile = pgTable(
  'assignment_file',
  {
    assignmentId: uuid('assignment_id').notNull(),
    fileId: uuid('file_id').notNull(),
    isAnswerKey: boolean('is_answer_key').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.assignmentId, t.fileId] })],
);

export type RecipientStatus = 'assigned' | 'submitted' | 'reviewed' | 'resubmit_requested';
export const assignmentRecipient = pgTable('assignment_recipient', {
  id: id(),
  assignmentId: uuid('assignment_id').notNull(),
  studentId: uuid('student_id').notNull(),
  status: text('status').$type<RecipientStatus>().notNull().default('assigned'),
  lastSubmittedAt: ts('last_submitted_at'),
  reviewedAt: ts('reviewed_at'),
  score: numeric('score', { mode: 'number' }),
});

export const submission = pgTable('submission', {
  id: id(),
  recipientId: uuid('recipient_id').notNull(),
  version: integer('version').notNull(),
  text: text('text'),
  submittedBy: uuid('submitted_by'),
  submittedAt: ts('submitted_at').notNull().defaultNow(),
});

export const submissionFile = pgTable(
  'submission_file',
  {
    submissionId: uuid('submission_id').notNull(),
    fileId: uuid('file_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.submissionId, t.fileId] })],
);

export const assignmentFeedback = pgTable('assignment_feedback', {
  id: id(),
  recipientId: uuid('recipient_id').notNull(),
  submissionId: uuid('submission_id'),
  feedback: text('feedback'),
  score: numeric('score', { mode: 'number' }),
  requestedResubmit: boolean('requested_resubmit').notNull().default(false),
  createdAt: createdAt(),
});

export const notification = pgTable('notification', {
  id: id(),
  userId: uuid('user_id').notNull(),
  workspaceId: uuid('workspace_id'),
  category: text('category').notNull(),
  type: text('type').notNull(),
  titleKey: text('title_key').notNull(),
  params: jsonb('params').$type<Record<string, string>>().notNull().default({}),
  link: text('link').notNull(),
  dedupeKey: text('dedupe_key').notNull(),
  readAt: ts('read_at'),
  createdAt: createdAt(),
});

export const notificationPref = pgTable(
  'notification_pref',
  {
    userId: uuid('user_id').notNull(),
    category: text('category').notNull(),
    enabled: boolean('enabled').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.category] })],
);

export const aiConversation = pgTable('ai_conversation', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull(),
  userId: uuid('user_id').notNull(),
  title: text('title'),
  createdAt: createdAt(),
});

export const aiMessage = pgTable('ai_message', {
  id: id(),
  conversationId: uuid('conversation_id').notNull(),
  role: text('role').$type<'user' | 'assistant' | 'tool'>().notNull(),
  content: jsonb('content').notNull(),
  createdAt: createdAt(),
});

export const aiAction = pgTable('ai_action', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull(),
  conversationId: uuid('conversation_id'),
  tool: text('tool').notNull(),
  input: jsonb('input').notNull(),
  preview: jsonb('preview').notNull(),
  previewHash: text('preview_hash').notNull(),
  status: text('status')
    .$type<'proposed' | 'applied' | 'rejected' | 'stale' | 'expired' | 'failed' | 'undone'>()
    .notNull()
    .default('proposed'),
  result: jsonb('result'),
  expiresAt: ts('expires_at').notNull(),
  decidedAt: ts('decided_at'),
  createdAt: createdAt(),
});

export const usageCounter = pgTable(
  'usage_counter',
  {
    workspaceId: uuid('workspace_id').notNull(),
    metric: text('metric').notNull(),
    period: text('period').notNull(),
    value: integer('value').notNull().default(0),
    costMicroUsd: bigint('cost_micro_usd', { mode: 'number' }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.metric, t.period] })],
);

export const idempotencyKey = pgTable(
  'idempotency_key',
  {
    userId: uuid('user_id').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    statusCode: integer('status_code'),
    response: jsonb('response'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

export const adminAccessGrant = pgTable('admin_access_grant', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull(),
  adminUserId: uuid('admin_user_id').notNull(),
  reason: text('reason').notNull(),
  status: text('status').$type<'requested' | 'approved' | 'denied' | 'revoked'>().notNull().default('requested'),
  approvedAt: ts('approved_at'),
  expiresAt: ts('expires_at'),
  createdAt: createdAt(),
});

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  actorUserId: uuid('actor_user_id'),
  workspaceId: uuid('workspace_id'),
  action: text('action').notNull(),
  target: text('target'),
  meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
});

export const appSetting = pgTable('app_setting', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const appError = pgTable('app_error', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  code: text('code').notNull(),
  route: text('route'),
  message: text('message'),
  createdAt: createdAt(),
});
