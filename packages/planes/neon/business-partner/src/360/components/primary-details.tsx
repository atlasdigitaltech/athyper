import { Card } from "@athyper/platform-ui";
import { useBusinessPartner360 } from "../business-partner-360-context";
import { countryName, businessLabel } from "../display-values";

export function PrimaryDetails({
  provider,
  label,
}: {
  provider: "primary-contact" | "primary-address";
  label: string;
}) {
  const { summary, selectSection } = useBusinessPartner360();
  const code = provider === "primary-contact" ? "contacts" : "addresses";
  const permitted = summary.sections.some(
    (item) => item.code === code && item.authorization === "granted",
  );
  const contact = summary.primaryContact?.primary
    ? summary.primaryContact
    : undefined;
  const address = summary.primaryAddress?.primary
    ? summary.primaryAddress
    : undefined;
  return (
    <Card className="bp360-primary-card">
      <h2>{label}</h2>
      {!permitted ? (
        <p>Restricted</p>
      ) : provider === "primary-contact" ? (
        contact ? (
          <>
            <strong>{contact.displayName ?? "Primary contact"}</strong>
            {contact.purpose ? <p>{businessLabel(contact.purpose)}</p> : null}
            {contact.email ? (
              <p>
                <a href={`mailto:${contact.email}`}>{contact.email}</a>
              </p>
            ) : null}
            {contact.phone ? (
              <p>
                <a href={`tel:${contact.phone}`}>{contact.phone}</a>
              </p>
            ) : null}
            <small>{contact.verified ? "Verified" : "Not verified"}</small>
          </>
        ) : (
          <p>No primary contact assigned</p>
        )
      ) : address ? (
        <>
          <p>{businessLabel(address.purpose)}</p>
          <address>
            {[
              ...(address.lines ?? [address.line1]),
              address.locality,
              address.region,
              address.postalCode,
              countryName(address.countryCode),
            ]
              .filter(Boolean)
              .map((line, index) => (
                <div key={index}>{line}</div>
              ))}
          </address>
          <small>{address.verified ? "Verified" : "Not verified"}</small>
        </>
      ) : (
        <p>No primary address assigned</p>
      )}
      {permitted ? (
        <button type="button" onClick={() => selectSection(code)}>
          View all {code}
        </button>
      ) : null}
    </Card>
  );
}
