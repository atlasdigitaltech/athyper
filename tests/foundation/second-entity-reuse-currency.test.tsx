import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PageWorkspace, PageLayout, PageResourceBoundary } from "../../packages/platform/shell/shell/src/index";

/**
 * Structural proof only. "currency" is not a real registered entity — no backend descriptor
 * exists for it (see build-work-plan.md Task 6). This proves the shared PageWorkspace /
 * PageLayout / PageResourceBoundary components already used across Business Partner also
 * compose correctly, unmodified, for a materially different and much simpler entity shape:
 * flat reference data with no roles, relationships, hierarchy or intake — the "Level 1
 * — Metadata configuration" case from system-design.md §14.4. It is not a migration and
 * proves nothing about a real backend, publication pipeline, or descriptor contract.
 */

interface CurrencyRecord {
  readonly code: string;
  readonly name: string;
  readonly symbol: string | null;
  readonly minorUnits: number | null;
}

const SAMPLE_CURRENCY: CurrencyRecord = Object.freeze({
  code: "USD",
  name: "US Dollar",
  symbol: "$",
  minorUnits: 2,
});

function CurrencyDetailPage({
  status,
  currency,
}: {
  readonly status: "loading" | "error" | "ready";
  readonly currency?: CurrencyRecord;
}) {
  return (
    <PageWorkspace header={{ level: "collection", title: currency ? currency.name : "Currency" }}>
      <PageResourceBoundary
        status={status}
        loading={
          <p role="status" aria-busy="true">
            Loading currency…
          </p>
        }
        error={<p role="alert">Currency unavailable.</p>}
        empty={<p>No currency selected.</p>}
      >
        {currency ? (
          <PageLayout variant="content">
            <dl>
              <div>
                <dt>Code</dt>
                <dd>{currency.code}</dd>
              </div>
              <div>
                <dt>Symbol</dt>
                <dd>{currency.symbol ?? "—"}</dd>
              </div>
              <div>
                <dt>Minor units</dt>
                <dd>{currency.minorUnits ?? "—"}</dd>
              </div>
            </dl>
          </PageLayout>
        ) : null}
      </PageResourceBoundary>
    </PageWorkspace>
  );
}

test("second-entity reuse: a flat reference entity composes through the same PageWorkspace/PageResourceBoundary used for Business Partner, with no entity-specific changes to either", () => {
  const loading = renderToStaticMarkup(<CurrencyDetailPage status="loading" />);
  assert.match(loading, /Loading currency…/);
  assert.doesNotMatch(loading, /US Dollar/);

  const errored = renderToStaticMarkup(<CurrencyDetailPage status="error" />);
  assert.match(errored, /Currency unavailable\./);
  assert.doesNotMatch(errored, /US Dollar/);

  const empty = renderToStaticMarkup(<CurrencyDetailPage status="empty" />);
  assert.match(empty, /No currency selected\./);

  const ready = renderToStaticMarkup(<CurrencyDetailPage status="ready" currency={SAMPLE_CURRENCY} />);
  assert.match(ready, /US Dollar/);
  assert.match(ready, />\$</);
  assert.match(ready, />2</);

  // Invariant #1 (one Main landmark, one page h1) holds for this entity too: PageWorkspace's
  // header is the only page-level heading, regardless of what entity is being rendered.
  assert.equal((ready.match(/<h1[ >]/g) ?? []).length, 1);
});
