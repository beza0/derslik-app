-- Derslik başlangıç şeması
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ───────────── Hesaplar ─────────────
CREATE TABLE app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  email_verified_at timestamptz,
  password_hash text NOT NULL,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Europe/Istanbul',
  is_admin boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX app_user_email_uq ON app_user (lower(email));

CREATE TABLE session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  client text NOT NULL CHECK (client IN ('web', 'mobile')),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX session_user_idx ON session (user_id);

CREATE TABLE email_token (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ───────────── Paketler ve abonelik ─────────────
CREATE TABLE plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  is_public boolean NOT NULL DEFAULT false,
  is_free boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plan_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
  version int NOT NULL,
  active_student_limit int NOT NULL CHECK (active_student_limit >= 1),
  ai_monthly_quota int NOT NULL CHECK (ai_monthly_quota >= 0),
  price_minor int CHECK (price_minor >= 0),
  currency text NOT NULL DEFAULT 'TRY',
  period text NOT NULL DEFAULT 'monthly' CHECK (period IN ('monthly', 'yearly')),
  is_current boolean NOT NULL DEFAULT true,
  apply_to_existing boolean NOT NULL DEFAULT false,
  store_product_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, version)
);
CREATE UNIQUE INDEX plan_version_current_uq ON plan_version (plan_id) WHERE is_current;

-- ───────────── Çalışma alanı ve öğrenciler ─────────────
CREATE TABLE workspace (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL UNIQUE REFERENCES app_user(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Europe/Istanbul',
  scheduled_deletion_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES workspace(id) ON DELETE CASCADE,
  plan_version_id uuid NOT NULL REFERENCES plan_version(id),
  status text NOT NULL CHECK (status IN ('free', 'active', 'canceled', 'past_due', 'expired')),
  provider text,
  provider_ref text,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  over_limit_since timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payment_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  type text NOT NULL,
  workspace_id uuid REFERENCES workspace(id) ON DELETE SET NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

CREATE TABLE checkout_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  plan_version_id uuid NOT NULL REFERENCES plan_version(id),
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE student (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  level text,
  goal text,
  subject text,
  contact_note text,
  color text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX student_ws_status_idx ON student (workspace_id, status, display_name);

CREATE TABLE student_account_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL UNIQUE REFERENCES student(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace_id)
);
CREATE INDEX student_account_link_user_idx ON student_account_link (user_id);

CREATE TABLE guardian_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  can_request_changes boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, user_id)
);
CREATE INDEX guardian_link_user_idx ON guardian_link (user_id);

CREATE TABLE invite (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('student', 'guardian')),
  code_hash text NOT NULL UNIQUE,
  can_request_changes boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invite_student_idx ON invite (student_id);

-- ───────────── Gruplar ─────────────
CREATE TABLE student_group (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX student_group_ws_idx ON student_group (workspace_id);

CREATE TABLE group_membership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES student_group(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz
);
CREATE UNIQUE INDEX group_membership_active_uq ON group_membership (group_id, student_id) WHERE left_at IS NULL;
CREATE INDEX group_membership_student_idx ON group_membership (student_id);

-- ───────────── Takvim ─────────────
CREATE TABLE lesson_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  student_id uuid REFERENCES student(id) ON DELETE CASCADE,
  group_id uuid REFERENCES student_group(id) ON DELETE CASCADE,
  weekdays int[] NOT NULL,
  local_start_time time NOT NULL,
  duration_min int NOT NULL CHECK (duration_min BETWEEN 5 AND 600),
  timezone text NOT NULL,
  starts_on date NOT NULL,
  until_date date,
  occurrence_count int,
  title text,
  mode text NOT NULL DEFAULT 'in_person',
  location text,
  meeting_url text,
  note text,
  previous_series_id uuid REFERENCES lesson_series(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((student_id IS NULL) <> (group_id IS NULL))
);

CREATE TABLE lesson (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  series_id uuid REFERENCES lesson_series(id) ON DELETE SET NULL,
  student_id uuid REFERENCES student(id) ON DELETE CASCADE,
  group_id uuid REFERENCES student_group(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  timezone text NOT NULL,
  title text,
  mode text NOT NULL DEFAULT 'in_person' CHECK (mode IN ('online', 'in_person')),
  location text,
  meeting_url text,
  note text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'done', 'cancelled')),
  is_exception boolean NOT NULL DEFAULT false,
  cancel_reason text,
  topics_covered text,
  next_plan text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK ((student_id IS NULL) <> (group_id IS NULL)),
  -- Aynı öğretmenin iptal edilmemiş dersleri örtüşemez; [) sayesinde arka arkaya dersler serbest.
  CONSTRAINT lesson_no_overlap EXCLUDE USING gist (
    workspace_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status <> 'cancelled')
);
CREATE INDEX lesson_ws_time_idx ON lesson (workspace_id, starts_at);
CREATE INDEX lesson_series_idx ON lesson (series_id, starts_at);

