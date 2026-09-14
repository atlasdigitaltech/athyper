import {
  useNeonOperatingOrganization,
  useNeonWorkContext,
} from "@athyper/product-neon-shell";
import { useBusinessPartner360 } from "../business-partner-360-context";

export function TransactionContextBar({
  expanded,
  onToggle,
}: {
  readonly expanded: boolean;
  readonly onToggle: () => void;
}) {
  const { summary } = useBusinessPartner360();
  const operating = useNeonOperatingOrganization();
  const work = useNeonWorkContext();
  const organizationId = summary.scope.operatingOrganizationId;
  const companyId = summary.scope.companyCodeId;
  const organization = operating.organizations.find(
    (item) => item.id === organizationId,
  );
  const company = work.companies.find(
    (item) => item.companyCodeId === companyId,
  );
  const selected = Boolean(organizationId || companyId);

  // Shared master data does not require a transaction selection.
  if (!selected && !expanded) return null;

  return (
    <div
      className="bp360-context-bar"
      role="group"
      aria-label="Transaction context"
    >
      <span
        className="bp360-context-bar__shared"
        title="Partner identity is shared across organizations and companies."
      >
        Shared master data
      </span>
      <dl className="bp360-context-bar__selection">
        <div>
          <dt>Organization</dt>
          <dd>
            {organization?.displayName ??
              (organizationId ? "Name unavailable" : "Not selected")}
          </dd>
        </div>
        <div>
          <dt>Company</dt>
          <dd>
            {company?.displayName ??
              (companyId ? "Name unavailable" : "Not selected")}
          </dd>
        </div>
      </dl>
      <button
        className="bp360-context-bar__button"
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls="bp-transaction-context"
      >
        {expanded
          ? "Close context selector"
          : selected
            ? "Change context"
            : "Select context"}
      </button>
    </div>
  );
}
