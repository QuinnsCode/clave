// src/durableObjects/diarizeContainer.ts
//
// Durable Object wrapping the diarize container.
// Extends Container from @cloudflare/containers which handles the lifecycle
// boilerplate (cold start, sleep, request routing into the container).
//
// We don't add custom routing here — calls to env.DIARIZE_CONTAINER.get(id)
// .fetch(req) get proxied straight to the container's HTTP server on
// defaultPort (8080).
//
// Per-session DO ID is used by callers: env.DIARIZE_CONTAINER.idFromName(sessionId)
// — that gives each session its own container instance, isolated and parallelizable.

import { Container } from "@cloudflare/containers";

export class DiarizeContainer extends Container {
  // Must match EXPOSE in Dockerfile.diarize and Bun.serve port in server.ts
  defaultPort = 8080;

  // Scale to zero after this much idle time. 5 minutes lets a session that
  // finishes diarization and then runs again (re-trigger, retry) reuse the
  // warm instance. Cold start is ~2-3s.
  sleepAfter = "5m";

  // No custom lifecycle hooks needed. The base Container class handles:
  //   - starting the container on first request
  //   - proxying fetch() into the container
  //   - hibernating after sleepAfter
  //   - restarting on next request
}