CREATE TABLE lesson_participant (
  lesson_id uuid NOT NULL REFERENCES lesson(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  attendance text NOT NULL DEFAULT 'unknown' CHECK (attendance IN ('unknown', 'present', 'absent')),
  PRIMARY KEY (lesson_id, student_id)
);
CREATE INDEX lesson_participant_student_idx ON lesson_participant (student_id);

CREATE TABLE change_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES lesson(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('cancel', 'reschedule')),
  message text,
  proposed_starts_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  response text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX change_request_pending_uq ON change_request (lesson_id, requested_by) WHERE status = 'pending';
CREATE INDEX change_request_ws_idx ON change_request (workspace_id, status);

-- ───────────── Notlar ve değerlendirmeler ─────────────
CREATE TABLE note (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES lesson(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'observation' CHECK (kind IN ('observation', 'lesson_summary', 'strength', 'weakness')),
  topic text,
  body text NOT NULL,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'student', 'student_guardian')),
  created_by_ai boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX note_student_idx ON note (student_id, created_at DESC);

CREATE TABLE assessment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  title text NOT NULL,
  date date NOT NULL,
  topic text,
  score numeric,
  max_score numeric,
  feedback text,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'student', 'student_guardian')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assessment_student_idx ON assessment (student_id, date);

-- ───────────── Dosyalar ve materyaller ─────────────
CREATE TABLE file_object (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  storage_key text NOT NULL UNIQUE,
  original_name text NOT NULL,
  mime text NOT NULL,
  size_bytes int NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('assignment', 'answer_key', 'submission', 'material', 'ai_input')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE material (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  url text,
  file_id uuid REFERENCES file_object(id) ON DELETE SET NULL,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ───────────── Ödevler ─────────────
CREATE TABLE assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  group_id uuid REFERENCES student_group(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  due_at timestamptz,
  links text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  answer_key_text text,
  answer_key_visibility text NOT NULL DEFAULT 'hidden' CHECK (answer_key_visibility IN ('hidden', 'after_review', 'at_date')),
  answer_key_visible_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assignment_ws_idx ON assignment (workspace_id, created_at DESC);

CREATE TABLE assignment_file (
  assignment_id uuid NOT NULL REFERENCES assignment(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES file_object(id) ON DELETE CASCADE,
  is_answer_key boolean NOT NULL DEFAULT false,
  PRIMARY KEY (assignment_id, file_id)
);

CREATE TABLE assignment_recipient (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignment(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'submitted', 'reviewed', 'resubmit_requested')),
  last_submitted_at timestamptz,
  reviewed_at timestamptz,
  score numeric,
  UNIQUE (assignment_id, student_id)
);
CREATE INDEX assignment_recipient_student_idx ON assignment_recipient (student_id);

CREATE TABLE submission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES assignment_recipient(id) ON DELETE CASCADE,
  version int NOT NULL,
  text text,
  submitted_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipient_id, version)
);

CREATE TABLE submission_file (
  submission_id uuid NOT NULL REFERENCES submission(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES file_object(id) ON DELETE CASCADE,
  PRIMARY KEY (submission_id, file_id)
);

CREATE TABLE assignment_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES assignment_recipient(id) ON DELETE CASCADE,
  submission_id uuid REFERENCES submission(id) ON DELETE SET NULL,
  feedback text,
  score numeric,
  requested_resubmit boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ───────────── Bildirimler ─────────────
CREATE TABLE notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES workspace(id) ON DELETE CASCADE,
  category text NOT NULL,
  type text NOT NULL,
  title_key text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  link text NOT NULL,
  dedupe_key text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);
CREATE INDEX notification_user_idx ON notification (user_id, created_at DESC);

CREATE TABLE notification_pref (
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  category text NOT NULL,
  enabled boolean NOT NULL,
  PRIMARY KEY (user_id, category)
);

-- ───────────── AI ─────────────
CREATE TABLE ai_conversation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  title text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai_message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ai_conversation(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_message_conv_idx ON ai_message (conversation_id, created_at);

CREATE TABLE ai_action (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES ai_conversation(id) ON DELETE CASCADE,
  tool text NOT NULL,
  input jsonb NOT NULL,
  preview jsonb NOT NULL,
  preview_hash text NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'applied', 'rejected', 'stale', 'expired', 'failed', 'undone')),
  result jsonb,
  expires_at timestamptz NOT NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_action_ws_idx ON ai_action (workspace_id, created_at DESC);

CREATE TABLE usage_counter (
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  metric text NOT NULL,
  period text NOT NULL,
  value int NOT NULL DEFAULT 0,
  cost_micro_usd bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, metric, period)
);

-- ───────────── Altyapı ─────────────
CREATE TABLE idempotency_key (
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  key text NOT NULL,
  request_hash text NOT NULL,
  status_code int,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE TABLE admin_access_grant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  admin_user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'denied', 'revoked')),
  approved_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  actor_user_id uuid REFERENCES app_user(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES workspace(id) ON DELETE SET NULL,
  action text NOT NULL,
  target text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_ws_idx ON audit_log (workspace_id, created_at DESC);

CREATE TABLE app_setting (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
