"use client";

import { useState } from "react";
import { cn } from "@athyper/platform-theme/utils";
import { PartyCard, type PartyCardProps } from "./party-card";
import { JurisdictionChip } from "./jurisdiction-chip";

export interface JurisdictionLookup {
  byId: Record<string, { code: string; name: string; type?: string | null } | undefined>;
}

export interface ResolverCandidate {
  ruleId: string;
  ruleCode: string;
  ruleName: string;
  resolvedTaxGroupId: string;
  priority: number;
  matched: boolean;
  reasons: string[];
}

export interface PartySpec extends PartyCardProps {
  ownerType: string;
  ownerId: string | null;
}

export interface AddressSummarySpec {
  label: string;
  addressId: string | null;
  labelText?: string | null;
  code?: string | null;
  formattedAddress?: string | null;
  jurisdictionId: string | null;
  manualOverride?: boolean;
}

export interface IdentityPanelV2Props {
  docEntityCode: string;
  tenantId: string;
  buyer: PartySpec;
  seller: PartySpec;
  billTo: AddressSummarySpec;
  billFrom: AddressSummarySpec;
  remitTo?: AddressSummarySpec;
  shipTo?: AddressSummarySpec;
  shipFrom?: AddressSummarySpec;
  counterpartyTaxStatus?: string | null;
  commodityCategoryId?: string | null;
  supplierIndustryCode?: string | null;
  docDate?: string;
  taxGroupLabel?: string | null;
  taxRuleLabel?: string | null;
  jurisdictionLookup?: JurisdictionLookup;
  readOnly?: boolean;
  onExplainerOpen?: (candidates: ResolverCandidate[]) => void;
  className?: string;
}

export function IdentityPanel(props: IdentityPanelV2Props) {
  const {
    buyer,
    seller,
    billTo,
    billFrom,
    remitTo,
    shipTo,
    shipFrom,
    counterpartyTaxStatus,
    commodityCategoryId,
    supplierIndustryCode,
    docDate,
    taxGroupLabel,
    taxRuleLabel,
    jurisdictionLookup,
    readOnly,
    className,
  } = props;

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);

  return (
    <div data-testid="identity-panel" className={cn("flex flex-col gap-4", className)}>
      <section data-section="parties" className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-700">Parties</h3>
        </header>
        <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-2">
          <PartyCard {...buyer} readOnly={readOnly} />
          <PartyCard {...seller} readOnly={readOnly} />
        </div>
      </section>

      <section data-section="addresses-jurisdictions" className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-700">Addresses & Jurisdictions</h3>
          <span className="text-xs text-slate-500">Edit address fields from Details</span>
        </header>
        <div className="flex flex-col gap-3 p-3">
          <div className="flex flex-col gap-2">
            <h4 className="px-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Buyer side
            </h4>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <AddressSummaryCard address={billTo} readOnly={readOnly} />
              {shipTo ? <AddressSummaryCard address={shipTo} readOnly={readOnly} /> : null}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <h4 className="px-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Seller side
            </h4>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <AddressSummaryCard address={billFrom} readOnly={readOnly} />
              {remitTo ? <AddressSummaryCard address={remitTo} readOnly={readOnly} /> : null}
              {shipFrom ? <AddressSummaryCard address={shipFrom} readOnly={readOnly} /> : null}
            </div>
          </div>
        </div>
      </section>

      <section data-section="tax-determination" className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="p-3">
          <TaxSnapshotCard
            billTo={billTo}
            shipTo={shipTo}
            billFrom={billFrom}
            shipFrom={shipFrom}
            counterpartyTaxStatus={counterpartyTaxStatus}
            commodityCategoryId={commodityCategoryId}
            supplierIndustryCode={supplierIndustryCode}
            docDate={docDate}
            taxGroupLabel={taxGroupLabel}
            taxRuleLabel={taxRuleLabel}
            jurisdictionLookup={jurisdictionLookup}
          />
        </div>
      </section>

      <CollapsibleSummary
        open={paymentOpen}
        title="Payment & Remittance"
        onToggle={() => setPaymentOpen((current) => !current)}
      >
        Payment method, term, and bank are edited from Details.
      </CollapsibleSummary>

      <CollapsibleSummary
        open={contactsOpen}
        title="Contacts & Notifications"
        onToggle={() => setContactsOpen((current) => !current)}
      >
        Notification contacts are shown here once configured.
      </CollapsibleSummary>
    </div>
  );
}

export const IdentityPanelV2 = IdentityPanel;

