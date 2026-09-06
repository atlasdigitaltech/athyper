import {
  createOperation,
  encodePathSegment,
  type HttpClient,
} from "@athyper/platform-api-client";

export type DefinitionPlane = "studio" | "neon" | "mesh";
export interface DefinitionDraft {
  readonly bundle: unknown;
  readonly targetPlanes: readonly DefinitionPlane[];
}
export interface DefinitionRevision extends DefinitionDraft {
  readonly id: string;
  readonly bundleCode: string;
  readonly semanticVersion: string;
  readonly bundleHash: string;
  readonly createdBy: string;
  readonly createdAt: string;
}
export interface DefinitionPublication {
  readonly release: {
    readonly id: string;
    readonly status: string;
    readonly releaseNo: number;
  };
  readonly jobId: string;
}
const root = "/api/studio/business-partner-definitions";
const author = createOperation<DefinitionRevision, DefinitionDraft>({
  method: "POST",
  path: root,
  idempotency: "required",
});
const get = createOperation<DefinitionRevision>({
  method: "GET",
  path: ({ revisionId }) => `${root}/${encodePathSegment(String(revisionId))}`,
});
const publish = createOperation<
  DefinitionPublication,
  { readonly minimumRuntimeVersion?: string }
>({
  method: "POST",
  path: ({ revisionId }) =>
    `${root}/${encodePathSegment(String(revisionId))}/publish`,
  idempotency: "required",
});

export function createBusinessPartnerDefinitionClient(http: HttpClient) {
  return Object.freeze({
    get: (revisionId: string) => http.request(get, { params: { revisionId } }),
    author: (body: DefinitionDraft, idempotencyKey: string) =>
      http.request(author, { body, idempotencyKey }),
    publish: (
      revisionId: string,
      body: { readonly minimumRuntimeVersion?: string },
      idempotencyKey: string,
    ) =>
      http.request(publish, { params: { revisionId }, body, idempotencyKey }),
  });
}

// Keep the same key after an ambiguous transport failure. A changed command
// receives a new key, so retries can never silently approve a different revision.
export function createDefinitionCommandKeys(
  newKey: () => string = () => crypto.randomUUID(),
) {
  const keys = new Map<string, string>();
  return (command: string, payload: unknown) => {
    const fingerprint = JSON.stringify([command, payload]);
    let key = keys.get(fingerprint);
    if (!key) {
      key = newKey();
      keys.set(fingerprint, key);
    }
    return key;
  };
}
