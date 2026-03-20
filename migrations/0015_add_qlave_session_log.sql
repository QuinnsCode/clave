-- CreateTable
CREATE TABLE "qlave_session_log" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "site_key" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "started_at" DATETIME NOT NULL,
  "ended_at" DATETIME,
  "peak_peers" INTEGER NOT NULL DEFAULT 0,
  "message_count" INTEGER NOT NULL DEFAULT 0,
  "duration_ms" INTEGER,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "qlave_session_log_site_key_idx" ON "qlave_session_log"("site_key");
CREATE INDEX "qlave_session_log_started_at_idx" ON "qlave_session_log"("started_at");
CREATE INDEX "qlave_session_log_session_id_idx" ON "qlave_session_log"("session_id");