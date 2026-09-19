"use client";

/**
 * Compact required-context status strip (business-context-selector-design.md §10.4).
 * Plane-agnostic: replaces the large "Choose a work context" body card. The plane's
 * own scope control (rendered separately in the nav band via `contextControl`/
 * `renderScopeControl`) is the only selector — this strip contains no second one.
 */
export function RequiredContextStatus({
  message,
  scopeControlAvailable,
}: {
  readonly message?: string;
  readonly scopeControlAvailable: boolean;
}) {
  return (
    <p className="a-entity-list__required-context-status" role="status">
      <span>
        {message ?? "Select the required context to view this list."}
      </span>
      {!scopeControlAvailable ? (
        <span role="alert">Context selection is unavailable for this entity.</span>
      ) : null}
    </p>
  );
}
