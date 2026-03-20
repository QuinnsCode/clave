-- CreateTable
CREATE TABLE "SessionTranscript" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "siteKey" TEXT NOT NULL,
    "chunks" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "SessionTranscript_sessionId_idx" ON "SessionTranscript"("sessionId");
