import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID, sign, verify } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { assertGraphPreviewEnvironment } from "./graph-preview.js";

export interface PreviewCoordinate {
  tenantId: string;
  entityCode: string;
}
export interface PreviewClaim extends PreviewCoordinate {
  id: string;
  changeSetId: string;
  revision: number;
  graphHash: string;
}
export interface PreviewActivation extends PreviewClaim {
  schema: "athyper.local-graph-activation/1";
  developmentEvidence: true;
  /** Complete plane projections, including their authorization bindings. */
  projections: Readonly<Record<string, unknown>>;
}
const digest = (body: string) =>
  createHash("sha256").update(body).digest("hex");
const coordinateKey = (coordinate: PreviewCoordinate) =>
  JSON.stringify([coordinate.tenantId, coordinate.entityCode]);

/** Local-only durable state. SQLite serializes writers across processes and
 * commits the complete signed artifact set and active head in one transaction.
 * There are no publication/release tables and no application-data writes. */
export class DurableGraphPreviewStore {
  private readonly database: DatabaseSync;
  constructor(
    path: string,
    private readonly publicKey: string,
    env: NodeJS.ProcessEnv = process.env,
  ) {
    assertGraphPreviewEnvironment(env);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.database = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.database.exec(`PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS claims(coordinate TEXT PRIMARY KEY,id TEXT NOT NULL,change_set TEXT NOT NULL,revision INTEGER NOT NULL,graph_hash TEXT NOT NULL,status TEXT);
      CREATE TABLE IF NOT EXISTS artifacts(hash TEXT PRIMARY KEY,body TEXT NOT NULL,signature TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS heads(coordinate TEXT PRIMARY KEY,artifact_hash TEXT NOT NULL REFERENCES artifacts(hash));`);
  }
  close() {
    this.database.close();
  }
  private transaction<T>(work: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const value = work();
      this.database.exec("COMMIT");
      return value;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
  claim(input: Omit<PreviewClaim, "id">): PreviewClaim {
    if (
      !input.tenantId ||
      !/^[a-z][a-z0-9_]{1,62}$/.test(input.entityCode) ||
      !Number.isSafeInteger(input.revision) ||
      input.revision < 0 ||
      !/^[a-f0-9]{64}$/.test(input.graphHash)
    )
      throw Error("GRAPH_PREVIEW_CLAIM_INVALID");
    return this.transaction(() => {
      const key = coordinateKey(input);
      const previous = this.database
        .prepare("SELECT * FROM claims WHERE coordinate=?")
        .get(key);
      if (
        previous?.change_set === input.changeSetId &&
        (Number(previous.revision) > input.revision ||
          (Number(previous.revision) === input.revision &&
            previous.graph_hash !== input.graphHash))
      )
        throw Error("GRAPH_PREVIEW_STALE_SAVE");
      const claim = { ...input, id: randomUUID() };
      this.database
        .prepare(
          "INSERT INTO claims(coordinate,id,change_set,revision,graph_hash) VALUES(?,?,?,?,?) ON CONFLICT(coordinate) DO UPDATE SET id=excluded.id,change_set=excluded.change_set,revision=excluded.revision,graph_hash=excluded.graph_hash,status=NULL",
        )
        .run(key, claim.id, claim.changeSetId, claim.revision, claim.graphHash);
      return claim;
    });
  }
  current(claim: PreviewClaim): boolean {
    return (
      this.database
        .prepare("SELECT id FROM claims WHERE coordinate=?")
        .get(coordinateKey(claim))?.id === claim.id
    );
  }
  record(claim: PreviewClaim, status: unknown) {
    this.database
      .prepare("UPDATE claims SET status=? WHERE coordinate=? AND id=?")
      .run(JSON.stringify(status), coordinateKey(claim), claim.id);
  }
  status(coordinate: PreviewCoordinate): unknown {
    const row = this.database
      .prepare("SELECT status FROM claims WHERE coordinate=?")
      .get(coordinateKey(coordinate));
    return row?.status ? JSON.parse(String(row.status)) : undefined;
  }
  seal(
    claim: PreviewClaim,
    projections: Readonly<Record<string, unknown>>,
    privateKey: string,
  ) {
    const planes = Object.keys(projections);
    if (
      !planes.length ||
      planes.some((plane) => !["studio", "neon", "mesh"].includes(plane))
    )
      throw Error("GRAPH_PREVIEW_PLANES_REQUIRED");
    const body = JSON.stringify({
      ...claim,
      schema: "athyper.local-graph-activation/1",
      developmentEvidence: true,
      projections,
    } satisfies PreviewActivation);
    const signature = sign(null, Buffer.from(body), privateKey).toString(
      "base64",
    );
    if (
      !verify(
        null,
        Buffer.from(body),
        this.publicKey,
        Buffer.from(signature, "base64"),
      )
    )
      throw Error("GRAPH_PREVIEW_SIGNING_TRUST_MISMATCH");
    return { body, signature, hash: digest(body) };
  }
  commit(
    claim: PreviewClaim,
    sealed: { body: string; signature: string; hash: string },
  ): boolean {
    const activation = this.verify(sealed, claim);
    if (
      activation.id !== claim.id ||
      activation.changeSetId !== claim.changeSetId ||
      activation.revision !== claim.revision ||
      activation.graphHash !== claim.graphHash
    )
      throw Error("GRAPH_PREVIEW_CLAIM_MISMATCH");
    return this.transaction(() => {
      if (!this.current(claim)) return false;
      this.database
        .prepare(
          "INSERT OR IGNORE INTO artifacts(hash,body,signature) VALUES(?,?,?)",
        )
        .run(sealed.hash, sealed.body, sealed.signature);
      this.database
        .prepare(
          "INSERT INTO heads(coordinate,artifact_hash) VALUES(?,?) ON CONFLICT(coordinate) DO UPDATE SET artifact_hash=excluded.artifact_hash",
        )
        .run(coordinateKey(claim), sealed.hash);
      return true;
    });
  }
  read(coordinate: PreviewCoordinate): PreviewActivation | undefined {
    const row = this.database
      .prepare(
        "SELECT a.hash,a.body,a.signature FROM heads h JOIN artifacts a ON a.hash=h.artifact_hash WHERE h.coordinate=?",
      )
      .get(coordinateKey(coordinate));
    return row
      ? this.verify(
          {
            body: String(row.body),
            signature: String(row.signature),
            hash: String(row.hash),
          },
          coordinate,
        )
      : undefined;
  }
  private verify(
    sealed: { body: string; signature: string; hash: string },
    coordinate: PreviewCoordinate,
  ): PreviewActivation {
    if (
      digest(sealed.body) !== sealed.hash ||
      !verify(
        null,
        Buffer.from(sealed.body),
        this.publicKey,
        Buffer.from(sealed.signature, "base64"),
      )
    )
      throw Error("GRAPH_PREVIEW_ARTIFACT_INVALID");
    const value = JSON.parse(sealed.body) as PreviewActivation;
    if (
      value.schema !== "athyper.local-graph-activation/1" ||
      value.developmentEvidence !== true ||
      coordinateKey(value) !== coordinateKey(coordinate)
    )
      throw Error("GRAPH_PREVIEW_COORDINATE_MISMATCH");
    return value;
  }
}
