-- CreateTable
CREATE TABLE "recording_manifest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "site_key" TEXT NOT NULL,
    "r2_key" TEXT NOT NULL,
    "peer_count" INTEGER NOT NULL DEFAULT 0,
    "assembled_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "recording_manifest_session_id_key" ON "recording_manifest"("session_id");

-- CreateIndex
CREATE INDEX "recording_manifest_org_id_idx" ON "recording_manifest"("org_id");

-- CreateIndex
CREATE INDEX "recording_manifest_session_id_idx" ON "recording_manifest"("session_id");

-- CreateIndex
CREATE INDEX "recording_manifest_site_key_idx" ON "recording_manifest"("site_key");
