// src/worker.ts
import { defineApp } from "rwsdk/worker";
import { route, render, prefix } from "rwsdk/router";
import { env } from "cloudflare:workers";
import { type Organization } from "@/db";
import {
  initializeServices,
  runMiddleware,
  extractOrgFromSubdomain,
  getRouteHeaders,
  setCommonHeaders,
} from "@/lib/middleware";
import { runAlertPoller } from "@/lib/alerts/poller";
import { handleAlertQueue } from "@/lib/alerts/queue-consumer";
import type { AlertQueueMessage } from "@/lib/alerts/queue-consumer";
import { Document } from "@/app/Document";
import { userRoutes } from "@/app/pages/user/routes";
import { apiRoutes } from "@/app/api/routes";
import { pokemonHoneypot } from "./lib/middleware/pokemonHoneypot";
import { changelogRoute, aboutRoute, termsRoute } from "@/app/pages/staticRoutes";
import type { SummarizeSessionMessage } from "@/app/workers/session-summary-worker";
import OrgNotFoundPage from "@/app/pages/errors/OrgNotFoundPage";
import NoAccessPage from "@/app/pages/errors/NoAccessPage";
import LandingPage from "@/app/pages/landing/LandingPage";
import QlaveTestPage from "@/app/pages/qlave-test/QlaveTestPage";
import DashboardPage from "@/app/pages/dashboard/DashboardPage";
import PodsPage from "@/app/pages/pods/PodsPage";
import PodDetailPage from "@/app/pages/pods/PodDetailPage"
import SessionPage from "@/app/pages/session/SessionPage";
import RecapPage from "@/app/pages/session/RecapPage";
import TranscribeTestPage from "@/app/pages/transcribe/TranscribeTestPage";
import { LoginPage } from "@/app/pages/user/LoginPage";
import SignupPage from "@/app/pages/user/SignupPage";
import AdminUpgradePage from "@/app/pages/admin/AdminUpgradePage";
import TestPage from "@/app/pages/test/TestPage";
import QollabPage from "@/app/pages/qollab/QollabPage";

// ── Durable Object exports ────────────────────────────────────────────────────
export { SessionDurableObject } from "./session/durableObject";
export { QlaveSessionDO } from "./durableObjects/qlaveSessionDO";
export { UserSessionDO } from "./durableObjects/userSessionDO";
export { RecordingCoordinatorDO } from "./durableObjects/recordingCoordinatorDO";
export { QollabWhiteboardDO } from "./durableObjects/qollabWhiteboardDO";
export { DiarizeContainer } from "./durableObjects/diarizeContainer";

// ── App context type ──────────────────────────────────────────────────────────
export type AppContext = {
  session: any | null;
  user: any | null;
  organization: Organization | null;
  userRole: string | null;
  orgError: "ORG_NOT_FOUND" | "NO_ACCESS" | "ERROR" | null;
};

// ── URL normalization ─────────────────────────────────────────────────────────

function normalizeUrl(request: Request): Response | null {
  const url = new URL(request.url);
  const PRIMARY_DOMAIN = (env as any).PRIMARY_DOMAIN || "example.com";
  if (url.hostname.includes("localhost")) return null;

  let shouldRedirect = false;
  let newHostname = url.hostname;
  let newProtocol = url.protocol;

  if (url.protocol === "http:") { newProtocol = "https:"; shouldRedirect = true; }
  if (url.hostname === `www.${PRIMARY_DOMAIN}`) { newHostname = PRIMARY_DOMAIN; shouldRedirect = true; }

  if (shouldRedirect) {
    return new Response(null, {
      status: 301,
      headers: { Location: `${newProtocol}//${newHostname}${url.pathname}${url.search}${url.hash}` },
    });
  }
  return null;
}

