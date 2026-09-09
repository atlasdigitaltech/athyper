import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  useApiClient,
  useSessionIdentity,
} from "@athyper/platform-shell-app-foundation";
import {
  RelatedRecord,
  RelatedSectionError,
} from "@athyper/platform-entity-form-detail";
import { Card, Skeleton } from "@athyper/platform-ui";
import { useRecordFooterSources } from "@athyper/platform-shell";
import { useBusinessPartner360 } from "../business-partner-360-context";
import {
  createBusinessPartner360SectionClient,
  sectionQueryKey,
  type CommonSection,
} from "../business-partner-360-section-client";

export function RelatedSection({
  code,
  compact = false,
  summaryFooter,
}: {
  code: "contacts" | "addresses";
  compact?: boolean;
  summaryFooter?: ReactNode;
}) {
  const http = useApiClient(),
    identity = useSessionIdentity(),
    { summary, roleLens } = useBusinessPartner360();
  const client = useMemo(
    () => createBusinessPartner360SectionClient(http),
    [http],
  );
  const profile = summary.recordHeader?.related?.find(
    (p) => p.sectionKey === code,
  );
  const label =
    summary.recordHeader?.sections.find((s) => s.key === code)?.label ?? code;
  const permitted = summary.sections.some(
    (s) => s.code === code && s.authorization === "granted",
  );
  const primaryId =
    code === "contacts"
      ? summary.primaryContact?.primary
        ? summary.primaryContact.id
        : undefined
      : summary.primaryAddress?.primary
        ? summary.primaryAddress.id
        : undefined;
  const [retry, setRetry] = useState(0),
    [pageSelection, setPageSelection] = useState<{
      baseKey: string;
      cursor: string;
    }>();
  const coordinates = {
    ...summary.scope,
    tenantId: identity.scope?.tenantId ?? "unbound",
    principalId: identity.scope?.principalId ?? "unbound",
    authEpoch: identity.scope?.authEpoch ?? 0,
    businessPartnerId: summary.identity.id,
    sectionCode: code,
    roleLens,
    asOf: summary.asOf,
  };
  const baseKey = sectionQueryKey(coordinates).join(":");
  const cursor =
    pageSelection?.baseKey === baseKey ? pageSelection.cursor : undefined;
  const query = { ...coordinates, ...(cursor ? { cursor } : {}) };
  const key = `${baseKey}:${cursor ?? "first"}:${compact}:${primaryId ?? "none"}`;
  const [state, setState] = useState<{
    key: string;
    baseKey: string;
    section?: CommonSection;
    error?: unknown;
    loading: boolean;
  }>();
  useEffect(() => {
    if (!permitted || !profile || (compact && !primaryId)) return;
    const controller = new AbortController();
    setState((current) => ({
      key,
      baseKey,
      loading: true,
      ...(cursor && current?.baseKey === baseKey
        ? { section: current.section }
        : {}),
    }));
    void (async () => {
      try {
        let page = await client.read(query, controller.signal);
        // Primary records need not be on page one. Follow the server's bounded cursor
        // pages, retaining only the primary item, and cancel on any scope change.
        if (compact) {
          const seen = new Set<string>();
          while (
            !page.data.items.some((i) => i.id === primaryId) &&
            page.data.nextCursor
          ) {
            const next = page.data.nextCursor;
            if (seen.has(next)) throw new Error("Repeated section cursor");
            seen.add(next);
            page = await client.read(
              { ...query, cursor: next },
              controller.signal,
            );
          }
          page = {
            ...page,
            data: { items: page.data.items.filter((i) => i.id === primaryId) },
          };
        }
        if (!controller.signal.aborted)
          setState((current) => ({
            key,
            baseKey,
            loading: false,
            section:
              cursor && current?.baseKey === baseKey && current.section
                ? {
                    ...page,
                    data: {
                      ...page.data,
                      items: [
                        ...new Map(
                          [
                            ...current.section.data.items,
                            ...page.data.items,
                          ].map((i) => [i.id, i]),
                        ).values(),
                      ],
                    },
                  }
                : page,
          }));
      } catch (error) {
        if (!controller.signal.aborted)
          setState({ key, baseKey, loading: false, error });
      }
    })();
    return () => controller.abort();
  }, [client, key, retry, permitted, profile]);
  const current = state?.key === key ? state : undefined;
  useRecordFooterSources(
    !compact && current?.section ? current.section.provenance : [],
  );
  if (!permitted) return <p>Restricted</p>;
  if (!profile)
    return (
      <p>
        Presentation unavailable. Refresh after the record definition is
        published.
      </p>
    );
  if (compact && !primaryId)
    return (
      <div>
        <p>{profile.compactEmptyLabel}</p>
        {summaryFooter}
      </div>
    );
  if (!current || (current.loading && !current.section))
    return <Skeleton className="bp360-shell-skeleton" />;
  const error = current.error as
    | {
        status?: number;
        statusCode?: number;
        requestId?: string;
        correlationId?: string;
      }
    | undefined;
  if (error || current.section?.state === "unavailable")
    return (
      <RelatedSectionError
        label={label}
        restricted={error?.status === 403 || error?.statusCode === 403}
        supportReference={error?.requestId ?? error?.correlationId}
        retry={() => {
          setPageSelection(undefined);
          setRetry((n) => n + 1);
        }}
      />
    );
  const section = current.section;
  if (!section?.data.items.length)
    return (
      <div>
        <p>{compact ? profile.compactEmptyLabel : profile.emptyLabel}</p>
        {compact ? summaryFooter : null}
      </div>
    );
  const required =
    summary.completeness?.required.filter(
      (requirement) =>
        requirement.sectionCode === code && requirement.state === "missing",
    ) ?? [];
  return (
    <div className="bp360-section-list">
      {!compact && required.length ? (
        <aside aria-label="Required information">
          <h3>Required information</h3>
          <ul>
            {required.map((requirement) => (
              <li key={requirement.code}>
                {requirement.label ?? "Required information is missing"}
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
      {section.state === "stale" || section.state === "partial" ? (
        <p role="status">
          {section.state === "stale"
            ? "These records may need refreshing."
            : "Some details are unavailable."}
        </p>
      ) : null}
      {section.data.items.map((item) => {
        const content = (
          <RelatedRecord
            profile={profile}
            values={{ ...item }}
            compact={compact}
            hideScope
            summaryFooter={summaryFooter}
            restrictedFields={section.redactions.map((r) => r.fieldCode)}
            actions={summary.recordHeader?.relatedActions}
          />
        );
        return compact ? (
          <div key={item.id}>{content}</div>
        ) : (
          <Card key={item.id} className="bp360-section-card">
            {content}
          </Card>
        );
      })}
      {!compact && section.data.nextCursor ? (
        <button
          type="button"
          disabled={current.loading}
          onClick={() =>
            setPageSelection({ baseKey, cursor: section.data.nextCursor! })
          }
        >
          {current.loading ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
