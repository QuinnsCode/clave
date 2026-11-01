// src/lib/collab/doDialect.ts
import {
    Dialect, DialectAdapter, Driver, DatabaseIntrospector,
    QueryCompiler, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler,
    DatabaseConnection, QueryResult, CompiledQuery,
  } from "kysely";
  
  export class DODialect implements Dialect {
    constructor(private readonly ctx: DurableObjectState) {}
  
    createAdapter(): DialectAdapter     { return new SqliteAdapter(); }
    createIntrospector(db: any)         { return new SqliteIntrospector(db); }
    createQueryCompiler(): QueryCompiler { return new SqliteQueryCompiler(); }
    createDriver(): Driver               { return new DODriver(this.ctx); }
  }
  
  class DODriver implements Driver {
    constructor(private readonly ctx: DurableObjectState) {}
    async init() {}
    async destroy() {}
    async acquireConnection(): Promise<DatabaseConnection> {
      return new DOConnection(this.ctx);
    }
    async releaseConnection() {}
    async beginTransaction(conn: any) { await conn.executeQuery(CompiledQuery.raw("BEGIN")); }
    async commitTransaction(conn: any) { await conn.executeQuery(CompiledQuery.raw("COMMIT")); }
    async rollbackTransaction(conn: any) { await conn.executeQuery(CompiledQuery.raw("ROLLBACK")); }
  }
  
  class DOConnection implements DatabaseConnection {
    constructor(private readonly ctx: DurableObjectState) {}
  
    async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
      const cursor = this.ctx.storage.sql.exec<R>(
        query.sql,
        ...query.parameters as any[]
      );
      return { rows: cursor.toArray() };
    }
  
    async *streamQuery() { throw new Error("Streaming not supported"); }
  }