import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { Banking } from "./commercial-controls";
vi.mock("@athyper/platform-ui", () => ({
  Card: ({ children }: any) => <section>{children}</section>,
}));
it("shows partner banking without company scope and keeps three statuses separate", () => {
  const html = renderToStaticMarkup(
    <Banking
      businessPartnerId="partner"
      client={{} as any}
      data={{
        scopeState: "global",
        readOnly: false,
        accounts: [
          {
            linkId: "mesh:source",
            bankName: "Example Bank",
            currencyCode: "GBP",
            maskedAccount: "•••• 4821",
            accountHolderName: "Northwind Supplies",
            source: "MESH",
            verified: true,
            disclosureStatus: "Disclosure current",
            acceptance: "Change pending review",
            companyUsage: "CirrusAtlantic UK",
            revealable: false,
            accountIdType: "iban",
            bic: "WESTGB2L",
          },
        ],
        manageHref: "/banking",
        verifyHref: "/verify",
      }}
    />,
  );
  expect(html).toContain("•••• 4821");
  for (const label of [
    "Owner verified",
    "Disclosure current",
    "Change pending review",
    "CirrusAtlantic UK",
    "SWIFT/BIC",
    "IBAN",
  ])
    expect(html).toContain(label);
  expect(html).not.toContain("Confirm audited reveal");
  expect(html).not.toContain("company selector");
});
it("labels receipt dates accurately and leaves absent owner evidence unknown", () => {
  const html = renderToStaticMarkup(
    <Banking
      businessPartnerId="partner"
      client={{} as any}
      data={{
        accounts: [
          {
            linkId: "mesh:source",
            source: "MESH",
            verified: null,
            receivedAt: "2026-09-05T10:00:00Z",
            companyUsage: "No companies assigned",
            acceptance: "No company acceptance recorded",
            revealable: false,
          },
        ],
        manageHref: "/mdg/business-partner/partner/banking",
        verifyHref: "/mdg/business-partner/partner/bank-verification",
      }}
    />,
  );
  expect(html).toContain("Not provided");
  expect(html).not.toContain("Not verified");
  expect(html).toContain("Disclosure received on");
  expect(html).toContain("2026-09-05");
  expect(html).not.toContain("Effective from");
  expect(html).not.toContain("Domestic account number");
});
it("offers the purpose-confirmation affordance only for a revealable masked account", () => {
  const render = (revealable: boolean) =>
    renderToStaticMarkup(
      <Banking
        businessPartnerId="partner"
        client={{} as any}
        revealScope={{
          operatingOrganizationId: "org",
          companyCodeId: "company",
        }}
        data={{
          accounts: [{ linkId: "bank", maskedAccount: "••••5432", revealable }],
          manageHref: "/banking",
          verifyHref: "/verify",
        }}
      />,
    );
  expect(render(true)).toContain("Reveal for approved purpose");
  expect(render(false)).not.toContain("Reveal for approved purpose");
  expect(render(true)).not.toContain("GB82WEST12345698765432");
});
