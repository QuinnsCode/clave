-- AlterTable
ALTER TABLE "session_diarization" ADD COLUMN "cleanup_bytes" INTEGER;
ALTER TABLE "session_diarization" ADD COLUMN "cleanup_error" TEXT;
ALTER TABLE "session_diarization" ADD COLUMN "cleanup_generated_at" DATETIME;
ALTER TABLE "session_diarization" ADD COLUMN "cleanup_key" TEXT;
ALTER TABLE "session_diarization" ADD COLUMN "cleanup_status" TEXT;
