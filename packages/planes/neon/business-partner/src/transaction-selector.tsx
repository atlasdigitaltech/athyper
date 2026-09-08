"use client";
import { useEffect, useId, useState } from "react";
import {
  entityListOperation,
  entityListScopeQuery,
} from "@athyper/platform-api-client";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
/** Transaction consumers must supply their authorized company, organization, role and operation. */
export function BusinessPartnerTransactionSelector({
  role,
  operation,
  operatingOrganizationId,
  companyCodeId,
  legalEntityId,
  onSelect,
}: {
  readonly role: "supplier" | "customer";
  readonly operation: "order" | "invoice" | "payment";
  readonly operatingOrganizationId: string;
  readonly companyCodeId: string;
  readonly legalEntityId: string;
  readonly onSelect: (partner: { id: string; label: string }) => void;
}) {
  const client = useApiClient(),
    id = useId(),
    [search, setSearch] = useState(""),
    [rows, setRows] = useState<readonly { id: string; label: string }[]>([]),
    [status, setStatus] = useState("");
  const scope = {
    partnerRole: role,
    eligibleOperation: operation,
    operatingOrganizationId,
    companyCodeId,
    legalEntityId,
  };
  const key = JSON.stringify([scope, search]);
  useEffect(() => {
    const controller = new AbortController();
    setRows([]);
    if (!operatingOrganizationId || !companyCodeId || !legalEntityId) {
      setStatus("Select a transaction organization and company");
      return;
    }
    setStatus("Loading eligible partners…");
    const timer = setTimeout(() => {
      void client
        .request(entityListOperation, {
          params: { entityCode: "business_partner" },
          query: {
            ...entityListScopeQuery(scope),
            ...(search.trim() ? { search: search.trim() } : {}),
            limit: 20,
          },
          signal: controller.signal,
        })
        .then((result) => {
          if (controller.signal.aborted) return;
          setRows(
            result.rows.map((row) => ({
              id: row.id,
              label: String(
                row.values.display_name ??
                  row.values.name ??
                  row.values.code ??
                  row.id,
              ),
            })),
          );
          setStatus(
            result.rows.length
              ? result.pagination.hasNext
                ? "Refine your search for more eligible partners"
                : ""
              : "No eligible partners found",
          );
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setStatus("Eligible partners are unavailable");
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [client, key]);
  return (
    <div>
      <label htmlFor={id}>
        Search eligible {role === "supplier" ? "suppliers" : "customers"}
      </label>
      <input
        id={id}
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <p role="status">{status}</p>
      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <button type="button" onClick={() => onSelect(row)}>
              {row.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
