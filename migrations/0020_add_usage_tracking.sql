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
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_qlave_session_log" ("created_at", "duration_ms", "ended_at", "id", "message_count", "peak_peers", "session_id", "site_key", "started_at") SELECT "created_at", "duration_ms", "ended_at", "id", "message_count", "peak_peers", "session_id", "site_key", "started_at" FROM "qlave_session_log";
DROP TABLE "qlave_session_log";
ALTER TABLE "new_qlave_session_log" RENAME TO "qlave_session_log";
CREATE INDEX "qlave_session_log_site_key_idx" ON "qlave_session_log"("site_key");
CREATE INDEX "qlave_session_log_started_at_idx" ON "qlave_session_log"("started_at");
CREATE INDEX "qlave_session_log_session_id_idx" ON "qlave_session_log"("session_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
