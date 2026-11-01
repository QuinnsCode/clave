// src/durableObjects/qollabWhiteboardDO.ts

import { DurableObject } from "cloudflare:workers";
import { Kysely } from "kysely";
import { DODialect } from "@/lib/qollab/doDialect";
import type { Capability } from "@/lib/qollab/capabilities";
import { hasCap } from "@/lib/qollab/capabilities";

// ── Schema ────────────────────────────────────────────────────────────────────

interface WbObjectsTable {
  id:         string;
  type:       string;
  data:       ArrayBuffer;
  peer_id:    string;
  updated_at: number;
}

interface DocsTable {
  id:         string;
  title:      string;
  content:    string;
  created_by: string;
  updated_at: number;
}

interface PeerCapsTable {
  peer_id:  string;
  caps:     string;
  user_id:  string | null;
}

interface MetaTable {
  key:   string;
  value: string;
}

interface Database {
  wb_objects: WbObjectsTable;
  docs:       DocsTable;
  peer_caps:  PeerCapsTable;
  meta:       MetaTable;
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// ── Public types ──────────────────────────────────────────────────────────────

export interface WbObject {
  id:        string;
  type:      "stroke" | "text" | "image";
  data:      ArrayBuffer;
  peerId:    string;
  updatedAt: number;
}

export interface DocMeta {
  id:        string;
  title:     string;
  createdBy: string;
  updatedAt: number;
}

export interface DocContent extends DocMeta {
  content: string;
}

// ── DO ────────────────────────────────────────────────────────────────────────

export class QollabWhiteboardDO extends DurableObject<Env> {
  private db: Kysely<Database>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = new Kysely<Database>({ dialect: new DODialect(ctx) });
    ctx.blockConcurrencyWhile(() => this.migrate());
  }

