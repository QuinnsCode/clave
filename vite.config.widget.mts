import { defineConfig } from "vite";
import { readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as {
  version: string;
};

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/widget/index.ts"),
      name: "QlaveWidget",
      formats: ["iife"],
      fileName: () => "widget.js",
    },
    outDir: "dist/widget",
    emptyOutDir: true,
    minify: true,
    rollupOptions: {
      external: [],
      output: {
        extend: false,
        banner: `/* Qlave Widget v${pkg.version} | https://qlave.dev */`,
      },
    },
  },
  define: {
    __WIDGET_VERSION__: JSON.stringify(pkg.version),
  },
});
