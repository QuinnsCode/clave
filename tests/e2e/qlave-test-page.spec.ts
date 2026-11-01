// tests/e2e/qlave-test-page.spec.ts
// The /qlave-test dev page: two signed-in tabs with the same Session ID see each other.
import { test, expect, chromium, type BrowserContext } from "@playwright/test";

const BASE = process.env.QLAVE_BASE_URL ?? "http://localhost:5173";

async function signIn(ctx: BrowserContext) {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const res = await ctx.request.post(`${BASE}/api/auth/sign-up/email`, {
    headers: { origin: BASE },
    data: { email, password: "Passw0rd!Passw0rd", name: "Tester" },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  // Auth cookies are Secure (__Secure-*). Chrome counts localhost as secure, so add them explicitly.
  const cookies = res.headersArray().filter(h => h.name.toLowerCase() === "set-cookie").map(h => {
    const [pair] = h.value.split(";");
    const i = pair.indexOf("=");
    const host = new URL(BASE).hostname;
    return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: host, path: "/", secure: true, sameSite: "Lax" as const };
  });
  await ctx.addCookies(cookies);
}

test("two signed-in tabs on /qlave-test connect", async () => {
  test.setTimeout(120_000);
  const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const room = `e2e-${Date.now()}`;
  const pages = [];
  for (const name of ["Ana", "Ben"]) {
    const ctx = await browser.newContext({ permissions: ["camera", "microphone"] });
    await signIn(ctx);
    const page = await ctx.newPage();
    // Type as soon as the HTML arrives, before React hydrates: the text must survive.
    await page.goto(`${BASE}/qlave-test`, { waitUntil: "commit" });
    await page.getByPlaceholder("test-1").fill(room);
    await page.getByPlaceholder("Aragorn").fill(name);
    await expect(page.getByRole("heading", { name: new RegExp(room) })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Join session" }).click();
    pages.push(page);
  }
  for (const page of pages) {
    await expect(page.getByText("Connected", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => page.evaluate(() =>
      [...document.querySelectorAll("video")].some(v => !v.muted && v.videoWidth > 0)
    ), { timeout: 30_000 }).toBe(true);
  }
  await expect(pages[0].getByText("Ben")).toBeVisible();
  await browser.close();
});
