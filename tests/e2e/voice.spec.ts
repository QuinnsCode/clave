// tests/e2e/voice.spec.ts
// Qollab voice channels against Qlave's side of rustybuns apps/eqosys/QLAVE.md:
// eqosys tickets, the browser client (src/sdk/voice.ts), and eqosys's orders.
// Runs its own fake eqosys (a JWKS on :5287 that the dev server's EQOSYS_ISSUER points at).
import { test, expect, chromium, type Browser, type Page } from "@playwright/test";
import http from "node:http";

const BASE = process.env.QLAVE_BASE_URL ?? "http://localhost:5173";
const ISS = "http://localhost:5287";
const FAKE_MEDIA = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];
const { subtle } = globalThis.crypto;
// Fresh key id per run: the worker caches eqosys keys by kid for five minutes.
const KID = `voice-test-${Date.now()}`;

let keys: CryptoKeyPair;
let jwks: http.Server;
let browser: Browser;

const b64 = (b: ArrayBuffer | string) => Buffer.from(b as any).toString("base64url");
async function sign(claims: Record<string, unknown>): Promise<string> {
  const h = b64(JSON.stringify({ alg: "ES256", kid: KID, typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const p = b64(JSON.stringify({ iss: ISS, iat: now, exp: now + 60, jti: crypto.randomUUID(), ...claims }));
  const sig = await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, Buffer.from(`${h}.${p}`));
  return `${h}.${p}.${b64(sig)}`;
}
const ticket = (sub: string, name: string, room: string, extra: Record<string, unknown> = {}) =>
  sign({ aud: "qlave", sub, name, room, ...extra });

async function order(body: Record<string, unknown>, aud = "qlave-admin"): Promise<number> {
  const res = await fetch(`${BASE}/eqosys`, {
    method: "POST",
    headers: { authorization: `Bearer ${await sign({ aud, sub: "eqosys" })}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.status;
}

/** A page with the voice client loaded straight from the dev server's module graph. */
async function voicePage(): Promise<Page> {
  const ctx = await browser.newContext({ permissions: ["microphone"] });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const mod = await import(/* @vite-ignore */ `${location.origin}/src/sdk/voice.ts`);
    (window as any).voice = { mod, handle: null, speakers: [], gone: null };
  });
  return page;
}

async function joinVoice(page: Page, t: string): Promise<string> {
  return page.evaluate(async ({ base, t }) => {
    const w = (window as any).voice;
    try {
      const h = await w.mod.join(base, t);
      w.handle = h;
      h.onSpeakers((s: any) => { w.speakers = s; });
      h.onGone((r: string) => { w.gone = r; });
      return "joined";
    } catch (e: any) {
      return `refused: ${e.message}`;
    }
  }, { base: BASE, t });
}

const speakers = (page: Page) => page.evaluate(() => (window as any).voice.speakers as { sub: string; name: string; muted: boolean; self: boolean; talking: boolean }[]);
const gone = (page: Page) => page.evaluate(() => (window as any).voice.gone as string | null);

test.beforeAll(async () => {
  keys = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const pub = await subtle.exportKey("jwk", keys.publicKey);
  jwks = http.createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ keys: [{ ...pub, kid: KID, alg: "ES256", use: "sig" }] }));
  });
  await new Promise<void>(r => jwks.listen(5287, r));
  browser = await chromium.launch({ args: FAKE_MEDIA });
});

test.afterAll(async () => {
  await browser?.close();
  await new Promise(r => jwks?.close(r));
});

test.describe.configure({ mode: "serial" });

test("two members talk; names come from the ticket; a ticket works once", async () => {
  const room = `space:t${Date.now()}:general`;
  const a = await voicePage();
  const b = await voicePage();
  const ta = await ticket("u-alice", "Alice", room);
  expect(await joinVoice(a, ta)).toBe("joined");
  expect(await joinVoice(b, await ticket("u-bob", "Bob", room))).toBe("joined");

  await expect.poll(async () => (await speakers(a)).map(s => `${s.name}:${s.self}`).sort().join(","), { timeout: 20_000 })
    .toBe("Alice:true,Bob:false");
  await expect.poll(async () => (await speakers(b)).map(s => s.sub).sort().join(","), { timeout: 20_000 })
    .toBe("u-alice,u-bob");

  // Audio actually flows, and the fake mic's tone shows up as talking.
  await expect.poll(() => a.evaluate(() => {
    const pc = (window as any).voice.handle.call.peerConnection((window as any).voice.handle.call.remotePeers[0]?.peerId);
    return pc?.getStats().then((st: RTCStatsReport) => { let n = 0; st.forEach((r: any) => { if (r.type === "inbound-rtp" && r.kind === "audio") n += r.bytesReceived ?? 0; }); return n; }) ?? 0;
  }), { timeout: 20_000 }).toBeGreaterThan(2000);
  await expect.poll(async () => (await speakers(a)).find(s => s.sub === "u-bob")?.talking, { timeout: 15_000, intervals: [100] }).toBe(true);

  // Same ticket again: refused.
  const c = await voicePage();
  expect(await joinVoice(c, ta)).toMatch(/refused/);
  // A ticket for someone else (wrong aud) or one that lives too long: refused.
  expect(await joinVoice(c, await sign({ aud: "other", sub: "u-eve", name: "Eve", room }))).toMatch(/refused/);
  expect(await joinVoice(c, await ticket("u-eve", "Eve", room, { exp: Math.floor(Date.now() / 1000) + 3600 }))).toMatch(/refused/);
});

test("owner's mute, kick, erase and end reach voice", async () => {
  const id = `t${Date.now()}`;
  const room = `space:${id}:general`;
  const a = await voicePage();
  const b = await voicePage();
  expect(await joinVoice(a, await ticket("u-alice", "Alice", room))).toBe("joined");
  expect(await joinVoice(b, await ticket("u-bob", "Bob", room))).toBe("joined");
  await expect.poll(async () => (await speakers(a)).length, { timeout: 20_000 }).toBe(2);

  // Orders need an admin token.
  expect(await order({ t: "mute", room, sub: "u-bob", on: true }, "qlave")).toBe(401);

  // Mute: everyone sees Bob muted, and Bob's own unmute doesn't undo it.
  expect(await order({ t: "mute", room, sub: "u-bob", on: true })).toBe(200);
  await expect.poll(async () => (await speakers(a)).find(s => s.sub === "u-bob")?.muted, { timeout: 10_000 }).toBe(true);
  await b.evaluate(() => (window as any).voice.handle.muteSelf(false));
  await expect.poll(() => b.evaluate(() => (window as any).voice.handle.call["localStream"].getAudioTracks()[0].enabled)).toBe(false);
  await a.waitForTimeout(500);
  expect((await speakers(a)).find(s => s.sub === "u-bob")?.muted).toBe(true);
  expect(await order({ t: "mute", room, sub: "u-bob", on: false })).toBe(200);
  await expect.poll(async () => (await speakers(a)).find(s => s.sub === "u-bob")?.muted, { timeout: 10_000 }).toBe(false);

  // Kick: Bob is gone at once, and the room drops back to Alice.
  expect(await order({ t: "kick", room, sub: "u-bob" })).toBe(200);
  await expect.poll(() => gone(b), { timeout: 10_000 }).toBe("kicked");
  await expect.poll(async () => (await speakers(a)).length, { timeout: 10_000 }).toBe(1);

  // A fresh ticket lets Bob back in.
  const b2 = await voicePage();
  expect(await joinVoice(b2, await ticket("u-bob", "Bob", room))).toBe("joined");
  await expect.poll(async () => (await speakers(a)).length, { timeout: 20_000 }).toBe(2);

  // Erase (account deleted): Bob drops from every room.
  expect(await order({ t: "erase", sub: "u-bob" })).toBe(200);
  await expect.poll(() => gone(b2), { timeout: 15_000 }).toBe("kicked");

  // End (space deleted): every room under the prefix ends.
  expect(await order({ t: "end", prefix: `space:${id}:` })).toBe(200);
  await expect.poll(() => gone(a), { timeout: 15_000 }).toBe("ended");

  // Nothing to do is still 200; a bad order is 400.
  expect(await order({ t: "end", prefix: "space:nobody:" })).toBe(200);
  expect(await order({ t: "end", prefix: "" })).toBe(400);
});