// ── App ───────────────────────────────────────────────────────────────────────
const app = defineApp([
  setCommonHeaders(),

  async ({ request }: { request: Request }) => {
    const redirect = normalizeUrl(request);
    if (redirect) return redirect;
  },

  async ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    if (url.hostname === "cdn.qlave.dev") return fetch(request);
  },

  async ({ ctx, request, response }: { ctx: AppContext; request: Request; response: ResponseInit & { headers: Headers } }) => {
    const { pathname } = new URL(request.url);
    for (const [key, value] of Object.entries(getRouteHeaders(pathname))) {
      response.headers.set(key, value);
    }

    try {
      await initializeServices();

      const redirect = await runMiddleware(ctx, request);
      if (redirect) return redirect;

      if (ctx.orgError) {
        const url = new URL(request.url);
        if (
          url.pathname.startsWith("/api/") ||
          url.pathname.startsWith("/__") ||
          url.pathname.startsWith("/user/") ||
          url.pathname.startsWith("/login") ||
          url.pathname.startsWith("/signup") ||
          url.pathname.startsWith("/orgs/new") ||
          url.pathname.startsWith("/s")
        ) return;

        const mainDomain = url.hostname.includes("localhost")
          ? "localhost:5173"
          : (env as any).PRIMARY_DOMAIN || "example.com";

        if (ctx.orgError === "ORG_NOT_FOUND") {
          const orgSlug = extractOrgFromSubdomain(request);
          return new Response(null, {
            status: 302,
            headers: { Location: `${url.protocol}//${mainDomain}/orgs/new?suggested=${orgSlug}` },
          });
        }
        if (ctx.orgError === "NO_ACCESS") {
          return new Response(null, { status: 302, headers: { Location: "/login" } });
        }
      }

      const { autoCreateOrgMiddleware } = await import("@/lib/middleware/autoCreateOrgMiddleware");
      const result = await autoCreateOrgMiddleware(ctx, request);
      if (result) return result;

    } catch (error) {
      console.error("Middleware error:", error);
      ctx.session      = null;
      ctx.user         = null;
      ctx.organization = null;
      ctx.userRole     = null;
      ctx.orgError     = null;
    }
  },

  // ── Internal DO routes ────────────────────────────────────────────────────

  route("/__user-session", async ({ request, ctx }: { request: Request; ctx: AppContext }) => {
    const url    = new URL(request.url);
    const userId = url.searchParams.get("userId");
    if (!userId) return new Response("Missing userId", { status: 400 });
  
    // WebSocket upgrades come from the client — verify the requesting user owns this DO
    // Skip auth for internal server-to-DO calls (no user in ctx)
    if (ctx.user && ctx.user.id !== userId) {
      return new Response("Unauthorized", { status: 401 });
    }
  
    const id = env.USER_SESSION_DO.idFromName(userId);
    return env.USER_SESSION_DO.get(id).fetch(request);
  }),

  route("/__qlave/:sessionId", async ({ request, params }) => {
    const { authorizeSignaling, forwardToSession } = await import("@/lib/qlave/signalingGate");
    const auth = await authorizeSignaling(request, params.sessionId);
    if (auth instanceof Response) return auth;
    const id = env.QLAVE_SESSION_DO.idFromName(params.sessionId);
    return env.QLAVE_SESSION_DO.get(id).fetch(forwardToSession(request, auth));
  }),
  
  route("/__qollab/:sessionId", async ({ request, params }) => {
    const id = env.QOLLAB_WHITEBOARD_DO.idFromName(params.sessionId);
    return env.QOLLAB_WHITEBOARD_DO.get(id).fetch(request);
  }),


  // ── API routes ────────────────────────────────────────────────────────────

  prefix("/api", apiRoutes),

  // honeypots lol

  route("/wordpress", pokemonHoneypot),
  route("/wordpress/$", pokemonHoneypot),  // catch /wordpress/anything
  route("/wp", pokemonHoneypot),
  route("/wp/$", pokemonHoneypot),
  route("/wp-admin", pokemonHoneypot),
  route("/wp-admin/$", pokemonHoneypot),

  // ── Frontend routes ───────────────────────────────────────────────────────

  render(Document, [
    route("/org-not-found", OrgNotFoundPage),
    route("/no-access", NoAccessPage),

    route("/cost-calculator", TestPage),
    route("/login",  LoginPage),
    route("/signup", SignupPage),
    prefix("/user", userRoutes),

    changelogRoute,
    aboutRoute,
    termsRoute,

    route("/dashboard", DashboardPage),
    route("/pods", PodsPage),
    route("/pods/:slug", PodDetailPage),


    prefix("/admin", [
      route("/upgrade", AdminUpgradePage),
    ]),
    route("/qlave-test", QlaveTestPage),
    route("/transcribe-test", TranscribeTestPage),
    route("/s", SessionPage),
    route("/s/:code", SessionPage),
    route("/s/:code/recap", RecapPage),
    route("/qollab/:sessionId", QollabPage), 

    route("/", LandingPage),

    route("/*", ({ request }: { request: Request }) => {
      const { pathname } = new URL(request.url);
      if (
        pathname.startsWith("/qlave-test") ||
        pathname.startsWith("/transcribe-test") ||
        pathname.startsWith("/api/") ||
        pathname.startsWith("/__") ||
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/pods") ||
        pathname.startsWith("/webhooks/") ||
        pathname.startsWith("/s") ||
        pathname.startsWith("/qollab")
      ) return;
      return new Response(null, { status: 301, headers: { Location: "/" } });
    }),
  ]),
]);

