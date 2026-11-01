-- CreateTable
CREATE TABLE "session_diarization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organization_id" TEXT NOT NULL,
    "site_key" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "peer_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "provider" TEXT NOT NULL,
    "provider_opts" TEXT,
    "r2_key" TEXT,
    "result" TEXT,
    "word_count" INTEGER,
    "speaker_count" INTEGER,
    "duration_sec" REAL,
    "transcript" TEXT,
    "triggered_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" DATETIME,
    "completed_at" DATETIME,
    CONSTRAINT "session_diarization_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "session_diarization_organization_id_idx" ON "session_diarization"("organization_id");

-- CreateIndex
CREATE INDEX "session_diarization_session_id_idx" ON "session_diarization"("session_id");

-- CreateIndex
CREATE INDEX "session_diarization_session_id_peer_id_idx" ON "session_diarization"("session_id", "peer_id");

-- CreateIndex
CREATE INDEX "session_diarization_site_key_idx" ON "session_diarization"("site_key");

-- CreateIndex
CREATE INDEX "session_diarization_organization_id_created_at_idx" ON "session_diarization"("organization_id", "created_at");
