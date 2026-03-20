'use server'
// app/serverActions/sessions/deleteSession.ts

import { db } from '@/db'
import { getOrCreateSite } from '@/lib/qlave/siteService'

export async function deleteSession(
  userId: string,
  sessionId: string,
): Promise<{ error?: string }> {
  try {
    const site = await getOrCreateSite(userId)

    // Verify ownership — only delete if this session belongs to the user's site
    const log = await db.qlaveSessionLog.findFirst({
      where: { sessionId, siteKey: site.siteKey },
      select: { id: true },
    })

    if (!log) return { error: 'Session not found' }

    // Delete transcript, summary, and log in parallel
    await Promise.all([
      db.sessionTranscript.deleteMany({ where: { sessionId } }),
      db.sessionSummary.deleteMany({ where: { sessionId } }),
    ])

    await db.qlaveSessionLog.deleteMany({ where: { sessionId, siteKey: site.siteKey } })

    return {}
  } catch (err) {
    console.error('[deleteSession]', err)
    return { error: 'Failed to delete session' }
  }
}