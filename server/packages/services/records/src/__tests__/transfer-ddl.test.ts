import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("record transfer DDL",()=>{it("defines tenant-scoped resumable sessions, chunks, exports, and RLS",()=>{const root=resolve(process.cwd(),"../../../db/ddl/common/ops");const tables=readFileSync(resolve(root,"03_tables.sql"),"utf8"),rls=readFileSync(resolve(root,"10_rls.sql"),"utf8");expect(tables).toContain("CREATE TABLE ops.record_import_session");expect(tables).toContain("CREATE TABLE ops.record_import_chunk");expect(tables).toContain("PRIMARY KEY(tenant_id,session_id,chunk_index)");expect(tables).toContain("CREATE TABLE ops.record_export_request");expect(rls).toContain("record_import_session_tenant_access");expect(rls).toContain("record_export_request_tenant_access");});});
