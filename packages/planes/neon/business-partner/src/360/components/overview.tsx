import { RelationshipOverview } from "./relationship-overview";
import { Card } from "@athyper/platform-ui";
import type { Summary } from "../business-partner-360-client";
import { useBusinessPartner360 } from "../business-partner-360-context";

export function partnerLabel(value: string) {
  if (value === "vat") return "VAT";
  const label = value.replace(/[_.-]+/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function Overview({ summary }: { readonly summary: Summary }) {
  const { selectSection } = useBusinessPartner360();
  const completeness = summary.completeness;
  const requests = summary.sections.find((item) => item.code === "requests");
  const canOpenRequests = requests?.authorization === "granted";
  return (
    <div className="bp360-overview">
      <RelationshipOverview />
      <div className="bp360-signals" aria-label="Partner status summary">
        <div>
          <span>Data completeness</span>
          {completeness.status === "definition_unavailable" ? (
            <strong>Unavailable</strong>
          ) : completeness.status === "not_applicable" ? (
            <strong>Not applicable</strong>
          ) : (
            <strong>
              {completeness.percent}%{" "}
              <small>
                {completeness.completeCount} of {completeness.requiredCount}{" "}
                required items
              </small>
            </strong>
          )}
        </div>
        <div>
          <span>Open requests</span>
          {summary.openWork.activeRequestCount === undefined ? (
            <strong>Restricted</strong>
          ) : canOpenRequests ? (
            <button type="button" onClick={() => selectSection("requests")}>
              {summary.openWork.activeRequestCount}
              <span>View requests →</span>
            </button>
          ) : (
            <strong>{summary.openWork.activeRequestCount}</strong>
          )}
        </div>
      </div>
      <Card className="bp360-section-card">
        <h2>Identity summary</h2>
        <dl className="bp360-fields">
          <div>
            <dt>Registered name</dt>
            <dd>
              {summary.identity.name}
            </dd>
          </div>
          <div>
            <dt>Registration & tax identifiers</dt>
            <dd>
              {summary.identifiers.length
                ? summary.identifiers.map((item) => (
                    <span className="bp360-identifier" key={item.id}>
                      {partnerLabel(item.schemeCode)}: {item.maskedValue}
                    </span>
                  ))
                : "No visible identifiers"}
            </dd>
          </div>
        </dl>
      </Card>
      {completeness.status === "definition_unavailable" ? (
        <p className="bp360-note">
          Completeness guidance is currently unavailable.
        </p>
      ) : completeness.status !== "not_applicable" ? (
        <Card className="bp360-section-card">
          <h2>Data completeness</h2>
          <p>
            {completeness.completeCount} of {completeness.requiredCount}{" "}
            required items complete
            {completeness.restrictedCount
              ? ` · ${completeness.restrictedCount} verified restricted values`
              : ""}
          </p>
          <RequirementList
            title="Required"
            items={completeness.required}
            readOnly={completeness.readOnly}
          />
          <RequirementList
            title="Recommended"
            items={completeness.recommended}
            readOnly={completeness.readOnly}
          />
        </Card>
      ) : null}
      {completeness.readOnly ? (
        <p className="bp360-note">Historical view is read-only.</p>
      ) : null}
    </div>
  );
}

function RequirementList({
  title,
  items,
  readOnly,
}: {
  readonly title: string;
  readonly items: Summary["completeness"]["required"];
  readonly readOnly: boolean;
}) {
  if (!items.length) return null;
  return (
    <section className="bp360-requirements">
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item.code}>
            <span>{partnerLabel(item.code)}</span>
            <span>
              {item.state === "restricted_satisfied"
                ? "Verified (restricted)"
                : item.state === "satisfied"
                  ? "Complete"
                  : "Missing"}
            </span>
            {item.action && !readOnly ? (
              <a href={item.action.href}>{item.action.label}</a>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
