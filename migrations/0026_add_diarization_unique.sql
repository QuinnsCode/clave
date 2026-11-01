-- CreateIndex
CREATE UNIQUE INDEX "session_diarization_session_id_peer_id_tag_key" ON "session_diarization"("session_id", "peer_id", "tag");
