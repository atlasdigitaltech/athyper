import { useState } from "react";
import { Card } from "@athyper/platform-ui";
import type { createBusinessPartner360CommercialClient } from "@athyper/product-neon-entity-extensions/business-partner/clients/business-partner-360-commercial-client";
import { useAuditedReveal } from "../protected-values/use-audited-reveal";
import { businessLabel } from "../360/display-values";
import { Notice, Field, rows, show } from "./presentation";

export function Banking({
  revealScope,
  data,
  client,
  businessPartnerId,
  showNavigation = true,
  sharedFactsOnly = false,
  allowCompanySettings = false,
  onChanged,
}: {
  revealScope?: { operatingOrganizationId?: string; companyCodeId?: string };
  sharedFactsOnly?: boolean;
  showNavigation?: boolean;
  allowCompanySettings?: boolean;
  onChanged?: () => void;
  data: Readonly<Record<string, unknown>>;
  client: ReturnType<typeof createBusinessPartner360CommercialClient>;
  businessPartnerId: string;
}) {
  return (
    <div className="bp360-section-list">
      <Notice data={data} />
      {rows(data["accounts"]).map((item) => (
        <BankCard
          key={String(item["linkId"])}
          item={item}
          revealScope={revealScope}
          sharedFactsOnly={sharedFactsOnly}
          client={client}
          businessPartnerId={businessPartnerId}
          allowCompanySettings={allowCompanySettings}
          onChanged={onChanged}
        />
      ))}
      {!rows(data["accounts"]).length ? (
        <Card className="bp360-section-card">
          <h2>No bank accounts</h2>
          <p>
            No authorized accounts are available for this partner and selection.
          </p>
        </Card>
      ) : null}
      {showNavigation && !data["readOnly"] ? (
        <Card className="bp360-section-card">
          <a href={String(data["manageHref"])}>Manage partner accounts</a>
        </Card>
      ) : null}
    </div>
  );
}
function BankCard({
  revealScope,
  item,
  client,
  businessPartnerId,
  allowCompanySettings,
  onChanged,
  sharedFactsOnly = false,
}: {
  revealScope?: { operatingOrganizationId?: string; companyCodeId?: string };
  sharedFactsOnly?: boolean;
  allowCompanySettings?: boolean;
  onChanged?: () => void;
  item: Readonly<Record<string, unknown>>;
  client: ReturnType<typeof createBusinessPartner360CommercialClient>;
  businessPartnerId: string;
}) {
  const [confirm, setConfirm] = useState(false);
  const {
    value,
    failed,
    run: reveal,
    clear,
  } = useAuditedReveal(
    JSON.stringify([
      businessPartnerId,
      item["linkId"],
      revealScope,
      item["revealable"],
    ]),
  );
  async function run() {
    await reveal((signal) =>
      client.revealBank(
        businessPartnerId,
        String(item["linkId"]),
        "payment_verification",
        signal,
        revealScope,
      ),
    );
  }
  return (
    <Card className="bp360-section-card">
      <h2>
        {show(item["bankName"])} · {show(item["currencyCode"])} ·{" "}
        {show(item["maskedAccount"])}
      </h2>
      <dl>
        <Field label="Holder" value={item["accountHolderName"]} />
        <Field label="Currency" value={item["currencyCode"]} />
        {!sharedFactsOnly ? (
          <>
            <Field
              label="Purpose"
              value={businessLabel(String(item["purpose"] ?? ""))}
            />
            <Field label="Primary" value={item["primary"]} />
          </>
        ) : null}
        <Field label="Account status" value={item["accountStatus"]} />
        <Field label="Source" value={item["source"] ?? "NEON"} />
        {item["disclosureStatus"] ? (
          <Field label="Disclosure" value={item["disclosureStatus"]} />
        ) : null}
        <Field
          label="Account identifier type"
          value={
            item["accountIdType"] === "iban"
              ? "IBAN"
              : item["accountIdType"] === "local"
                ? "Domestic account number"
                : "Not provided"
          }
        />
        <Field label="SWIFT/BIC" value={item["bic"]} />
        {item["effectiveFrom"] ? (
          <Field
            label="Partner link effective from"
            value={item["effectiveFrom"]}
          />
        ) : null}
        {item["effectiveUntil"] ? (
          <Field
            label="Partner link effective until"
            value={item["effectiveUntil"]}
          />
        ) : null}
        {item["receivedAt"] ? (
          <Field
            label="Disclosure received on"
            value={String(item["receivedAt"]).slice(0, 10)}
          />
        ) : null}
        {item["disclosureExpiresAt"] ? (
          <Field
            label="Disclosure expires on"
            value={String(item["disclosureExpiresAt"]).slice(0, 10)}
          />
        ) : null}
      </dl>
      {item["revealable"] ? (
        confirm ? (
          <div>
            <button onClick={() => void run()}>Confirm audited reveal</button>
            <button
              onClick={() => {
                setConfirm(false);
                clear();
              }}
            >
              Close
            </button>
            {value ? <p className="bp360-restricted-value">{value}</p> : null}
            {failed ? (
              <p role="alert">The restricted value could not be revealed.</p>
            ) : null}
          </div>
        ) : (
          <button onClick={() => setConfirm(true)}>
            Reveal for approved purpose
          </button>
        )
      ) : null}
    </Card>
  );
}
