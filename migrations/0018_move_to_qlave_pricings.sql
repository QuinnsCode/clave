-- DropIndex
DROP INDEX "SessionTranscript_sessionId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "SessionTranscript";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "session_transcript" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "site_key" TEXT NOT NULL,
    "chunks" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "session_summary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "site_key" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_org_plugin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organization_id" TEXT NOT NULL,
    "plugin" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "mode" TEXT NOT NULL DEFAULT 'sample',
    "tier" TEXT NOT NULL DEFAULT 'free',
    "trial_started_at" DATETIME,
    "trial_ends_at" DATETIME,
    "trial_minute_cap" INTEGER NOT NULL DEFAULT 60,
    "max_minutes_per_user" INTEGER,
    "config" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "org_plugin_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_org_plugin" ("config", "created_at", "enabled", "id", "max_minutes_per_user", "mode", "organization_id", "plugin", "tier", "trial_ends_at", "trial_minute_cap", "trial_started_at", "updated_at") SELECT "config", "created_at", "enabled", "id", "max_minutes_per_user", "mode", "organization_id", "plugin", "tier", "trial_ends_at", "trial_minute_cap", "trial_started_at", "updated_at" FROM "org_plugin";
DROP TABLE "org_plugin";
ALTER TABLE "new_org_plugin" RENAME TO "org_plugin";
CREATE INDEX "org_plugin_organization_id_idx" ON "org_plugin"("organization_id");
CREATE UNIQUE INDEX "org_plugin_organization_id_plugin_key" ON "org_plugin"("organization_id", "plugin");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "session_transcript_session_id_idx" ON "session_transcript"("session_id");

-- CreateIndex
CREATE INDEX "session_transcript_site_key_idx" ON "session_transcript"("site_key");

-- CreateIndex
CREATE INDEX "session_summary_session_id_idx" ON "session_summary"("session_id");

-- CreateIndex
CREATE INDEX "session_summary_site_key_idx" ON "session_summary"("site_key");
