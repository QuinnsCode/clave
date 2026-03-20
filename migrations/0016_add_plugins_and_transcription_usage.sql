-- CreateTable
CREATE TABLE "org_plugin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organization_id" TEXT NOT NULL,
    "plugin" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "mode" TEXT NOT NULL DEFAULT 'sample',
    "tier" TEXT NOT NULL DEFAULT 'starter',
    "trial_started_at" DATETIME,
    "trial_ends_at" DATETIME,
    "trial_minute_cap" INTEGER NOT NULL DEFAULT 60,
    "max_minutes_per_user" INTEGER,
    "config" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "org_plugin_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "transcription_usage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT,
    "site_key" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "audio_seconds" REAL NOT NULL,
    "neurons_used" REAL NOT NULL,
    "cost_usd" REAL NOT NULL,
    "mode" TEXT NOT NULL,
    "recorded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transcription_usage_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_site" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "site_key" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT,
    "domains" TEXT NOT NULL DEFAULT '',
    "organization_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "site_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "site_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_site" ("created_at", "domains", "id", "name", "site_key", "updated_at", "user_id") SELECT "created_at", "domains", "id", "name", "site_key", "updated_at", "user_id" FROM "site";
DROP TABLE "site";
ALTER TABLE "new_site" RENAME TO "site";
CREATE UNIQUE INDEX "site_site_key_key" ON "site"("site_key");
CREATE INDEX "site_user_id_idx" ON "site"("user_id");
CREATE INDEX "site_site_key_idx" ON "site"("site_key");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "org_plugin_organization_id_idx" ON "org_plugin"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_plugin_organization_id_plugin_key" ON "org_plugin"("organization_id", "plugin");

-- CreateIndex
CREATE INDEX "transcription_usage_organization_id_idx" ON "transcription_usage"("organization_id");

-- CreateIndex
CREATE INDEX "transcription_usage_user_id_idx" ON "transcription_usage"("user_id");

-- CreateIndex
CREATE INDEX "transcription_usage_organization_id_recorded_at_idx" ON "transcription_usage"("organization_id", "recorded_at");

-- CreateIndex
CREATE INDEX "transcription_usage_model_recorded_at_idx" ON "transcription_usage"("model", "recorded_at");

-- CreateIndex
CREATE INDEX "transcription_usage_session_id_idx" ON "transcription_usage"("session_id");