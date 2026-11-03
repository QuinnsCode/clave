// tests/e2e/video-call.spec.ts
// End-to-end: two browsers join one room and see + hear each other over real WebRTC.
// Chromium fakes the camera/mic, so this runs headless in CI.
//   QLAVE_LOCAL_ONLY=1 pnpm run dev   (or let playwright start it)
//   pnpm exec playwright test tests/e2e/video-call.spec.ts --project=chromium
import { test, expect, chromium, type Page, type BrowserContext } from "@playwright/test";

const BASE = process.env.QLAVE_BASE_URL ?? "http://localhost:5173";
const FAKE_MEDIA = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];

async function makeRoom(ctx: BrowserContext): Promise<string> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const signup = await ctx.request.post(`${BASE}/api/auth/sign-up/email`, {
    headers: { origin: BASE },
    data: { email, password: "Passw0rd!Passw0rd", name: "Host" },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  // Auth cookies are Secure, which the test client won't replay over http://localhost.
  const cookie = signup.headersArray().filter(h => h.name.toLowerCase() === "set-cookie").map(h => h.value.split(";")[0]).join("; ");
  const res = await ctx.request.post(`${BASE}/api/qlave/createRoom`, { headers: { origin: BASE, cookie }, data: {} });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()).code;
}

/** Type the guest name as soon as the HTML is there, without waiting for React. */
async function fillGuestName(page: Page, name: string) {
  const input = page.getByPlaceholder("Your name");
  if (await input.isVisible().catch(() => false)) await input.fill(name);
}

async function joinRoom(page: Page, code: string, name = "Guest " + Math.random().toString(36).slice(2, 6)) {
  await page.goto(`${BASE}/s/${code}`, { waitUntil: "commit" });
  // Guests get a name box; a signed-in host (cookies stick over https) goes straight to "Join room".
  await page.getByPlaceholder("Your name").or(page.getByRole("button", { name: "Join room" })).first().waitFor();
  await fillGuestName(page, name);
  const btn = page.getByRole("button", { name: "Join room" });
  await expect(btn).toBeEnabled({ timeout: 30_000 });
  await btn.click();
}

/** A remote <video> that is actually decoding frames (not just attached). */
async function expectRemoteVideoPlaying(page: Page) {
  await expect.poll(async () => page.evaluate(() => {
    const v = document.querySelector<HTMLVideoElement>('[data-testid="remote-video"]');
    if (!v || !v.srcObject) return "no-video";
    const s = v.srcObject as MediaStream;
    const kinds = s.getTracks().filter(t => t.readyState === "live").map(t => t.kind).sort().join(",");
    return v.videoWidth > 0 && kinds === "audio,video" ? "playing" : `waiting(${v.videoWidth},${kinds})`;
  }), { timeout: 30_000 }).toBe("playing");
}

async function inboundBytes(page: Page): Promise<number> {
  // Exposed only for tests: total RTP bytes received across peer connections.
  return page.evaluate(async () => {
    const pcs: RTCPeerConnection[] = (window as any).__qlavePCs ?? [];
    let total = 0;
    for (const pc of pcs) (await pc.getStats()).forEach((r: any) => { if (r.type === "inbound-rtp") total += r.bytesReceived ?? 0; });
    return total;
  });
}

test("two peers connect with audio + video both ways, then one leaves", async () => {
  test.setTimeout(120_000);
  const browser = await chromium.launch({ args: FAKE_MEDIA });
  const ctxA = await browser.newContext({ permissions: ["camera", "microphone"] });
  const ctxB = await browser.newContext({ permissions: ["camera", "microphone"] });
  // Collect peer connections so we can assert real media bytes are flowing.
  for (const ctx of [ctxA, ctxB]) {
    await ctx.addInitScript(() => {
      const Orig = window.RTCPeerConnection;
      (window as any).__qlavePCs = [];
      (window as any).RTCPeerConnection = function (...args: any[]) {
        const pc = new (Orig as any)(...args);
        (window as any).__qlavePCs.push(pc);
        return pc;
      } as any;
      (window as any).RTCPeerConnection.prototype = Orig.prototype;
    });
  }

  const code = await makeRoom(ctxA);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  await joinRoom(a, code);
  await expect(a.getByTestId("peer-count")).toContainText("1 in room");
  await joinRoom(b, code);

  await expect(a.getByTestId("peer-count")).toContainText("2 in room", { timeout: 20_000 });
  await expect(b.getByTestId("peer-count")).toContainText("2 in room", { timeout: 20_000 });
  await expectRemoteVideoPlaying(a);
  await expectRemoteVideoPlaying(b);

  const a1 = await inboundBytes(a);
  await a.waitForTimeout(1500);
  expect(await inboundBytes(a)).toBeGreaterThan(a1);

  // Mute propagates to the other side's tile.
  await b.getByTitle("Mute").click();
  await expect(a.getByTestId("tile-peer").locator(".tile-muted")).toBeVisible({ timeout: 10_000 });

  // B leaves: A drops back to one tile.
  await b.getByTitle("Leave").click();
  await expect(a.getByTestId("peer-count")).toContainText("1 in room", { timeout: 15_000 });

  await browser.close();
});

test("a peer without a camera can still join and receive", async () => {
  test.setTimeout(120_000);
  const browser = await chromium.launch({ args: FAKE_MEDIA });
  const ctxA = await browser.newContext({ permissions: ["camera", "microphone"] });
  const ctxB = await browser.newContext({ permissions: [] });
  await ctxB.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("denied", "NotAllowedError"); };
  });
  const code = await makeRoom(ctxA);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await joinRoom(a, code);
  await b.goto(`${BASE}/s/${code}`, { waitUntil: "commit" });
  await expect(b.getByText("you can still see and hear others")).toBeVisible({ timeout: 30_000 });
  await fillGuestName(b, "No Cam");
  await b.getByRole("button", { name: "Join room" }).click();
  await expectRemoteVideoPlaying(b);
  await expect(a.getByTestId("peer-count")).toContainText("2 in room", { timeout: 20_000 });
  await browser.close();
});
