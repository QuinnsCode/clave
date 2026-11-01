// src/app/api/routes.ts
import { route, prefix } from "rwsdk/router";
import { initAuth } from "@/lib/auth";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { initializeServices } from "@/lib/middleware";
import { recordingRoutes } from "@/app/api/recording/routes";

export const apiRoutes = [
  route("/stripe/create-checkout", async ({ request, ctx }) => {
    const { default: handler } = await import("@/app/api/stripe/create-checkout");
    return handler({ request, ctx } as any);
  }),

  route("/auth/*", async ({ request }) => {
    try {
      if (request.url.includes("/sign-up") && request.method === "POST") {
        const body = await request.clone().json() as any;
        if (body.turnstileToken) {
          const isValid = await verifyTurnstileToken(body.turnstileToken);
          if (!isValid) return new Response(JSON.stringify({ error: "Bot protection verification failed" }), { status: 400, headers: { "Content-Type": "application/json" } });
        }
      }
      await initializeServices();
      return await initAuth().handler(request);
    } catch (error) {
      return new Response(JSON.stringify({ error: "Auth failed", message: String(error) }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }),

  route("/webhooks/:service", async ({ request, params, ctx }) => {
    if (params.service === "stripe") {
      const { default: handler } = await import("@/app/api/webhooks/stripe-wh");
      return handler({ request });
    }
    if (params.service === "lemonsqueezy") {
      const { default: handler } = await import("@/app/api/webhooks/lemonsqueezy-wh");
      return handler({ request, ctx });
    }
    return Response.json({ error: "Webhook not supported" }, { status: 404 });
  }),

  // ── Qlave ──────────────────────────────────────────────────────────────────

  route("/qlave/usage", async ({ request, ctx }) => {
    const { default: handler } = await import("@/app/api/qlave/usage");
    return handler({ request, ctx });
  }),

  route("/qlave/createRoom", async ({ request, ctx }) => {
    const { default: handler } = await import("@/app/api/qlave/createRoom");
    return handler({ request, ctx });
  }),

  route("/qlave/rotate-site-key", async ({ request, ctx }) => {
    const { default: handler } = await import("@/lib/qlave/rotateSiteKey");
    return handler({ request, ctx });
  }),

  route("/qlave/transcribe", async ({ request }) => {
    const { default: handler } = await import("@/app/api/qlave/transcribe");
    return handler({ request });
  }),
  
  route("/diarization/test", async ({ request, ctx }) => {
    const { default: handler } = await import("@/lib/diarization/diarize-test");
    return handler({ request, ctx });
  }),

  route("/diarization/run", async ({ request, ctx }) => {
    const { default: handler } = await import("@/lib/diarization/run");
    return handler({ request, ctx });
  }),

  route("/diarization/run-v2", async ({ request, ctx }) => {
    const { default: handler } = await import("@/lib/diarization/run-v2");
    return handler({ request, ctx });
  }),

  route("/qlave/test-ticket", async ({ request, ctx }) => {
    const { default: handler } = await import("@/app/api/qlave/testTicket");
    return handler({ request, ctx });
  }),

  route("/qlave/ice", async ({ request }) => {
    const { default: handler } = await import("@/app/api/qlave/ice");
    return handler({ request });
  }),

  // ── Headless v1 (eqosys bearer) ───────────────────────────────────────────

  route("/v1/rooms", async ({ request }) => {
    const h = await import("@/app/api/v1/handlers");
    if (request.method === "OPTIONS") return h.preflight();
    if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: h.CORS });
    return h.createRoomV1(request);
  }),

  route("/v1/rooms/:id/join", async ({ request, params }) => {
    const h = await import("@/app/api/v1/handlers");
    if (request.method === "OPTIONS") return h.preflight();
    if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: h.CORS });
    return h.joinRoomV1(request, params.id);
  }),

  route("/v1/ice", async ({ request }) => {
    const h = await import("@/app/api/v1/handlers");
    if (request.method === "OPTIONS") return h.preflight();
    return h.iceV1(request);
  }),

  route("/v1/transcribe", async ({ request }) => {
    const h = await import("@/app/api/v1/handlers");
    if (request.method === "OPTIONS") return h.preflight();
    if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: h.CORS });
    return h.transcribeV1(request);
  }),

  // ── Recording ─────────────────────────────────────────────────────────────

  prefix("/recording", recordingRoutes),


  route("/session/transcript", async ({ request, ctx }) => {
    const { default: handler } = await import("@/app/api/session/transcript");
    return handler({ request, ctx });
  }),

  // ── Catch-all dynamic loader ───────────────────────────────────────────────

  route("*", async ({ request, params, ctx }) => {
    const apiPath = params.$0;
    if (!apiPath) return new Response(JSON.stringify({ error: "API endpoint not specified" }), { status: 400, headers: { "Content-Type": "application/json" } });

    try {
      const handler = await import(/* @vite-ignore */ `@/app/api/${apiPath}`);
      return await handler.default({ request, ctx, params, method: request.method });
    } catch (error: any) {
      if (error.message?.includes("Cannot resolve module")) {
        return new Response(JSON.stringify({ error: "API endpoint not found", path: `/api/${apiPath}` }), { status: 404, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "Internal server error", message: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }),
];