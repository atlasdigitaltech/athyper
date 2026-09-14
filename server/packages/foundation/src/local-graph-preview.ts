import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, verify } from "node:crypto";

export interface LocalGraphProjection {
  entityCode: string;
  artifactHash: string;
  changeSetId: string;
  revision: number;
  graphHash: string;
  projection: Record<string, unknown>;
}

/** Read-only consumer of the same signed activation transaction as the writer.
 * Optional pins keep descriptor and authorization reads on one request revision.
 * This function never grants authority and is disabled outside personal DEV. */
export function readLocalGraphProjections(
  tenantId: string,
  plane: string,
  pins?: Readonly<Record<string, string>>,
  env: NodeJS.ProcessEnv = process.env,
): readonly LocalGraphProjection[] {
  const root = env.ATHYPER_LOCAL_PREVIEW_ROOT;
  if (!root) return [];
  if (
    env.ATHYPER_ENV !== "local" ||
    env.ATHYPER_LOCAL_WORKSPACE !== "1" ||
    env.ATHYPER_DOMAIN_SUFFIX !== "dev.athyper.test"
  )
    throw Error("GRAPH_PREVIEW_LOCAL_WORKSPACE_REQUIRED");
  if (!["studio", "neon", "mesh"].includes(plane))
    throw Error("GRAPH_PREVIEW_PLANE_INVALID");
  const path = join(root, "meta-entity.sqlite");
  if (!existsSync(path)) {
    if (pins && Object.keys(pins).length)
      throw Error("GRAPH_PREVIEW_PIN_UNAVAILABLE");
    return [];
  }
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    database.exec("PRAGMA busy_timeout=5000");
    const rows: Record<string, unknown>[] = pins
      ? Object.entries(pins).map(([entityCode, hash]) => {
          if (!/^[a-f0-9]{64}$/.test(hash))
            throw Error("GRAPH_PREVIEW_PIN_INVALID");
          const row = database
            .prepare("SELECT hash,body,signature FROM artifacts WHERE hash=?")
            .get(hash);
          if (!row) throw Error("GRAPH_PREVIEW_PIN_UNAVAILABLE");
          return { ...row, expectedEntity: entityCode };
        })
      : database
          .prepare(
            "SELECT a.hash,a.body,a.signature FROM heads h JOIN artifacts a ON a.hash=h.artifact_hash WHERE json_extract(a.body,'$.tenantId')=?",
          )
          .all(tenantId);
    const publicKey = readFileSync(join(root, "public.pem"));
    return rows.flatMap((row) => {
      const body = String(row.body),
        hash = String(row.hash);
      if (
        createHash("sha256").update(body).digest("hex") !== hash ||
        !verify(
          null,
          Buffer.from(body),
          publicKey,
          Buffer.from(String(row.signature), "base64"),
        )
      )
        throw Error("GRAPH_PREVIEW_ARTIFACT_INVALID");
      const value = JSON.parse(body);
      if (
        value.schema !== "athyper.local-graph-activation/1" ||
        value.developmentEvidence !== true ||
        value.tenantId !== tenantId ||
        (row.expectedEntity !== undefined &&
          row.expectedEntity !== value.entityCode)
      )
        throw Error("GRAPH_PREVIEW_COORDINATE_MISMATCH");
      const projection = value.projections[plane];
      if (projection === undefined) {
        if (pins) throw Error("GRAPH_PREVIEW_PIN_PLANE_MISMATCH");
        return [];
      }
      if (
        !projection ||
        typeof projection !== "object" ||
        Array.isArray(projection)
      )
        throw Error("GRAPH_PREVIEW_PROJECTION_INVALID");
      return [
        {
          entityCode: value.entityCode,
          artifactHash: hash,
          changeSetId: value.changeSetId,
          revision: value.revision,
          graphHash: value.graphHash,
          projection,
        },
      ];
    });
  } finally {
    database.close();
  }
}