  private async migrate(): Promise<void> {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS wb_objects (
        id         TEXT PRIMARY KEY,
        type       TEXT NOT NULL,
        data       BLOB NOT NULL,
        peer_id    TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS docs (
        id         TEXT PRIMARY KEY,
        title      TEXT NOT NULL DEFAULT 'Untitled',
        content    TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS peer_caps (
        peer_id TEXT PRIMARY KEY,
        caps    TEXT NOT NULL,
        user_id TEXT
      );

      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  // ── Lock helpers ──────────────────────────────────────────────────────────

  private async isLocked(): Promise<boolean> {
    const rows = this.ctx.storage.sql
      .exec(`SELECT value FROM meta WHERE key = 'locked'`)
      .toArray() as { value: string }[];
    return rows.length > 0 && rows[0].value === "true";
  }

  private async assertNotLocked(): Promise<void> {
    if (await this.isLocked()) {
      throw new Error("Session ended — whiteboard is read-only");
    }
  }

  // ── RPC — Lifecycle ───────────────────────────────────────────────────────

  // Called by QlaveSessionDO when last peer leaves
  async lockAndScheduleDelete(): Promise<void> {
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO meta VALUES ('locked', 'true')`
    );
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO meta VALUES ('locked_at', ?)`,
      Date.now().toString()
    );

    await this.ctx.storage.setAlarm(Date.now() + ONE_WEEK_MS);
    this.broadcast({ type: "session:locked" });
  }

  // RPC — check lock state from QollabPage RSC
  async getIsLocked(): Promise<boolean> {
    return this.isLocked();
  }

  // Alarm fires after 1 week — wipe all data
  async alarm(): Promise<void> {
    this.ctx.storage.sql.exec(`DELETE FROM wb_objects`);
    this.ctx.storage.sql.exec(`DELETE FROM docs`);
    this.ctx.storage.sql.exec(`DELETE FROM peer_caps`);
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO meta VALUES ('deleted', 'true')`
    );
    await this.ctx.storage.deleteAlarm();
  }

  // ── WebSocket ─────────────────────────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    const url    = new URL(request.url);
    const peerId = url.searchParams.get("peerId");

    if (!peerId) return new Response("Missing peerId", { status: 400 });
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [peerId]);

    const [objects, docs, locked] = await Promise.all([
      this.getWhiteboardState(),
      this.getDocs(),
      this.isLocked(),
    ]);

    server.send(JSON.stringify({ type: "init", objects, docs, locked }));

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(_ws: WebSocket, _msg: string | ArrayBuffer): Promise<void> {}

  async webSocketClose(ws: WebSocket): Promise<void> {
    const [peerId] = this.ctx.getTags(ws);
    if (peerId) this.broadcast({ type: "peer:left", peerId });
  }

  private broadcast(msg: object): void {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(data); } catch {}
    }
  }

  private broadcastExcept(excludePeerId: string, msg: object): void {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      const [pid] = this.ctx.getTags(ws);
      if (pid !== excludePeerId) {
        try { ws.send(data); } catch {}
      }
    }
  }

  // ── Cap helpers ───────────────────────────────────────────────────────────

  private async getPeerCaps(peerId: string): Promise<Capability[]> {
    const row = await this.db
      .selectFrom("peer_caps")
      .select("caps")
      .where("peer_id", "=", peerId)
      .executeTakeFirst();
    if (!row) return [];
    try { return JSON.parse(row.caps) as Capability[]; }
    catch { return []; }
  }

  private assertCap(caps: Capability[], cap: Capability): void {
    if (!hasCap(caps, cap)) throw new Error(`Missing capability: ${cap}`);
  }

  // ── RPC — Peer caps ───────────────────────────────────────────────────────

  async setPeerCaps(peerId: string, userId: string | null, caps: Capability[]): Promise<void> {
    await this.db
      .insertInto("peer_caps")
      .values({ peer_id: peerId, user_id: userId, caps: JSON.stringify(caps) })
      .onConflict(oc => oc.column("peer_id").doUpdateSet({
        caps:    JSON.stringify(caps),
        user_id: userId,
      }))
      .execute();

    for (const ws of this.ctx.getWebSockets(peerId)) {
      try { ws.send(JSON.stringify({ type: "caps:updated", caps })); } catch {}
    }
  }

  async grantCaps(granterPeerId: string, targetPeerId: string, caps: Capability[]): Promise<void> {
    const granterCaps = await this.getPeerCaps(granterPeerId);
    this.assertCap(granterCaps, "role:grant");
    const allowed  = caps.filter(c => granterCaps.includes(c));
    const existing = await this.getPeerCaps(targetPeerId);
    const merged   = [...new Set([...existing, ...allowed])];
    await this.setPeerCaps(targetPeerId, null, merged);
    this.broadcast({ type: "caps:granted", targetPeerId, caps: merged });
  }

  async revokeCaps(revokerPeerId: string, targetPeerId: string, caps: Capability[]): Promise<void> {
    const revokerCaps = await this.getPeerCaps(revokerPeerId);
    this.assertCap(revokerCaps, "role:revoke");
    const existing = await this.getPeerCaps(targetPeerId);
    const updated  = existing.filter(c => !caps.includes(c));
    await this.setPeerCaps(targetPeerId, null, updated);
    this.broadcast({ type: "caps:revoked", targetPeerId, caps: updated });
  }

  // ── RPC — Whiteboard ──────────────────────────────────────────────────────

  async upsertObject(peerId: string, obj: WbObject): Promise<void> {
    await this.assertNotLocked();
    const caps = await this.getPeerCaps(peerId);

    const existing = await this.db
      .selectFrom("wb_objects")
      .select("peer_id")
      .where("id", "=", obj.id)
      .executeTakeFirst();

    if (!existing) {
      this.assertCap(caps, "wb:draw");
    } else if (existing.peer_id !== peerId) {
      this.assertCap(caps, "wb:move_others");
    } else {
      this.assertCap(caps, "wb:move_own");
    }

    await this.db
      .insertInto("wb_objects")
      .values({
        id:         obj.id,
        type:       obj.type,
        data:       obj.data,
        peer_id:    peerId,
        updated_at: Date.now(),
      })
      .onConflict(oc => oc.column("id").doUpdateSet({
        data:       obj.data,
        updated_at: Date.now(),
      }))
      .execute();

    this.broadcastExcept(peerId, { type: "wb:upsert", object: { ...obj, peerId } });
  }

  async deleteObject(peerId: string, id: string): Promise<void> {
    await this.assertNotLocked();
    const caps = await this.getPeerCaps(peerId);

    const existing = await this.db
      .selectFrom("wb_objects")
      .select("peer_id")
      .where("id", "=", id)
      .executeTakeFirst();

    if (!existing) return;

    if (existing.peer_id !== peerId) {
      this.assertCap(caps, "wb:delete_others");
    } else {
      this.assertCap(caps, "wb:delete_own");
    }

    await this.db.deleteFrom("wb_objects").where("id", "=", id).execute();
    this.broadcast({ type: "wb:delete", id });
  }

  async clearWhiteboard(peerId: string): Promise<void> {
    await this.assertNotLocked();
    const caps = await this.getPeerCaps(peerId);
    this.assertCap(caps, "wb:clear");
    await this.db.deleteFrom("wb_objects").execute();
    this.broadcast({ type: "wb:clear" });
  }

  async getWhiteboardState(): Promise<WbObject[]> {
    const rows = await this.db.selectFrom("wb_objects").selectAll().execute();
    return rows.map(r => ({
      id:        r.id,
      type:      r.type as WbObject["type"],
      data:      r.data,
      peerId:    r.peer_id,
      updatedAt: r.updated_at,
    }));
  }

  // ── RPC — Documents ───────────────────────────────────────────────────────

  async createDoc(peerId: string, title: string): Promise<string> {
    await this.assertNotLocked();
    const caps = await this.getPeerCaps(peerId);
    this.assertCap(caps, "doc:create");

    const count = await this.db
      .selectFrom("docs")
      .select(db => db.fn.count<number>("id").as("n"))
      .executeTakeFirst();

    if ((count?.n ?? 0) >= 10) throw new Error("Max 10 documents per session");

    const id = crypto.randomUUID();
    await this.db.insertInto("docs").values({
      id, title, content: "", created_by: peerId, updated_at: Date.now(),
    }).execute();

    this.broadcast({ type: "doc:created", id, title, createdBy: peerId });
    return id;
  }

  async updateDoc(peerId: string, id: string, content: string): Promise<void> {
    await this.assertNotLocked();
    const caps = await this.getPeerCaps(peerId);
    this.assertCap(caps, "doc:edit");

    await this.db.updateTable("docs")
      .set({ content, updated_at: Date.now() })
      .where("id", "=", id)
      .execute();

    this.broadcastExcept(peerId, { type: "doc:updated", id, content, peerId });
  }

  async renameDoc(peerId: string, id: string, title: string): Promise<void> {
    await this.assertNotLocked();
    const caps = await this.getPeerCaps(peerId);
    this.assertCap(caps, "doc:edit");

    await this.db.updateTable("docs")
      .set({ title, updated_at: Date.now() })
      .where("id", "=", id)
      .execute();

    this.broadcast({ type: "doc:renamed", id, title });
  }

  async deleteDoc(peerId: string, id: string): Promise<void> {
    await this.assertNotLocked();
    const caps = await this.getPeerCaps(peerId);
    this.assertCap(caps, "doc:delete");

    await this.db.deleteFrom("docs").where("id", "=", id).execute();
    this.broadcast({ type: "doc:deleted", id });
  }

  async getDocs(): Promise<DocMeta[]> {
    const rows = await this.db
      .selectFrom("docs")
      .select(["id", "title", "created_by", "updated_at"])
      .execute();
    return rows.map(r => ({
      id:        r.id,
      title:     r.title,
      createdBy: r.created_by,
      updatedAt: r.updated_at,
    }));
  }

  async getDoc(id: string): Promise<DocContent | null> {
    const row = await this.db
      .selectFrom("docs")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    if (!row) return null;
    return {
      id:        row.id,
      title:     row.title,
      content:   row.content,
      createdBy: row.created_by,
      updatedAt: row.updated_at,
    };
  }
}