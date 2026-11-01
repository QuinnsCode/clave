-- AlterTable
ALTER TABLE "session_diarization" ADD COLUMN "word_overrides" TEXT;

-- CreateTable
CREATE TABLE "pod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "pod_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "pod_anchor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pod_id" TEXT NOT NULL,
    "canonical" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pod_anchor_pod_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "pod" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_qlave_session_log" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "site_key" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "started_at" DATETIME NOT NULL,
    "ended_at" DATETIME,
    "peak_peers" INTEGER NOT NULL DEFAULT 0,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER,
    "peerMinutes" INTEGER NOT NULL DEFAULT 0,
    "transcriptChunks" INTEGER NOT NULL DEFAULT 0,
    "silencePct" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pod_id" TEXT,
    CONSTRAINT "qlave_session_log_pod_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "pod" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_qlave_session_log" ("created_at", "duration_ms", "ended_at", "id", "message_count", "peak_peers", "peerMinutes", "session_id", "silencePct", "site_key", "started_at", "transcriptChunks") SELECT "created_at", "duration_ms", "ended_at", "id", "message_count", "peak_peers", "peerMinutes", "session_id", "silencePct", "site_key", "started_at", "transcriptChunks" FROM "qlave_session_log";
DROP TABLE "qlave_session_log";
ALTER TABLE "new_qlave_session_log" RENAME TO "qlave_session_log";
CREATE INDEX "qlave_session_log_site_key_idx" ON "qlave_session_log"("site_key");
CREATE INDEX "qlave_session_log_started_at_idx" ON "qlave_session_log"("started_at");
CREATE INDEX "qlave_session_log_session_id_idx" ON "qlave_session_log"("session_id");
CREATE INDEX "qlave_session_log_pod_id_idx" ON "qlave_session_log"("pod_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "pod_organization_id_idx" ON "pod"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "pod_organization_id_slug_key" ON "pod"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "pod_anchor_pod_id_idx" ON "pod_anchor"("pod_id");

-- CreateIndex
CREATE UNIQUE INDEX "pod_anchor_pod_id_canonical_key" ON "pod_anchor"("pod_id", "canonical");
