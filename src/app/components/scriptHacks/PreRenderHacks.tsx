// src/app/components/scriptHacks/PreRenderHacks.tsx
// Inline scripts injected before first paint.
// Add any new prerender scripts by importing their content and appending.

import { themeScriptContent } from "@/lib/scriptHacks/themeScript";

const scripts = [
  themeScriptContent,
  // add more here
].join(";");

export function PreRenderHacks() {
  return <script dangerouslySetInnerHTML={{ __html: scripts }} />;
}