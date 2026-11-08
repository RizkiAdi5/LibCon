-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'PARTICIPANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('INSERT', 'UPDATE', 'DELETE', 'SOFT_DELETE', 'RESTORE');

-- CreateEnum
CREATE TYPE "LogSource" AS ENUM ('WEB', 'CRON', 'IMPORT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'ACCOUNT_LOCKED', 'PASSWORD_CHANGED', 'VIEW_SUBMISSION', 'EXPORT_REPORT', 'DOWNLOAD_RAPOR', 'RESEND_ACTIVATION', 'SEND_BULK_REMINDER', 'PUBLISH_SCORES', 'RUN_SCORING', 'IMPERSONATE_VIEW');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "TokenType" AS ENUM ('ACTIVATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RegionLevel" AS ENUM ('CITY', 'DISTRICT', 'VILLAGE');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RevisionScope" AS ENUM ('SELECTED_QUESTIONS', 'ALL');

-- CreateEnum
CREATE TYPE "QuestionnaireStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('INTEGER', 'DECIMAL', 'CURRENCY', 'PERCENT', 'SHORT_TEXT', 'LONG_TEXT', 'SINGLE_CHOICE', 'MULTI_CHOICE', 'YES_NO', 'DROPDOWN', 'DATE', 'SCALE', 'URL', 'TABLE', 'FILE');

-- CreateEnum
CREATE TYPE "ConditionOperator" AS ENUM ('EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'IN', 'NOT_EMPTY');

-- CreateEnum
CREATE TYPE "ConditionEffect" AS ENUM ('SHOW', 'REQUIRE');

-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('REQUIRED', 'RANGE', 'COMPARE', 'FORMAT', 'YOY_CHANGE', 'EXPRESSION');

-- CreateEnum
CREATE TYPE "RuleSeverity" AS ENUM ('BLOCK', 'FLAG');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('NOT_STARTED', 'DRAFT', 'SUBMITTED', 'NEEDS_REVISION', 'VERIFIED', 'NOT_SUBMITTED');

-- CreateEnum
CREATE TYPE "ValidationResultStatus" AS ENUM ('OPEN', 'ACCEPTED_BY_ADMIN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "RevisionStatus" AS ENUM ('OPEN', 'RESUBMITTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SchemeStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "NodeLevel" AS ENUM ('INDICATOR', 'SUBDIMENSION', 'DIMENSION', 'INDEX');

-- CreateEnum
CREATE TYPE "NormalizationType" AS ENUM ('NONE', 'TARGET_RATIO', 'MIN_MAX', 'THRESHOLD_TABLE', 'OPTION_SCORE');

-- CreateEnum
CREATE TYPE "AggregationType" AS ENUM ('WEIGHTED_SUM', 'AVERAGE', 'FORMULA');

-- CreateEnum
CREATE TYPE "RunMode" AS ENUM ('TEST', 'OFFICIAL');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailTemplateKey" AS ENUM ('ACTIVATION', 'PASSWORD_RESET', 'ACCOUNT_LOCKED', 'REMINDER_DEADLINE', 'REMINDER_ACTIVATION', 'REMINDER_REVISION', 'SUBMISSION_RECEIPT', 'REVISION_OPENED', 'ACCOUNT_REQUEST_APPROVED', 'ACCOUNT_REQUEST_REJECTED', 'SCORE_PUBLISHED');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'OPENED', 'BOUNCED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'VALIDATED', 'COMMITTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('VALID', 'ERROR', 'IMPORTED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ImportJobType" AS ENUM ('INSTITUTIONS');

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('DEADLINE', 'ACTIVATION', 'REVISION');

-- CreateTable
CREATE TABLE "regions" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "level" "RegionLevel" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "institution_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institutions" (
    "id" UUID NOT NULL,
    "npp" TEXT NOT NULL,
    "npsn" TEXT,
    "library_name" TEXT NOT NULL,
    "institution_name" TEXT NOT NULL,
    "type_id" UUID NOT NULL,
    "region_id" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "official_email" TEXT NOT NULL,
    "whatsapp" TEXT,
    "head_name" TEXT,
    "pic_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_change_requests" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "changes" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "institution_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "role" "UserRole" NOT NULL,
    "institution_id" UUID,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "password_hash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_ACTIVATION',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "activated_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "password_changed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "TokenType" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" BIGSERIAL NOT NULL,
    "username_input" TEXT NOT NULL,
    "user_id" UUID,
    "success" BOOLEAN NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_requests" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "reject_reason" TEXT,
    "created_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "account_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_periods" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "opens_at" TIMESTAMP(3) NOT NULL,
    "closes_at" TIMESTAMP(3) NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "copied_from_id" UUID,
    "revision_deadline_days" INTEGER NOT NULL DEFAULT 7,
    "revision_scope" "RevisionScope" NOT NULL DEFAULT 'SELECTED_QUESTIONS',
    "show_ranking_to_participants" BOOLEAN NOT NULL DEFAULT false,
    "scores_published_at" TIMESTAMP(3),
    "scores_published_by" UUID,
    "scores_unpublished_at" TIMESTAMP(3),
    "scores_unpublished_by" UUID,
    "scores_unpublish_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "survey_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "period_extensions" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "institution_id" UUID,
    "new_closes_at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "period_extensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questionnaires" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "status" "QuestionnaireStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "published_at" TIMESTAMP(3),
    "published_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "questionnaires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" UUID NOT NULL,
    "questionnaire_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "evidence_label" TEXT,
    "evidence_required" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "questionnaire_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "help_text" TEXT,
    "type" "QuestionType" NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "has_evidence_url" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "copied_from_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "score_value" DECIMAL(10,4),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_institution_types" (
    "question_id" UUID NOT NULL,
    "institution_type_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "question_institution_types_pkey" PRIMARY KEY ("question_id","institution_type_id")
);

-- CreateTable
CREATE TABLE "question_conditions" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "depends_on_question_id" UUID NOT NULL,
    "operator" "ConditionOperator" NOT NULL,
    "value" JSONB NOT NULL,
    "effect" "ConditionEffect" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "question_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validation_rules" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "rule_type" "RuleType" NOT NULL,
    "params" JSONB NOT NULL,
    "severity" "RuleSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "validation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "progress_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "revision_round" INTEGER NOT NULL DEFAULT 0,
    "open_flag_count" INTEGER NOT NULL DEFAULT 0,
    "submitter_name" TEXT,
    "first_submitted_at" TIMESTAMP(3),
    "last_submitted_at" TIMESTAMP(3),
    "last_submitted_by" UUID,
    "last_saved_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "verified_by" UUID,
    "admin_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "value_number" DECIMAL(18,4),
    "value_text" TEXT,
    "value_date" DATE,
    "value_json" JSONB,
    "evidence_url" TEXT,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answer_history" (
    "id" BIGSERIAL NOT NULL,
    "answer_id" UUID NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "revision_round" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "answer_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_snapshots" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "revision_round" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "submitted_by" UUID NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "submission_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validation_results" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "severity" "RuleSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "revision_round" INTEGER NOT NULL,
    "status" "ValidationResultStatus" NOT NULL DEFAULT 'OPEN',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "validation_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revision_requests" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "round" INTEGER NOT NULL,
    "general_note" TEXT,
    "deadline_at" TIMESTAMP(3) NOT NULL,
    "status" "RevisionStatus" NOT NULL DEFAULT 'OPEN',
    "requested_by" UUID NOT NULL,
    "resubmitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "revision_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revision_request_items" (
    "id" UUID NOT NULL,
    "revision_request_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "revision_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_files" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "question_id" UUID,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "evidence_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring_schemes" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "SchemeStatus" NOT NULL DEFAULT 'DRAFT',
    "scale" DECIMAL(6,2) NOT NULL DEFAULT 100,
    "copied_from_id" UUID,
    "notes" TEXT,
    "activated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "scoring_schemes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_nodes" (
    "id" UUID NOT NULL,
    "scheme_id" UUID NOT NULL,
    "level" "NodeLevel" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "formula" TEXT,
    "normalization" "NormalizationType" NOT NULL DEFAULT 'NONE',
    "normalization_params" JSONB,
    "aggregation" "AggregationType" NOT NULL DEFAULT 'WEIGHTED_SUM',
    "is_root" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "score_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_node_edges" (
    "parent_node_id" UUID NOT NULL,
    "child_node_id" UUID NOT NULL,
    "weight" DECIMAL(5,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "score_node_edges_pkey" PRIMARY KEY ("parent_node_id","child_node_id")
);

-- CreateTable
CREATE TABLE "score_node_variables" (
    "node_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "variable_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "score_node_variables_pkey" PRIMARY KEY ("node_id","question_id")
);

-- CreateTable
CREATE TABLE "score_node_type_overrides" (
    "id" UUID NOT NULL,
    "node_id" UUID NOT NULL,
    "institution_type_id" UUID NOT NULL,
    "normalization_params" JSONB,
    "formula" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "score_node_type_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_categories" (
    "id" UUID NOT NULL,
    "scheme_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "min_score" DECIMAL(6,2) NOT NULL,
    "max_score" DECIMAL(6,2) NOT NULL,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "score_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_runs" (
    "id" UUID NOT NULL,
    "scheme_id" UUID NOT NULL,
    "mode" "RunMode" NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "submission_count" INTEGER NOT NULL DEFAULT 0,
    "error_log" TEXT,
    "triggered_by" UUID NOT NULL,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "score_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_scores" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "scheme_id" UUID NOT NULL,
    "index_score" DECIMAL(6,2) NOT NULL,
    "category_id" UUID,
    "rank_overall" INTEGER,
    "rank_in_type" INTEGER,
    "rank_in_district" INTEGER,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "submission_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_score_details" (
    "id" UUID NOT NULL,
    "submission_score_id" UUID NOT NULL,
    "node_id" UUID NOT NULL,
    "raw_value" DECIMAL(18,6),
    "normalized_value" DECIMAL(10,6),
    "weighted_value" DECIMAL(18,6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "submission_score_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" UUID NOT NULL,
    "key" "EmailTemplateKey" NOT NULL,
    "subject" TEXT NOT NULL,
    "body_html" TEXT NOT NULL,
    "available_variables" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_schedules" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "offset_days" INTEGER NOT NULL,
    "target_statuses" JSONB NOT NULL,
    "template_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "reminder_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "user_id" UUID,
    "institution_id" UUID,
    "to_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "provider_message_id" TEXT,
    "error_message" TEXT,
    "related_type" TEXT,
    "related_id" UUID,
    "sent_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_report_filters" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "is_shared" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "deleted_by" UUID,

    CONSTRAINT "saved_report_filters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL,
    "type" "ImportJobType" NOT NULL,
    "file_name" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "error_rows" INTEGER NOT NULL DEFAULT 0,
    "send_activation" BOOLEAN NOT NULL DEFAULT false,
    "committed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_job_rows" (
    "id" UUID NOT NULL,
    "import_job_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "ImportRowStatus" NOT NULL DEFAULT 'VALID',
    "errors" JSONB,
    "institution_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "import_job_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" UUID,
    "actor_role" "UserRole" NOT NULL,
    "action" "AuditAction" NOT NULL,
    "table_name" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "old_data" JSONB,
    "new_data" JSONB,
    "changed_fields" JSONB,
    "source" "LogSource" NOT NULL,
    "request_id" UUID,
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID,
    "actor_role" "UserRole" NOT NULL,
    "activity" "ActivityType" NOT NULL,
    "entity_type" TEXT,
    "entity_id" UUID,
    "description" TEXT,
    "metadata" JSONB,
    "request_id" UUID,
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "regions_code_key" ON "regions"("code");

-- CreateIndex
CREATE INDEX "regions_parent_id_idx" ON "regions"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "institution_types_code_key" ON "institution_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "institutions_npp_key" ON "institutions"("npp");

-- CreateIndex
CREATE INDEX "institutions_region_id_type_id_idx" ON "institutions"("region_id", "type_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_tokens_user_id_type_idx" ON "auth_tokens"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_hash_key" ON "sessions"("session_token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "login_attempts_user_id_idx" ON "login_attempts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_requests_created_user_id_key" ON "account_requests"("created_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "questionnaires_period_id_key" ON "questionnaires"("period_id");

-- CreateIndex
CREATE UNIQUE INDEX "questions_questionnaire_id_code_key" ON "questions"("questionnaire_id", "code");

-- CreateIndex
CREATE INDEX "submissions_period_id_status_idx" ON "submissions"("period_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_period_id_institution_id_key" ON "submissions"("period_id", "institution_id");

-- CreateIndex
CREATE INDEX "answers_question_id_idx" ON "answers"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "answers_submission_id_question_id_key" ON "answers"("submission_id", "question_id");

-- CreateIndex
CREATE INDEX "answer_history_answer_id_idx" ON "answer_history"("answer_id");

-- CreateIndex
CREATE INDEX "submission_snapshots_submission_id_idx" ON "submission_snapshots"("submission_id");

-- CreateIndex
CREATE UNIQUE INDEX "score_nodes_scheme_id_code_key" ON "score_nodes"("scheme_id", "code");

-- CreateIndex
CREATE INDEX "submission_scores_scheme_id_index_score_idx" ON "submission_scores"("scheme_id", "index_score");

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_key_key" ON "email_templates"("key");

-- CreateIndex
CREATE INDEX "email_logs_status_idx" ON "email_logs"("status");

-- CreateIndex
CREATE INDEX "email_logs_institution_id_template_id_sent_at_idx" ON "email_logs"("institution_id", "template_id", "sent_at");

-- CreateIndex
CREATE INDEX "audit_logs_table_name_record_id_created_at_idx" ON "audit_logs"("table_name", "record_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_request_id_idx" ON "audit_logs"("request_id");

-- CreateIndex
CREATE INDEX "activity_logs_user_id_created_at_idx" ON "activity_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_logs_activity_created_at_idx" ON "activity_logs"("activity", "created_at");

-- AddForeignKey
ALTER TABLE "regions" ADD CONSTRAINT "regions_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "institution_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_change_requests" ADD CONSTRAINT "institution_change_requests_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_change_requests" ADD CONSTRAINT "institution_change_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_change_requests" ADD CONSTRAINT "institution_change_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_requests" ADD CONSTRAINT "account_requests_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_requests" ADD CONSTRAINT "account_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_requests" ADD CONSTRAINT "account_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_requests" ADD CONSTRAINT "account_requests_created_user_id_fkey" FOREIGN KEY ("created_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_periods" ADD CONSTRAINT "survey_periods_copied_from_id_fkey" FOREIGN KEY ("copied_from_id") REFERENCES "survey_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_periods" ADD CONSTRAINT "survey_periods_scores_published_by_fkey" FOREIGN KEY ("scores_published_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_periods" ADD CONSTRAINT "survey_periods_scores_unpublished_by_fkey" FOREIGN KEY ("scores_unpublished_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_extensions" ADD CONSTRAINT "period_extensions_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "survey_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_extensions" ADD CONSTRAINT "period_extensions_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaires" ADD CONSTRAINT "questionnaires_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "survey_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaires" ADD CONSTRAINT "questionnaires_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_questionnaire_id_fkey" FOREIGN KEY ("questionnaire_id") REFERENCES "questionnaires"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_questionnaire_id_fkey" FOREIGN KEY ("questionnaire_id") REFERENCES "questionnaires"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_copied_from_id_fkey" FOREIGN KEY ("copied_from_id") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_institution_types" ADD CONSTRAINT "question_institution_types_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_institution_types" ADD CONSTRAINT "question_institution_types_institution_type_id_fkey" FOREIGN KEY ("institution_type_id") REFERENCES "institution_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_conditions" ADD CONSTRAINT "question_conditions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_conditions" ADD CONSTRAINT "question_conditions_depends_on_question_id_fkey" FOREIGN KEY ("depends_on_question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_rules" ADD CONSTRAINT "validation_rules_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "survey_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_last_submitted_by_fkey" FOREIGN KEY ("last_submitted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_updated_by_user_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_history" ADD CONSTRAINT "answer_history_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "answers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_snapshots" ADD CONSTRAINT "submission_snapshots_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_snapshots" ADD CONSTRAINT "submission_snapshots_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_results" ADD CONSTRAINT "validation_results_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_results" ADD CONSTRAINT "validation_results_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_results" ADD CONSTRAINT "validation_results_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "validation_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_results" ADD CONSTRAINT "validation_results_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision_requests" ADD CONSTRAINT "revision_requests_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision_requests" ADD CONSTRAINT "revision_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision_request_items" ADD CONSTRAINT "revision_request_items_revision_request_id_fkey" FOREIGN KEY ("revision_request_id") REFERENCES "revision_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision_request_items" ADD CONSTRAINT "revision_request_items_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_schemes" ADD CONSTRAINT "scoring_schemes_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "survey_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_schemes" ADD CONSTRAINT "scoring_schemes_copied_from_id_fkey" FOREIGN KEY ("copied_from_id") REFERENCES "scoring_schemes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_nodes" ADD CONSTRAINT "score_nodes_scheme_id_fkey" FOREIGN KEY ("scheme_id") REFERENCES "scoring_schemes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_node_edges" ADD CONSTRAINT "score_node_edges_parent_node_id_fkey" FOREIGN KEY ("parent_node_id") REFERENCES "score_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_node_edges" ADD CONSTRAINT "score_node_edges_child_node_id_fkey" FOREIGN KEY ("child_node_id") REFERENCES "score_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_node_variables" ADD CONSTRAINT "score_node_variables_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "score_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_node_variables" ADD CONSTRAINT "score_node_variables_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_node_type_overrides" ADD CONSTRAINT "score_node_type_overrides_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "score_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_node_type_overrides" ADD CONSTRAINT "score_node_type_overrides_institution_type_id_fkey" FOREIGN KEY ("institution_type_id") REFERENCES "institution_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_categories" ADD CONSTRAINT "score_categories_scheme_id_fkey" FOREIGN KEY ("scheme_id") REFERENCES "scoring_schemes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_runs" ADD CONSTRAINT "score_runs_scheme_id_fkey" FOREIGN KEY ("scheme_id") REFERENCES "scoring_schemes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_runs" ADD CONSTRAINT "score_runs_triggered_by_fkey" FOREIGN KEY ("triggered_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_scores" ADD CONSTRAINT "submission_scores_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "score_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_scores" ADD CONSTRAINT "submission_scores_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_scores" ADD CONSTRAINT "submission_scores_scheme_id_fkey" FOREIGN KEY ("scheme_id") REFERENCES "scoring_schemes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_scores" ADD CONSTRAINT "submission_scores_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "score_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_score_details" ADD CONSTRAINT "submission_score_details_submission_score_id_fkey" FOREIGN KEY ("submission_score_id") REFERENCES "submission_scores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_score_details" ADD CONSTRAINT "submission_score_details_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "score_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_schedules" ADD CONSTRAINT "reminder_schedules_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "survey_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_schedules" ADD CONSTRAINT "reminder_schedules_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_report_filters" ADD CONSTRAINT "saved_report_filters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_job_rows" ADD CONSTRAINT "import_job_rows_import_job_id_fkey" FOREIGN KEY ("import_job_id") REFERENCES "import_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_job_rows" ADD CONSTRAINT "import_job_rows_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
