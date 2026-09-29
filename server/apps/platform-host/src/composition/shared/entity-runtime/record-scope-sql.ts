import type { RecordCollectionScopeSqlCompiler } from "@athyper/server-service-records";
import { neonRecordScopeSqlCompilers } from "../../spaces/neon/record-scope-sql.js";
import { meshRecordScopeSqlCompilers } from "../../spaces/mesh/record-scope-sql.js";
import { studioRecordScopeSqlCompilers } from "../../spaces/studio/record-scope-sql.js";

/** Only installed, server-owned scope kinds can compile plane-specific SQL. */
export const registeredRecordScopeSqlCompilers: readonly RecordCollectionScopeSqlCompiler[] =
  Object.freeze([
    ...neonRecordScopeSqlCompilers,
    ...meshRecordScopeSqlCompilers,
    ...studioRecordScopeSqlCompilers,
  ]);
