import { useBusinessPartner360 } from "../business-partner-360-context";
import { Card } from "@athyper/platform-ui";
import type { SectionState } from "../business-partner-360-client";
const copy: Record<SectionState, string> = {
  empty: "No applicable records are available in this scope.",
  partial: "Some providers did not return data.",
  stale: "The last safe result is shown while the provider refreshes.",
  unavailable: "This section is temporarily unavailable.",
  ready: "This section is ready.",
};
export function SectionStatePanel({
  state,
  reason,
  children,
}: {
  readonly state: SectionState;
  readonly reason?: string;
  readonly children?: React.ReactNode;
}) {
  if (state === "ready" && children) return <>{children}</>;
  return (
    <Card className={`bp360-section-state bp360-section-state--${state}`}>
      <h2 tabIndex={-1}>{state === "ready" ? "Section summary" : state}</h2>
      {children ?? <p>{copy[state]}</p>}
      {reason ? <small>{reason}</small> : null}
    </Card>
  );
}
export function RestrictedSection() {
  return (
    <Card className="bp360-section-state">
      <h2>Restricted</h2>
      <p>
        This section is not available under the current authorization policy.
      </p>
    </Card>
  );
}
export function ScopeSelectionState() {
  const { openTransactionContext } = useBusinessPartner360();
  return (
    <Card className="bp360-section-state">
      <h2>Choose a transaction context</h2>
      <p>Select an organization and company to view this section.</p>
      {openTransactionContext ? (
        <button
          type="button"
          className="a-button a-button--secondary"
          onClick={() => openTransactionContext()}
        >
          Select context
        </button>
      ) : null}
    </Card>
  );
}