function TaxSnapshotCard({
  billTo,
  shipTo,
  billFrom,
  shipFrom,
  counterpartyTaxStatus,
  commodityCategoryId,
  supplierIndustryCode,
  docDate,
  taxGroupLabel,
  taxRuleLabel,
  jurisdictionLookup,
}: {
  billTo: AddressSummarySpec;
  shipTo?: AddressSummarySpec;
  billFrom: AddressSummarySpec;
  shipFrom?: AddressSummarySpec;
  counterpartyTaxStatus?: string | null;
  commodityCategoryId?: string | null;
  supplierIndustryCode?: string | null;
  docDate?: string;
  taxGroupLabel?: string | null;
  taxRuleLabel?: string | null;
  jurisdictionLookup?: JurisdictionLookup;
}) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Tax Snapshot</h3>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">
          READ ONLY
        </span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
        <JurisdictionSummary label="Bill-To" jurisdictionId={billTo.jurisdictionId} lookup={jurisdictionLookup} />
        <JurisdictionSummary label="Bill-From" jurisdictionId={billFrom.jurisdictionId} lookup={jurisdictionLookup} />
        {shipTo ? <JurisdictionSummary label="Ship-To" jurisdictionId={shipTo.jurisdictionId} lookup={jurisdictionLookup} /> : null}
        {shipFrom ? <JurisdictionSummary label="Ship-From" jurisdictionId={shipFrom.jurisdictionId} lookup={jurisdictionLookup} /> : null}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-600 md:grid-cols-2">
        <SnapshotLine label="Tax group" value={taxGroupLabel} />
        <SnapshotLine label="Rule" value={taxRuleLabel} />
        <SnapshotLine label="Counterparty tax status" value={counterpartyTaxStatus} />
        <SnapshotLine label="Commodity category" value={commodityCategoryId} />
        <SnapshotLine label="Supplier industry" value={supplierIndustryCode} />
        <SnapshotLine label="Document date" value={docDate} />
      </div>
    </div>
  );
}

function JurisdictionSummary({
  label,
  jurisdictionId,
  lookup,
}: {
  label: string;
  jurisdictionId: string | null;
  lookup?: JurisdictionLookup;
}) {
  const item = jurisdictionId ? lookup?.byId[jurisdictionId] : undefined;
  return (
    <div className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
      {jurisdictionId ? (
        <JurisdictionChip
          code={item?.code}
          name={item?.name}
          jurisdictionType={item?.type ?? undefined}
          unresolved={!item}
        />
      ) : (
        <span className="text-xs italic text-slate-400">Not set</span>
      )}
    </div>
  );
}

function SnapshotLine({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1.5">
      <span className="text-slate-500">{label}</span>
      <span className={value ? "truncate font-medium text-slate-700" : "italic text-slate-400"}>
        {value ?? "Not set"}
      </span>
    </div>
  );
}

function AddressSummaryCard({
  address,
  readOnly,
}: {
  address: AddressSummarySpec;
  readOnly?: boolean;
}) {
  const isEmpty = !address.addressId && !address.labelText && !address.formattedAddress;
  const showRawAddressId = Boolean(
    address.addressId
      && !address.formattedAddress
      && address.labelText !== address.addressId,
  );
  const badge = readOnly ? "LOCKED" : address.manualOverride ? "MANUAL" : "SUMMARY";
  const badgeClass = readOnly
    ? "bg-rose-100 text-rose-700 ring-rose-200"
    : address.manualOverride
      ? "bg-amber-100 text-amber-700 ring-amber-200"
      : "bg-slate-100 text-slate-600 ring-slate-200";

  return (
    <div className={cn(
      "flex min-h-[140px] flex-col gap-2 rounded border border-slate-200 bg-white p-3",
      readOnly && "bg-slate-50",
    )}>
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{address.label}</h4>
        <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-semibold ring-1 ring-inset", badgeClass)}>
          {badge}
        </span>
      </div>

      {isEmpty ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-xs italic text-slate-400">Not set</div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="flex items-baseline gap-1.5">
            {address.code ? <span className="font-mono text-xs text-slate-500">{address.code}</span> : null}
            <span className="truncate text-sm font-semibold text-slate-800">
              {address.labelText ?? address.addressId ?? "Address selected"}
            </span>
          </div>
          {address.formattedAddress ? (
            <div className="line-clamp-2 text-[11px] leading-4 text-slate-500">
              {address.formattedAddress}
            </div>
          ) : showRawAddressId ? (
            <div className="truncate font-mono text-[11px] text-slate-400">{address.addressId}</div>
          ) : null}
          {address.jurisdictionId ? (
            <div className="truncate font-mono text-[11px] text-slate-400">
              Jurisdiction: {address.jurisdictionId}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function CollapsibleSummary({
  open,
  title,
  onToggle,
  children,
}: {
  open: boolean;
  title: string;
  onToggle: () => void;
  children: string;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-slate-50"
      >
        <h3 className="text-sm font-semibold text-foreground">
          <span className="mr-2 text-muted-foreground">{open ? "v" : ">"}</span>
          {title}
        </h3>
        <span className="text-[11px] text-muted-foreground">summary</span>
      </button>
      {open ? (
        <div className="px-4 pb-4">
          <p className="text-xs italic text-slate-500">{children}</p>
        </div>
      ) : null}
    </section>
  );
}
