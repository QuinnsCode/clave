// src/app/api/recording/routes.ts
// Recording plugin API routes — imported into main apiRoutes via prefix.
// Add new recording endpoints here, never in the main routes.ts.

import { route } from "rwsdk/router";

export const recordingRoutes = [
  route("/presign", async ({ request }) => {
    const { default: handler } = await import("@/app/api/recording/presign");
    return handler({ request });
  }),

  route("/chunk-done", async ({ request }) => {
    const { default: handler } = await import("@/app/api/recording/chunk-done");
    return handler({ request });
  }),

  route("/status", async ({ request }) => {
    const { default: handler } = await import("@/app/api/recording/status");
    return handler({ request });
  }),
];