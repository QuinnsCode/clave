import { defineConfig } from "vite";
import { redwood } from "rwsdk/vite";
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  optimizeDeps: {
    exclude: ['rwsdk/use-synced-state/worker'],
  },
  environments: {
    ssr: {
      optimizeDeps: {
        exclude: ['rwsdk/use-synced-state/worker'],
      }
    },
    worker: {
      optimizeDeps: {
        exclude: ['rwsdk/use-synced-state/worker'],
      }
    },
  },
  plugins: [
    cloudflare({
      viteEnvironment: { name: "worker" },
      // QLAVE_LOCAL_ONLY=1 runs fully offline (no Workers AI proxy): video works, transcription doesn't.
      remoteBindings: process.env.QLAVE_LOCAL_ONLY !== "1",
      // ...and skips building the diarize container (no Docker needed).
      ...(process.env.QLAVE_LOCAL_ONLY === "1"
        ? { config: (c: any) => ({ dev: { ...c.dev, enable_containers: false } }) }
        : {}),
    }),
    redwood(),
    tailwindcss()
  ],
});