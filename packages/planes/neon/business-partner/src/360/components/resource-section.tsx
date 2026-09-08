import { useEffect, useMemo, useState } from "react";
import { createOperation } from "@athyper/platform-api-client";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import { Card, Skeleton } from "@athyper/platform-ui";
import { useBusinessPartner360 } from "../business-partner-360-context";
import { AuthorizedAttachment } from "./commercial-controls";
import { businessLabel } from "../display-values";

interface ResourcePage {
  data: { items: readonly Record<string, unknown>[]; nextCursor?: string };
}
const read = createOperation<ResourcePage>({
  method: "GET",
  path: ({ id, section }) =>
    `/api/neon/business-partners/${encodeURIComponent(id)}/360/${encodeURIComponent(section)}`,
  parse: (value) => {
    const page = value as ResourcePage;
    if (!page?.data || !Array.isArray(page.data.items))
      throw new TypeError("Invalid resource page");
    return page;
  },
});
const createComment = createOperation<
  unknown,
  { text: string; idempotencyKey: string }
>({
  method: "POST",
  path: ({ id }) =>
    `/api/neon/business-partners/${encodeURIComponent(id)}/360/comments`,
  parse: (value) => value,
});

export function ResourceSection({
  code,
}: {
  code: "comments" | "attachments";
}) {
  const http = useApiClient(),
    { summary } = useBusinessPartner360();
  const [page, setPage] = useState<ResourcePage>(),
    [cursor, setCursor] = useState<string>(),
    [failed, setFailed] = useState(false),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  const [draft, setDraft] = useState(""),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState(""),
    [commandId, setCommandId] = useState(() => crypto.randomUUID());
  const query = useMemo(
    () => ({
      roleLens: summary.scope.roleLens ?? "all",
      asOf: summary.asOf,
      ...(summary.scope.companyCodeId
        ? { companyCodeId: summary.scope.companyCodeId }
        : {}),
      ...(summary.scope.operatingOrganizationId
        ? { operatingOrganizationId: summary.scope.operatingOrganizationId }
        : {}),
      ...(summary.scope.legalEntityId
        ? { legalEntityId: summary.scope.legalEntityId }
        : {}),
      ...(cursor ? { cursor } : {}),
    }),
    [summary, cursor],
  );
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    setLoading(true);
    void http
      .request(read, {
        params: { id: summary.identity.id, section: code },
        query,
        signal: controller.signal,
      })
      .then((next) => {
        if (!controller.signal.aborted)
          setPage((current) =>
            cursor && current
              ? {
                  ...next,
                  data: {
                    ...next.data,
                    items: [...current.data.items, ...next.data.items],
                  },
                }
              : next,
          );
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [http, query, summary.identity.id, code, retry]);
  return (
    <div className="bp360-section-list">
      <Card className="bp360-section-card">
        <h2>{code === "comments" ? "Comments" : "Attachments"}</h2>
        {code === "attachments" ? (
          <p>
            Partner documents and certificate evidence available in this scope.
          </p>
        ) : (
          <p>Discussion associated with this Business Partner.</p>
        )}
        {loading && !page ? (
          <Skeleton />
        ) : !failed && !page?.data.items.length ? (
          <p>
            {code === "comments"
              ? "No comments yet."
              : "No documents available in this scope."}
          </p>
        ) : null}
      </Card>
      {code === "comments" &&
      summary.collaboration?.canComment &&
      !summary.completeness.readOnly ? (
        <Card>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!draft.trim() || saving) return;
              setSaving(true);
              setMessage("");
              const { asOf: _asOf, cursor: _cursor, ...coordinates } = query;
              void http
                .request(createComment, {
                  params: { id: summary.identity.id },
                  query: coordinates,
                  body: { text: draft.trim(), idempotencyKey: commandId },
                })
                .then(() => {
                  setDraft("");
                  setCommandId(crypto.randomUUID());
                  setPage(undefined);
                  setCursor(undefined);
                  setRetry((value) => value + 1);
                  setMessage("Comment added.");
                })
                .catch(() =>
                  setMessage(
                    "Comment could not be added. Your draft has been kept.",
                  ),
                )
                .finally(() => setSaving(false));
            }}
          >
            <label>
              Add an internal comment
              <textarea
                value={draft}
                maxLength={10000}
                disabled={saving}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setCommandId(crypto.randomUUID());
                }}
                rows={4}
              />
            </label>
            <button type="submit" disabled={saving || !draft.trim()}>
              {saving ? "Adding…" : "Add comment"}
            </button>
            <p role="status">{message}</p>
          </form>
        </Card>
      ) : null}
      {page?.data.items.map((item) => (
        <Card key={String(item.id)} className="bp360-section-card">
          {code === "comments" ? (
            <>
              <p>
                {String(item.authorName ?? "Partner user")} ·{" "}
                <time>{String(item.createdAt)}</time> ·{" "}
                {businessLabel(String(item.visibility))}
                {item.parentCommentId ? " · Reply" : ""}
              </p>
              <p className="bp360-comment-text">{String(item.text)}</p>
            </>
          ) : (
            <>
              <h3>{String(item.fileName)}</h3>
              <p>
                {String(item.contentType ?? "Document")}
                {typeof item.sizeBytes === "number"
                  ? ` · ${Math.ceil(item.sizeBytes / 1024)} KB`
                  : ""}
              </p>
              <AuthorizedAttachment attachment={item} />
            </>
          )}
        </Card>
      ))}
      {failed ? (
        <Card>
          <p role="alert">
            {code === "comments" ? "Comments" : "Attachments"} could not be
            loaded.
          </p>
          <button type="button" onClick={() => setRetry((value) => value + 1)}>
            Try again
          </button>
        </Card>
      ) : null}
      {page?.data.nextCursor && !failed ? (
        <button
          disabled={loading}
          onClick={() => setCursor(page.data.nextCursor)}
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