export default {
  fetch: app.fetch,

  // ── Cron ─────────────────────────────────────────────────────────────────
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runAlertPoller(env));
  },

  // ── Queues ────────────────────────────────────────────────────────────────
  async queue(batch: MessageBatch<unknown>, env: Env, _ctx: ExecutionContext) {
    switch (batch.queue) {
      case "ALERT_QUEUE": {
        return handleAlertQueue(batch as MessageBatch<AlertQueueMessage>, env);
      }
 
      case "qlave-recording-storage-queue": {
        const { handleRecordingQueue } = await import("@/lib/plugins/recording/queue");
        return handleRecordingQueue(batch as MessageBatch<any>, env);
      }
 
      case "qlave-diarize-queue": {   // NEW
        const { handleDiarizeQueue } = await import("@/lib/diarization/queueConsumer");
        return handleDiarizeQueue(batch as MessageBatch<any>, env);
      }
 
      case "qlave-transcription-usage": {
        // Two message types share this queue — split by body.type.
        // summarize-session goes to session-summary-worker; everything else
        // is treated as a usage event for transcription-usage-worker.
        const summarize = batch.messages.filter(m => (m.body as any)?.type === "summarize-session");
        const usage     = batch.messages.filter(m => (m.body as any)?.type !== "summarize-session");
 
        for (const msg of summarize) {
          try {
            const { handleSummarizeSession } = await import("@/app/workers/session-summary-worker");
            await handleSummarizeSession(msg.body as SummarizeSessionMessage, env);
            msg.ack();
          } catch (e) {
            console.error("[queue] summarize-session failed:", e);
            msg.retry();
          }
        }
 
        if (usage.length > 0) {
          // One insert for the batch; ack only after it lands so rows are written once.
          // (Handing the consumer a fake batch made its ackAll() throw after the insert,
          // so every row was retried and written again.)
          const { writeUsageRows } = await import("@/app/workers/transcription-usage-worker");
          try {
            await writeUsageRows(usage.map(m => m.body as any));
            for (const m of usage) m.ack();
          } catch (e) {
            console.error("[queue] usage insert failed:", e);
            for (const m of usage) m.retry();
          }
        }
        return;
      }
 
      default:
        console.error(`[queue] no handler registered for queue: ${batch.queue}`);
        batch.retryAll();
        return;
    }
  },
} satisfies ExportedHandler<Env>;