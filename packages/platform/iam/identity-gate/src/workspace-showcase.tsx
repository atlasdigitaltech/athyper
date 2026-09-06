"use client";
import * as React from "react";
import { getPlaneBrand, type BrandPlane } from "@athyper/platform-brand";

/**
 * Rich pre-login product showcase for the story panel. Sample workspace
 * content only -- illustrative, not real account/tenant/transaction data.
 */

interface Act {
  readonly q: string;
  readonly readonly?: boolean;
  readonly confidence: number;
  readonly say: string;
  readonly touch: readonly string[];
  readonly policy?: string;
  readonly approver?: string;
  readonly done?: string;
}
interface ChainStep {
  readonly name: string;
  readonly ref: string;
  readonly who?: string;
  readonly side?: "us" | "them" | "both";
  readonly meta: string;
  readonly val: string;
  readonly state: string;
}
interface LedgerLine { readonly account: string; readonly label: string; readonly debit?: string; readonly credit?: string; }
interface LedgerEntry { readonly ref: string; readonly source: string; readonly date: string; readonly lines: readonly LedgerLine[]; }
interface WorkspaceEntry {
  readonly tab: string;
  readonly eyebrow: string;
  readonly heading: readonly [string, string];
  readonly sub: string;
  readonly facts: readonly (readonly [string, string])[];
  readonly head: readonly (readonly [string, string, boolean?])[];
  readonly foot: readonly [string, string, string];
  readonly kind: "ledger" | "chain" | "map";
  readonly chain?: readonly ChainStep[];
  readonly ledger?: readonly LedgerEntry[];
  readonly acts: readonly Act[];
}

const NEON_WORKSPACES: readonly WorkspaceEntry[] = [
  {
    tab: "Finance", eyebrow: "Finance workspace", kind: "ledger",
    heading: ["Every document", "lands in the ledger."],
    sub: "Post, match and close across company codes on one balanced entry model.",
    facts: [["7", "Company codes posting"], ["4", "Ledger books in parallel"], ["2.4s", "Document to posted entry"]],
    head: [["Ledger book", "Primary — IFRS"], ["Company code", "MY01 Kuala Lumpur"], ["Currency", "MYR"], ["Fiscal period", "2026-09 open", true]],
    foot: ["Debits and credits", "43,958.17", "Difference 0.00"],
    ledger: [
      { ref: "AP-INV-24817", source: "Vendor invoice", date: "12 Sep", lines: [
        { account: "5300", label: "Office supplies expense", debit: "4,820.00" },
        { account: "1450", label: "Input tax recoverable", debit: "289.20" },
        { account: "2100", label: "Accounts payable", credit: "5,109.20" },
      ] },
      { ref: "AR-INV-90233", source: "Customer invoice", date: "12 Sep", lines: [
        { account: "1200", label: "Accounts receivable", debit: "18,400.00" },
        { account: "4000", label: "Product revenue", credit: "17,358.49" },
        { account: "2210", label: "Output tax payable", credit: "1,041.51" },
      ] },
      { ref: "GR-55120", source: "Goods receipt", date: "13 Sep", lines: [
        { account: "1330", label: "Inventory — finished goods", debit: "12,940.00" },
        { account: "2160", label: "GR/IR clearing", credit: "12,940.00" },
      ] },
      { ref: "PAY-10442", source: "Outgoing payment", date: "13 Sep", lines: [
        { account: "2100", label: "Accounts payable", debit: "5,109.20" },
        { account: "1010", label: "Bank — operating", credit: "5,109.20" },
      ] },
      { ref: "FX-000912", source: "Revaluation run", date: "14 Sep", lines: [
        { account: "7820", label: "Foreign exchange loss", debit: "316.44" },
        { account: "1200", label: "Accounts receivable", credit: "316.44" },
      ] },
      { ref: "DEP-2609", source: "Depreciation run", date: "14 Sep", lines: [
        { account: "6400", label: "Depreciation expense", debit: "2,083.33" },
        { account: "1620", label: "Accumulated depreciation", credit: "2,083.33" },
      ] },
    ],
    acts: [
      { q: "Close period 09", confidence: 94,
        say: "Period 09 has three items outstanding: two receipts without invoices and one payroll journal still parked. I can clear the receipts, leave the journal for review, then run the close.",
        touch: ["Period 2026-09", "GR/IR clearing", "RUN-2609"], policy: "Period close FIN-CL-02", approver: "Group controller",
        done: "Period 09 closed. Journal JE-77401 posted, audit record AUD-90233." },
      { q: "Show unmatched GR/IR", readonly: true, confidence: 98,
        say: "Two receipts have no invoice against them. GR-55120 at 12,940.00 is three days old and within tolerance, GR-55094 at 2,180.00 is 21 days old and past the fourteen day threshold.",
        touch: ["GR-55120", "GR-55094"] },
      { q: "Draft the payment run", confidence: 91,
        say: "Fourteen invoices fall due before 20 September, 46,208.90 in total. I can draft the run for MY01 and leave out the two supplier accounts currently on hold.",
        touch: ["MY01", "14 invoices"], policy: "Payment approval FIN-AP-07", approver: "Treasury lead",
        done: "Payment proposal PAY-10488 created and sent for approval." },
    ],
  },
  {
    tab: "Supply Chain", eyebrow: "Supply chain workspace", kind: "chain",
    heading: ["Every requirement", "ends in a receipt."],
    sub: "Demand, sourcing, contracted price, commitment and fulfilment stay on one line.",
    facts: [["312", "Purchase orders open"], ["98.2%", "Received on time, in full"], ["0", "Unmatched receipts"]],
    head: [["Planning site", "MY01 Shah Alam"], ["Category", "Airframe components"], ["Currency", "MYR"], ["Line REQ-40218", "In fulfilment", true]],
    foot: ["Committed and received", "12,940.00", "Variance 0.00"],
    chain: [
      { name: "Requirement", ref: "REQ-40218", meta: "200 units, Aerofoil bracket AB-220, raised by MRP for November cover", val: "200 units", state: "released" },
      { name: "Sourcing event", ref: "RFP-1188", meta: "6 suppliers invited, 4 responded, scored on price and lead time", val: "4 of 6", state: "evaluated" },
      { name: "Catalogue award", ref: "CAT-AER-22", meta: "Awarded to Athyper Components on contract price, valid to 31 December", val: "64.70 / unit", state: "awarded" },
      { name: "Commitment", ref: "PO-77401", meta: "Budget committed against cost centre 4400, approved within delegated limit", val: "12,940.00", state: "approved" },
      { name: "Fulfilment", ref: "GR-55120", meta: "200 received into MY01, inspection passed, matched three ways", val: "200 received", state: "three-way match" },
    ],
    acts: [
      { q: "Show late deliveries", readonly: true, confidence: 97,
        say: "Six orders are past their confirmed date. The largest is PO-77390 at 18,900.00, four days late from Athyper Components, who also supply the line on REQ-40218.",
        touch: ["PO-77390", "+5 orders"] },
      { q: "Approve my requisitions", confidence: 95,
        say: "Eighteen requisitions are waiting on you. Sixteen sit inside your 25,000.00 limit and two exceed it, so those need the category manager rather than you.",
        touch: ["REQ-40218", "+17 lines"], policy: "Delegation of authority SC-DOA-03", approver: "You, within limit",
        done: "Sixteen requisitions approved. Two routed to the category manager." },
      { q: "Which suppliers are at risk?", readonly: true, confidence: 89,
        say: "Three suppliers show a falling score this quarter. Athyper Components dropped on delivery reliability while their quality score held, which points at capacity rather than process.",
        touch: ["Athyper Components", "+2 suppliers"] },
    ],
  },
  {
    tab: "Commercial", eyebrow: "Commercial workspace", kind: "chain",
    heading: ["Quote, order, invoice,", "one commercial record."],
    sub: "An opportunity keeps the same record through pricing, fulfilment and receivables.",
    facts: [["1,284", "Active customer accounts"], ["MYR 4.1m", "Open order value"], ["0", "Invoices awaiting posting"]],
    head: [["Sales area", "MY Domestic"], ["Currency", "MYR"], ["Open orders", "486"], ["Order SO-88410", "Invoiced", true]],
    foot: ["Ordered and invoiced", "17,358.49", "Variance 0.00"],
    chain: [
      { name: "Opportunity", ref: "OPP-2291", meta: "Cirrus Air Services, cabin refit programme, qualified by sales", val: "17.4k pipeline", state: "qualified" },
      { name: "Quotation", ref: "QUO-3382", meta: "Priced from list v3 with contracted discount, valid for 30 days", val: "17,358.49", state: "accepted" },
      { name: "Sales order", ref: "SO-88410", meta: "Credit check passed, availability confirmed for 26 September", val: "17,358.49", state: "confirmed" },
      { name: "Delivery", ref: "DN-61207", meta: "Picked and shipped from MY01, proof of delivery received", val: "complete", state: "delivered" },
      { name: "Invoice", ref: "AR-INV-90233", meta: "Net 17,358.49 plus output tax 1,041.51, posted to receivables", val: "18,400.00", state: "posted to ledger" },
    ],
    acts: [
      { q: "Show orders on credit hold", readonly: true, confidence: 96,
        say: "Four orders totalling 62,400.00 are on hold. Cirrus Air is 2,100.00 over its limit with a payment already in clearing, so that one releases itself tomorrow.",
        touch: ["Cirrus Air", "4 orders"] },
      { q: "Draft a quote for Cirrus Air", confidence: 89,
        say: "I can price a quote from list v3 with their contracted eight percent discount, mirroring the structure of QUO-3382 that they accepted last month.",
        touch: ["QUO-3382", "Price list v3"], policy: "Pricing approval COM-PR-01", approver: "Commercial manager",
        done: "Quote QUO-3391 drafted and sent for pricing approval." },
      { q: "Compare price list v3 to v2", readonly: true, confidence: 93,
        say: "v3 raises 42 items by 3.4% on average and leaves 118 unchanged. Two of the raised items sit under price protection clauses, so those would breach if applied.",
        touch: ["Price list v3", "Price list v2"] },
    ],
  },
  {
    tab: "People", eyebrow: "People workspace", kind: "chain",
    heading: ["One record for everyone", "who works here."],
    sub: "Position, hire, time, pay and posting stay on the same employee record.",
    facts: [["2,140", "Employees on record"], ["312", "Contingent workers"], ["26 Sep", "Next payroll run"]],
    head: [["Legal entity", "CirrusAtlantic UK"], ["Pay group", "MY monthly"], ["Headcount", "2,452"], ["Run 2026-09", "Ready to run", true]],
    foot: ["Calculated and posted", "6,842.30", "Difference 0.00"],
    chain: [
      { name: "Position", ref: "POS-1182", meta: "Avionics technician at MY01 Shah Alam, approved against the headcount plan", val: "1 FTE", state: "approved" },
      { name: "Hire", ref: "EMP-40917", meta: "Offer accepted, contract signed, onboarding tasks issued", val: "01 Sep", state: "onboarded" },
      { name: "Time recorded", ref: "TS-2609", meta: "176 standard hours and 8 overtime hours, approved by the line manager", val: "184 hrs", state: "approved" },
      { name: "Payroll", ref: "RUN-2609", meta: "Gross pay, statutory deductions and employer contributions calculated", val: "6,842.30", state: "calculated" },
      { name: "Posting", ref: "JE-77120", meta: "Employment cost posted to cost centre 4400, net pay released", val: "6,842.30", state: "posted to ledger" },
    ],
    acts: [
      { q: "Who is on leave next week?", readonly: true, confidence: 97,
        say: "Twenty two people are away next week, including three of the nine avionics technicians on the same two days, which leaves line 2 thin on Thursday.",
        touch: ["22 employees", "MY01"] },
      { q: "Show payroll variances", readonly: true, confidence: 94,
        say: "Run 2609 is 4.2% above last period. Overtime at MY01 accounts for most of it, 38 hours across shift B, which matches the extra production on PRD-30188.",
        touch: ["RUN-2609", "TS-2609"] },
      { q: "Start the September run", confidence: 93,
        say: "Time is approved for 2,438 of 2,452 people. I can start the run now and carry the fourteen unapproved timesheets into the next cycle rather than holding everyone.",
        touch: ["RUN-2609", "14 timesheets"], policy: "Payroll run HR-PY-01", approver: "Payroll manager",
        done: "Run 2609 started. Fourteen timesheets carried forward, audit record AUD-90311." },
    ],
  },
  {
    tab: "Projects & Services", eyebrow: "Projects & services workspace", kind: "chain",
    heading: ["Deliver the work,", "recognise the revenue."],
    sub: "Engagement, staffing, effort, work in progress and revenue stay on one project.",
    facts: [["48", "Active projects"], ["82%", "Billable utilisation"], ["1,120", "Hours unbilled"]],
    head: [["Portfolio", "Delivery MY"], ["Contract", "Fixed fee"], ["Utilisation", "82%"], ["Project PRJ-2214", "In delivery", true]],
    foot: ["Delivered and recognised", "21,340.00", "Difference 0.00"],
    chain: [
      { name: "Engagement", ref: "PRJ-2214", meta: "Cirrus Air cabin refit, fixed fee, signed and approved for delivery", val: "84,000.00", state: "approved" },
      { name: "Resource plan", ref: "RES-1180", meta: "4 consultants assigned, 640 planned hours through to 31 October", val: "640 hrs", state: "staffed" },
      { name: "Time and expense", ref: "TS-PS-2609", meta: "148 hours delivered this period, expenses of 1,240.00 approved", val: "148 hrs", state: "approved" },
      { name: "Work in progress", ref: "WIP-0912", meta: "Effort valued at contract rates, milestone 62% complete", val: "21,340.00", state: "valued" },
      { name: "Revenue", ref: "REV-3308", meta: "Percentage of completion released for the period", val: "21,340.00", state: "posted to ledger" },
    ],
    acts: [
      { q: "Which projects are over budget?", readonly: true, confidence: 96,
        say: "Four of 48 projects are running over. PRJ-2214 is 6% above plan on effort with 62% of the milestone delivered, so it recovers if the remaining work holds to estimate.",
        touch: ["PRJ-2214", "+3 projects"] },
      { q: "Show unbilled hours", readonly: true, confidence: 98,
        say: "1,120 hours are unbilled, worth 21,340.00 at contract rates. 148 of those belong to PRJ-2214 this period and are ready to release.",
        touch: ["WIP-0912", "TS-PS-2609"] },
      { q: "Draft this week's status note", confidence: 88,
        say: "I can summarise progress, effort and risk across the 12 projects you lead, using this period's confirmations and the current work in progress values.",
        touch: ["PRJ-2214", "11 more projects"], policy: "Content drafting, no records changed", approver: "You publish it",
        done: "Draft saved to PRJ-2214 and shared with the delivery lead." },
    ],
  },
  {
    tab: "Operations", eyebrow: "Operations workspace", kind: "chain",
    heading: ["Every order settles", "at its true cost."],
    sub: "Release, issue, confirm, inspect and settle without leaving the order.",
    facts: [["14", "Work orders open"], ["3", "Production lines running"], ["87%", "Overall equipment effectiveness"]],
    head: [["Plant", "MY01 Shah Alam"], ["Shift", "B evening"], ["Lines running", "3 of 4"], ["Order PRD-30188", "Settled", true]],
    foot: ["Issued and settled", "14,286.44", "Variance 0.00"],
    chain: [
      { name: "Production order", ref: "PRD-30188", meta: "200 aerofoil brackets AB-220 for line 2, released to the shop floor", val: "200 units", state: "released" },
      { name: "Material issue", ref: "ISS-77420", meta: "Brackets drawn from MY01 stock against the order, inventory relieved", val: "12,940.00", state: "issued" },
      { name: "Confirmation", ref: "CNF-4471", meta: "Shift B confirmed 196 good units and 4 scrapped over 38 machine hours", val: "196 good", state: "confirmed" },
      { name: "Quality", ref: "QIN-2210", meta: "Inspection lot passed, batch certificate issued to the customer file", val: "passed", state: "released" },
      { name: "Settlement", ref: "JE-77340", meta: "Order settled, material and conversion cost carried to the cost centre", val: "14,286.44", state: "posted to ledger" },
    ],
    acts: [
      { q: "Why did line 2 stop?", readonly: true, confidence: 92,
        say: "Line 2 stopped twice on shift B for 46 minutes in total, both times on the bracket feeder. The same fault closed work order WO-55980 last month, so this looks recurring rather than incidental.",
        touch: ["CNF-4471", "WO-55980"] },
      { q: "Schedule preventive maintenance", confidence: 90,
        say: "Line 2 is 180 running hours past its service interval. I can place the service in Sunday's window, which leaves the confirmed production plan untouched.",
        touch: ["Line 2", "WO-56012"], policy: "Maintenance scheduling OPS-MT-04", approver: "Plant manager",
        done: "Work order WO-56012 scheduled for Sunday 06:00, four hour window." },
      { q: "Show yield by shift", readonly: true, confidence: 97,
        say: "Shift B yields 98.0% against 99.1% on shift A. Scrap concentrates in the first hour after each changeover, which is where the four rejected units came from.",
        touch: ["CNF-4471", "Shift A and B"] },
    ],
  },
  {
    tab: "Assets & Facilities", eyebrow: "Assets & facilities workspace", kind: "chain",
    heading: ["From delivery", "to depreciation."],
    sub: "Acquisition, capitalisation, service, maintenance and charge stay on one asset.",
    facts: [["8,412", "Assets on register"], ["26", "Sites and buildings"], ["14", "Leases under IFRS 16"]],
    head: [["Register", "Group fixed assets"], ["Asset class", "Plant and machinery"], ["Useful life", "10 years"], ["Asset FA-88201", "In service", true]],
    foot: ["Charged this period", "2,083.33", "Difference 0.00"],
    chain: [
      { name: "Acquisition", ref: "CAP-1120", meta: "Test rig TR-14 delivered to MY01, supplier invoice matched to the receipt", val: "250,000.00", state: "received" },
      { name: "Capitalisation", ref: "FA-88201", meta: "Added to plant and machinery on a ten year straight line basis", val: "250,000.00", state: "capitalised" },
      { name: "In service", ref: "LOC-MY01-B2", meta: "Commissioned in building B2 bay 4, custodian and cost centre assigned", val: "bay 4", state: "commissioned" },
      { name: "Maintenance", ref: "WO-55980", meta: "Planned service completed and signed off, next visit due 12 March", val: "complete", state: "closed" },
      { name: "Depreciation", ref: "DEP-2609", meta: "Monthly charge raised against the asset and its cost centre", val: "2,083.33", state: "posted to ledger" },
    ],
    acts: [
      { q: "Which leases renew this quarter?", readonly: true, confidence: 95,
        say: "Two leases renew before 31 December. The B2 warehouse carries a 9% uplift clause and needs six months notice, so the decision date has already passed.",
        touch: ["B2 warehouse", "+1 lease"] },
      { q: "Show assets due for revaluation", readonly: true, confidence: 94,
        say: "38 assets reach their five year revaluation date this year, carrying 4.2m at net book value. The test rig FA-88201 is not among them until 2031.",
        touch: ["FA-88201", "38 assets"] },
      { q: "Log a facilities request", confidence: 96,
        say: "I can raise a request against building B2 and route it to the facilities team on the standard two day response, referencing the bay 4 commissioning.",
        touch: ["B2", "LOC-MY01-B2"], policy: "Facilities request FM-RQ-01", approver: "Auto assigned",
        done: "Request FM-3312 raised, response due 08 September." },
    ],
  },
];

const MESH_WORKSPACES: readonly WorkspaceEntry[] = [
  {
    tab: "Network & Relationships", eyebrow: "Network & relationships workspace", kind: "map",
    heading: ["Every partner keeps", "their own record."],
    sub: "Invite, verify, link and publish across tenants without copying anyone's master data.",
    facts: [["1,284", "Partner accounts linked"], ["18", "Countries in the network"], ["11", "Profiles awaiting verification"]],
    head: [["Network", "CirrusAtlantic"], ["Linked accounts", "1,284"], ["Countries", "18"], ["Publications", "96 live", true]],
    foot: ["Linked and published", "1,284 accounts", "Awaiting 11"],
    acts: [
      { q: "Which partners are unverified?", readonly: true, confidence: 96,
        say: "Eleven of the 1,284 linked accounts carry an unverified profile. Nine joined this month and two have expired registration documents, which is why they read as unverified rather than simply pending.",
        touch: ["11 accounts", "1,284 linked"] },
      { q: "Invite Athyper Components", confidence: 92,
        say: "Athyper already trades with you on PO-77390 as a supplier record inside Neon. An invitation links that record to their own tenant so they maintain the profile from then on, and you stop keying their bank details.",
        touch: ["Athyper Components", "PO-77390"], policy: "Partner onboarding MSH-ON-01", approver: "Network owner",
        done: "Invitation sent to Athyper Components. Link pending their acceptance." },
      { q: "What changed on profiles this week?", readonly: true, confidence: 94,
        say: "Fourteen partners published a change. Nine of them touched bank details, and every one of those routes through the two person check in Neon before a payment can reach the new account.",
        touch: ["14 publications", "9 bank changes"] },
    ],
  },
  {
    tab: "Commercial Collaboration", eyebrow: "Commercial collaboration workspace", kind: "chain",
    heading: ["Both sides work", "from one document."],
    sub: "Sourcing, contract, order and confirmation stay on a transaction neither party re-keys.",
    facts: [["486", "Shared transactions open"], ["4", "Average responses per event"], ["0", "Documents re-keyed"]],
    head: [["Counterparty", "Athyper Components"], ["Relationship", "Supplier"], ["Currency", "MYR"], ["PO-77401", "Acknowledged", true]],
    foot: ["Ordered and acknowledged", "12,940.00", "Re-keyed 0"],
    chain: [
      { name: "Sourcing event", ref: "RFP-1188", who: "You", side: "us", meta: "Published to six invited suppliers with spec and closing date", val: "6 invited", state: "published" },
      { name: "Response", ref: "QUO-K-4417", who: "Athyper", side: "them", meta: "Priced at 64.70 a unit on a twelve day lead time, certificate attached", val: "64.70 / unit", state: "returned" },
      { name: "Contract", ref: "CTR-2208", who: "Both", side: "both", meta: "Terms accepted and signed in both tenants, price protected to 31 December", val: "signed", state: "agreed" },
      { name: "Order", ref: "PO-77401", who: "You", side: "us", meta: "Sent across the network and acknowledged without a second keying", val: "12,940.00", state: "acknowledged" },
      { name: "Confirmation", ref: "CNF-K-9920", who: "Athyper", side: "them", meta: "Delivery confirmed for 13 September against the acknowledged order", val: "13 Sep", state: "confirmed" },
    ],
    acts: [
      { q: "Where is the order now?", readonly: true, confidence: 96,
        say: "Athyper acknowledged PO-77401 eleven minutes after it was sent and confirmed 13 September for delivery. Neither side re-entered anything, so the order and the confirmation share one record.",
        touch: ["PO-77401", "CNF-K-9920"] },
      { q: "Add Athyper to the next event", confidence: 92,
        say: "Athyper scored highest on the last sourcing event and their contract price holds to 31 December. I can invite them to RFP-1204 with the same specification attached.",
        touch: ["RFP-1204", "Athyper Components"], policy: "Sourcing invitation MSH-SC-02", approver: "Category manager",
        done: "Athyper invited to RFP-1204. Delivered to their tenant, response due 19 September." },
      { q: "How did their quote compare?", readonly: true, confidence: 94,
        say: "Athyper came second on price by forty sen a unit and first on lead time by four days. The award followed lead time because the November cover date left no slack.",
        touch: ["QUO-K-4417", "4 responses"] },
    ],
  },
  {
    tab: "Supply & Services", eyebrow: "Supply & services collaboration workspace", kind: "chain",
    heading: ["Plan, ship, receive,", "on the same record."],
    sub: "Forecast, despatch, receipt and service entry stay visible to both tenants as they happen.",
    facts: [["46", "Shipments in transit"], ["98.2%", "Received on time, in full"], ["0", "Disputed receipts"]],
    head: [["Counterparty", "Athyper Components"], ["Site", "MY01 Shah Alam"], ["Incoterm", "DAP"], ["GR-55120", "Received", true]],
    foot: ["Shipped and received", "200 of 200", "Disputed 0"],
    chain: [
      { name: "Forecast", ref: "FCS-2609", who: "You", side: "us", meta: "Thirteen week demand signal shared so Athyper can hold capacity", val: "13 weeks", state: "shared" },
      { name: "Despatch advice", ref: "ASN-K-3390", who: "Athyper", side: "them", meta: "Two hundred units packed on two pallets, leaving Penang on 11 September", val: "200 units", state: "in transit" },
      { name: "Receipt", ref: "GR-55120", who: "You", side: "us", meta: "Received into MY01, inspected and matched to the advice", val: "200 received", state: "received" },
      { name: "Service entry", ref: "SES-0912", who: "Athyper", side: "them", meta: "Recorded by their engineer, signed off by your site lead", val: "16 hrs", state: "approved" },
      { name: "Settlement", ref: "SET-77420", who: "Both", side: "both", meta: "Receipt and service entry released together for one invoice", val: "12,940.00", state: "released to invoice" },
    ],
    acts: [
      { q: "Is the shipment on time?", readonly: true, confidence: 97,
        say: "ASN-K-3390 left Penang on 11 September and landed on the 13th exactly as advised. Two hundred units received, none short and none damaged.",
        touch: ["ASN-K-3390", "GR-55120"] },
      { q: "Share the updated forecast", confidence: 93,
        say: "The thirteen week signal moved up eight percent on brackets. Sharing it now gives Athyper three weeks of notice instead of the one week they would otherwise get.",
        touch: ["FCS-2610", "Athyper Components"], policy: "Forecast sharing MSH-FC-01", approver: "Planning lead",
        done: "Forecast FCS-2610 shared with Athyper. Acknowledgement pending." },
      { q: "Any disputed receipts?", readonly: true, confidence: 96,
        say: "None this quarter. Two receipts were short last quarter and both cleared by credit note within four days, because the despatch advice and the receipt sat on the same record.",
        touch: ["0 disputes", "2 last quarter"] },
    ],
  },
  {
    tab: "Financial Collaboration", eyebrow: "Financial collaboration workspace", kind: "chain",
    heading: ["Get paid early,", "without a phone call."],
    sub: "Presentment, approval, offer, funding and settlement stay on one financing record.",
    facts: [["MYR 4.1m", "Invoices inside the programme"], ["1.2%", "Average discount taken"], ["0", "Disputed settlements"]],
    head: [["Programme", "Supplier early payment"], ["Funder", "Meridian Capital"], ["Currency", "MYR"], ["PAY-10442", "Settled", true]],
    foot: ["Funded and settled", "5,109.20", "Disputed 0"],
    chain: [
      { name: "Presentment", ref: "AP-INV-24817", who: "Arrowline", side: "them", meta: "Presented on the network and matched to its order and receipt", val: "5,109.20", state: "matched" },
      { name: "Approval", ref: "APV-3312", who: "You", side: "us", meta: "Approved for payment on thirty day terms, falling due 12 October", val: "due 12 Oct", state: "approved" },
      { name: "Offer", ref: "OFR-8840", who: "Meridian", side: "them", meta: "Offered at 1.2% for settlement twenty eight days early", val: "1.2%", state: "offered" },
      { name: "Funding", ref: "FND-1120", who: "Meridian", side: "them", meta: "Supplier accepted, so the funder pays them today, not in four weeks", val: "5,047.89", state: "funded" },
      { name: "Settlement", ref: "PAY-10442", who: "You", side: "us", meta: "You settle the full amount to the funder on the original due date", val: "5,109.20", state: "settled" },
    ],
    acts: [
      { q: "Which invoices could be financed?", readonly: true, confidence: 95,
        say: "Fourteen approved invoices worth 46,208.90 sit inside the programme window. At the current 1.2% rate, taking every one of them would cost 554.51 in discount.",
        touch: ["14 invoices", "46,208.90"] },
      { q: "Accept the early payment offer", confidence: 90,
        say: "Meridian pays Arrowline 5,047.89 today against AP-INV-24817, and you settle the full 5,109.20 on 12 October. The discount of 61.31 is borne by the supplier, not by you.",
        touch: ["OFR-8840", "AP-INV-24817"], policy: "Early payment MSH-EP-01", approver: "Treasury lead",
        done: "Offer accepted. Funding FND-1120 released, settlement scheduled for 12 October." },
      { q: "What would this cost over a year?", readonly: true, confidence: 91,
        say: "At last year's volume the programme costs roughly 41,000 in discount and releases about 3.1m of working capital earlier. Whether that is worth it depends on what the cash earns elsewhere.",
        touch: ["4.1m in programme", "1.2% rate"] },
    ],
  },
];

const STUDIO_WORKSPACES: readonly WorkspaceEntry[] = [
  {
    tab: "Entity Studio", eyebrow: "Entity studio workspace", kind: "chain",
    heading: ["Model once.", "Publish to every plane."],
    sub: "A change set becomes a signed release and activates on every runtime that asked for it.",
    facts: [["412", "Entities published"], ["1,482", "Releases to date"], ["0", "Planes running behind"]],
    head: [["Entity", "business_partner"], ["Release", "1482"], ["Compatibility", "Backward"], ["Planes", "3 activated", true]],
    foot: ["Planes acknowledged", "3 of 3", "Drift 0"],
    chain: [
      { name: "Change set", ref: "CS-0142", meta: "business_partner gains three fields, one index and one validation rule", val: "5 changes", state: "drafted" },
      { name: "Contract revision", ref: "REV-2208", meta: "Compiled to an entity contract and checked as backward compatible", val: "backward", state: "validated" },
      { name: "Approval", ref: "APR-1190", meta: "Both approvers signed and the change window was confirmed", val: "2 of 2", state: "approved" },
      { name: "Release", ref: "REL-1482", meta: "One artifact compiled per plane, signed and sealed under a single hash", val: "4f9c8a21", state: "published" },
      { name: "Activation", ref: "APL-3320", meta: "Neon, Mesh and the supplier portal acknowledged and activated the release", val: "3 of 3", state: "acknowledged" },
    ],
    acts: [
      { q: "What changed in release 1482?", readonly: true, confidence: 97,
        say: "Release 1482 carries change set 0142 on business_partner: three new fields, one index and one validation rule. All three are additive, which is why it compiled as backward compatible.",
        touch: ["CS-0142", "REL-1482"] },
      { q: "Publish this to the sandbox first", confidence: 92,
        say: "I can stage release 1482 on the sandbox planes only, leaving production untouched until you have seen the descriptors land and the acknowledgements come back.",
        touch: ["REL-1482", "3 sandbox planes"], policy: "Release promotion PUB-RL-02", approver: "Platform owner",
        done: "Release 1482 staged on sandbox. Three acknowledgements received." },
      { q: "Is anything running an older contract?", readonly: true, confidence: 95,
        say: "Every plane is on 1482. Two extensions still declare contract 1479, which stays valid because the change was backward compatible, but they will need a rebuild before the next breaking release.",
        touch: ["APL-3320", "2 extensions"] },
    ],
  },
  {
    tab: "Policy Studio", eyebrow: "Policy studio workspace", kind: "chain",
    heading: ["A rule you can", "test before you trust."],
    sub: "Draft, simulate, approve, bind and enforce stay on one policy version.",
    facts: [["96", "Policies in force"], ["1,284", "Decisions evaluated today"], ["0", "Silent overrides"]],
    head: [["Policy", "Payment approval"], ["Version", "7"], ["Effective", "01 October"], ["Bindings", "2 actions", true]],
    foot: ["Decisions today", "1,284", "Overrides 0"],
    chain: [
      { name: "Draft", ref: "POL-AP-07", meta: "Approval limits redrafted for the MY entities with a 25,000 delegated ceiling", val: "1 policy", state: "drafted" },
      { name: "Simulation", ref: "SIM-2204", meta: "Replayed against ninety days of decisions to see what would change", val: "41 differ", state: "simulated" },
      { name: "Approval", ref: "APR-1206", meta: "Signed by finance and risk with an effective date agreed", val: "2 of 2", state: "approved" },
      { name: "Binding", ref: "BND-3312", meta: "Bound to payment run and requisition actions on Neon and Mesh", val: "2 actions", state: "bound" },
      { name: "Decision", ref: "DEC-88214", meta: "First live evaluation routed payment run PAY-10488 to the treasury lead", val: "1 decision", state: "enforced" },
    ],
    acts: [
      { q: "What changes if I approve this?", readonly: true, confidence: 94,
        say: "Forty one of the last ninety days of decisions would have routed differently, all of them upward. Nothing that was approved would have been blocked, so this tightens rather than loosens.",
        touch: ["SIM-2204", "41 decisions"] },
      { q: "Publish the new approval limit", confidence: 91,
        say: "Version 7 can bind to payment runs and requisitions from 1 October. Anything already in flight keeps version 6 until it completes, so no approval restarts.",
        touch: ["POL-AP-07", "BND-3312"], policy: "Policy release POL-RL-01", approver: "Finance and risk",
        done: "Version 7 published, effective 01 October. Two bindings updated." },
      { q: "Where is this policy used?", readonly: true, confidence: 96,
        say: "Two actions bind it directly, and thirty four workflows read it at a decision step. Changing the ceiling therefore reaches procurement as well as finance.",
        touch: ["2 actions", "34 flows"] },
    ],
  },
  {
    tab: "ProcessFlow Studio", eyebrow: "ProcessFlow studio workspace", kind: "chain",
    heading: ["Draw the process,", "then watch it run."],
    sub: "Design, simulation, publication, instance and completion stay on one flow version.",
    facts: [["34", "Flows published"], ["1,140", "Instances this month"], ["0", "Service levels breached"]],
    head: [["Flow", "Requisition approval"], ["Version", "3"], ["Steps", "4"], ["INS-99120", "Completed", true]],
    foot: ["Completed this month", "1,140", "Breached 0"],
    chain: [
      { name: "Design", ref: "FLW-0311", meta: "Four steps with one conditional branch on the delegated spending limit", val: "4 steps", state: "designed" },
      { name: "Simulation", ref: "SIM-0788", meta: "Replayed on two hundred historical requisitions to size the queues", val: "6 hrs median", state: "simulated" },
      { name: "Publication", ref: "REL-1482", meta: "Shipped with the release and activated on Neon in the same window", val: "REL-1482", state: "activated" },
      { name: "Instance", ref: "INS-99120", meta: "REQ-40218 entered the flow and took the within limit branch", val: "1 instance", state: "running" },
      { name: "Completion", ref: "CMP-4412", meta: "Approved and handed to procurement inside the agreed service level", val: "2h 14m", state: "completed" },
    ],
    acts: [
      { q: "Where do requisitions get stuck?", readonly: true, confidence: 93,
        say: "The category manager step holds the median instance for four of its six hours. Everything above the delegated limit passes through that one person.",
        touch: ["FLW-0311", "1,140 instances"] },
      { q: "Add a second approver above 50,000", confidence: 90,
        say: "A fifth step would catch eleven percent of instances. On the last ninety days that adds about three hours to those, and nothing to the rest.",
        touch: ["FLW-0311", "SIM-0788"], policy: "Flow change FLW-CH-02", approver: "Process owner",
        done: "Version 4 drafted with the second approver. Simulation queued before release." },
      { q: "Simulate the change first", readonly: true, confidence: 95,
        say: "On two hundred historical requisitions, twenty two would route to the extra approver. Median time to approval moves from six hours to six hours forty minutes overall.",
        touch: ["SIM-0788", "22 instances"] },
    ],
  },
  {
    tab: "Experience Studio", eyebrow: "Experience studio workspace", kind: "chain",
    heading: ["One layout,", "every surface."],
    sub: "Composition, navigation, variants, publication and render stay on one experience.",
    facts: [["26", "Layouts published"], ["3", "Surfaces served"], ["240ms", "Median time to paint"]],
    head: [["Layout", "Business partner"], ["Surfaces", "Desktop, mobile, portal"], ["Roles", "3"], ["RND-77120", "Serving", true]],
    foot: ["Rendered today", "1,284 sessions", "Fallbacks 0"],
    chain: [
      { name: "Composition", ref: "LAY-2210", meta: "Business partner page composed from the fields the entity contract exposes", val: "1 layout", state: "composed" },
      { name: "Navigation", ref: "NAV-0142", meta: "Placed in the master data workspace and ordered against role visibility", val: "3 roles", state: "placed" },
      { name: "Variants", ref: "VAR-0088", meta: "A compact arrangement added for mobile and for the supplier portal", val: "2 variants", state: "added" },
      { name: "Publication", ref: "REL-1482", meta: "Shipped with the release, one descriptor compiled for each plane", val: "3 planes", state: "published" },
      { name: "Render", ref: "RND-77120", meta: "Served to real sessions today with no fallback layout used", val: "240 ms", state: "serving" },
    ],
    acts: [
      { q: "What does the portal see?", readonly: true, confidence: 96,
        say: "The compact variant with eleven of the nineteen fields. Bank details and internal risk scoring are not in that variant, so a supplier cannot reach them from any surface.",
        touch: ["VAR-0088", "11 fields"] },
      { q: "Add the new fields to this page", confidence: 89,
        say: "Release 1482 added three fields to business_partner. I can place them in the desktop layout and leave the portal variant alone unless you want suppliers to see them.",
        touch: ["LAY-2210", "3 fields"], policy: "Layout change EXP-LY-01", approver: "Experience owner",
        done: "Three fields placed on the desktop layout. Portal variant unchanged." },
      { q: "Is anything rendering slowly?", readonly: true, confidence: 92,
        say: "Two layouts sit above 500ms, both because they load a related list without paging. Business partner is not one of them at 240ms median.",
        touch: ["2 layouts", "26 published"] },
    ],
  },
  {
    tab: "Document Studio", eyebrow: "Document studio workspace", kind: "chain",
    heading: ["The record becomes", "the paperwork."],
    sub: "Template, composition, rendering, delivery and retention stay on one document.",
    facts: [["8", "Templates in use"], ["312", "Documents produced today"], ["0", "Render failures"]],
    head: [["Template", "Customer invoice"], ["Format", "PDF/A"], ["Locales", "3"], ["ARC-2214", "Retained", true]],
    foot: ["Produced today", "312 documents", "Failed 0"],
    chain: [
      { name: "Template", ref: "TPL-INV-04", meta: "Customer invoice layout bound to the sales invoice entity and its tax lines", val: "1 template", state: "bound" },
      { name: "Composition", ref: "CMP-90233", meta: "AR-INV-90233 composed with the tax breakdown and payment terms filled", val: "3 locales", state: "composed" },
      { name: "Rendering", ref: "PDF-55021", meta: "PDF/A produced, digitally signed and stamped with the release hash", val: "signed", state: "rendered" },
      { name: "Delivery", ref: "SND-4410", meta: "Emailed to the customer and posted to the supplier portal for download", val: "2 channels", state: "delivered" },
      { name: "Retention", ref: "ARC-2214", meta: "Archived to storage under the seven year financial records rule", val: "7 years", state: "retained" },
    ],
    acts: [
      { q: "Why did three invoices fail to render?", readonly: true, confidence: 92,
        say: "They failed yesterday, not today, and all three carried more than forty lines. The tax call timed out, which is the same fault Observability traced to release 1482.",
        touch: ["TPL-INV-04", "ERR-55021"] },
      { q: "Re-issue the invoice in Malay", confidence: 94,
        say: "AR-INV-90233 can be recomposed in Malay from the same record, which means a new rendering and a new signature but no change to the ledger entry.",
        touch: ["CMP-90233", "ms-MY"], policy: "Document reissue DOC-RI-01", approver: "You send it",
        done: "Reissued as PDF-55044 in Malay, signed and delivered on both channels." },
      { q: "What is bound to this template?", readonly: true, confidence: 97,
        say: "The sales invoice entity, its tax lines and the payment terms policy. A change to the tax breakdown therefore reaches every invoice rendered after publication.",
        touch: ["TPL-INV-04", "3 bindings"] },
    ],
  },
  {
    tab: "Storage Studio", eyebrow: "Storage studio workspace", kind: "chain",
    heading: ["Every object knows", "what it is."],
    sub: "Upload, classification, access, lifecycle and disposal stay on one object.",
    facts: [["1.2 TB", "Under management"], ["0", "Unclassified objects"], ["4", "Legal holds active"]],
    head: [["Bucket", "CirrusAtlantic MY"], ["Class", "Confidential"], ["Retention", "7 years"], ["DSP-1180", "On hold", true]],
    foot: ["Stored under retention", "1.2 TB", "Unclassified 0"],
    chain: [
      { name: "Upload", ref: "OBJ-77410", meta: "Signed invoice written to the tenant bucket with its checksum recorded", val: "412 KB", state: "stored" },
      { name: "Classification", ref: "CLS-0091", meta: "Classified as a financial record and linked back to AR-INV-90233", val: "confidential", state: "classified" },
      { name: "Access", ref: "ACL-3312", meta: "Readable by finance and audit roles only, and every read is logged", val: "2 roles", state: "scoped" },
      { name: "Lifecycle", ref: "LFC-2214", meta: "Moved to cool storage after ninety days with retention running to 2033", val: "2033", state: "retained" },
      { name: "Disposal", ref: "DSP-1180", meta: "Legal hold checked before each cycle, nothing eligible for deletion", val: "0 eligible", state: "held" },
    ],
    acts: [
      { q: "Who has read this invoice?", readonly: true, confidence: 98,
        say: "Six reads since it was archived, all by finance roles and all logged. Nobody outside the two scoped roles has opened it.",
        touch: ["ACL-3312", "6 reads"] },
      { q: "What can we delete this quarter?", readonly: true, confidence: 93,
        say: "Nothing under financial retention. Eighty gigabytes of rendering temporary files are eligible, and four legal holds cover the rest regardless of age.",
        touch: ["DSP-1180", "80 GB"] },
      { q: "Move cold data to archive tier", confidence: 95,
        say: "Four hundred gigabytes have not been read in a year and sit outside every legal hold. Moving them keeps retrieval available, just slower and cheaper.",
        touch: ["LFC-2214", "400 GB"], policy: "Storage tiering STO-LC-02", approver: "Platform owner",
        done: "Four hundred gigabytes moved to archive tier. Retention dates unchanged." },
    ],
  },
  {
    tab: "TrustIAM Studio", eyebrow: "TrustIAM studio workspace", kind: "chain",
    heading: ["Access is granted,", "and it is proven."],
    sub: "Request, conflict check, approval, grant and attestation stay on one access record.",
    facts: [["2,452", "Identities in the directory"], ["1,204", "Roles defined"], ["0", "Unresolved conflicts"]],
    head: [["Directory", "CirrusAtlantic"], ["Roles", "1,204"], ["Review cycle", "September open"], ["REQ-IAM-882", "Granted", true]],
    foot: ["Granted and attested", "1 role", "Conflicts 0"],
    chain: [
      { name: "Request", ref: "REQ-IAM-882", meta: "Payroll manager role requested for EMP-40917 with a written justification", val: "1 role", state: "raised" },
      { name: "Segregation check", ref: "SOD-114", meta: "Tested against 42 conflict rules, no toxic combination found", val: "0 conflicts", state: "clear" },
      { name: "Approval", ref: "APR-2210", meta: "Signed by the role owner and the data steward for payroll", val: "2 of 2", state: "approved" },
      { name: "Grant", ref: "GRT-7781", meta: "Granted for 90 days with step up authentication required at sign in", val: "90 days", state: "active" },
      { name: "Attestation", ref: "CERT-0925", meta: "Included in the September access review with its evidence retained", val: "attested", state: "recorded" },
    ],
    acts: [
      { q: "Who can post to the ledger?", readonly: true, confidence: 96,
        say: "Forty one people hold a role that can post. Six of them also hold an approval role, and all six are covered by the compensating control on payment limits.",
        touch: ["1,204 roles", "41 identities"] },
      { q: "Expire dormant access", confidence: 93,
        say: "Twenty three grants have gone unused for 90 days. I can expire them and notify each holder, keeping the two break glass accounts untouched.",
        touch: ["23 grants", "2 break glass"], policy: "Dormant access IAM-DA-01", approver: "Data steward",
        done: "Twenty three grants expired. Holders notified, evidence written to CERT-0925." },
      { q: "Show conflicts for the payroll role", readonly: true, confidence: 94,
        say: "The payroll manager role conflicts with vendor maintenance and with payment release. Neither is held by EMP-40917, so this grant stays clean.",
        touch: ["SOD-114", "EMP-40917"] },
    ],
  },
  {
    tab: "Observability Studio", eyebrow: "Observability studio workspace", kind: "chain",
    heading: ["A signal becomes", "a resolved incident."],
    sub: "Errors, traces, budgets and rollbacks belong to the release that caused them.",
    facts: [["99.95%", "Availability this window"], ["62%", "Error budget remaining"], ["0", "Open incidents"]],
    head: [["Service", "Posting"], ["Window", "28 days"], ["Error budget", "62%"], ["INC-1120", "Resolved", true]],
    foot: ["Budget remaining", "62%", "Open incidents 0"],
    chain: [
      { name: "Signal", ref: "ERR-55021", meta: "The posting service returned twelve errors in five minutes on MY01", val: "12 errors", state: "detected" },
      { name: "Correlation", ref: "TRC-8890", meta: "Traced to the tax calculation call introduced in release 1482", val: "REL-1482", state: "correlated" },
      { name: "Objective", ref: "SLO-04", meta: "Error budget for posting fell to 62% remaining inside this window", val: "62% left", state: "at risk" },
      { name: "Response", ref: "INC-1120", meta: "Incident raised, owner paged, release rolled back on Mesh within nine minutes", val: "9 minutes", state: "mitigated" },
      { name: "Verification", ref: "VER-3312", meta: "Error rate held at baseline for thirty minutes before the incident closed", val: "baseline", state: "resolved" },
    ],
    acts: [
      { q: "What caused the posting errors?", readonly: true, confidence: 93,
        say: "The tax calculation call in release 1482 times out when a document carries more than forty lines. Twelve of the fourteen failures were large invoices from the same customer.",
        touch: ["ERR-55021", "REL-1482"] },
      { q: "Roll back release 1482 on Mesh", confidence: 88,
        say: "Mesh can return to release 1479, which is the last version it acknowledged cleanly. Neon stays on 1482, so the two planes will differ until the fix ships.",
        touch: ["REL-1482", "Mesh"], policy: "Emergency rollback OBS-RB-01", approver: "Platform owner and on call",
        done: "Mesh rolled back to 1479. Drift recorded against APL-3320 for review." },
      { q: "Show services near their budget", readonly: true, confidence: 96,
        say: "Posting is at 62% and document generation at 71%. Everything else sits above 90%, so posting is the only one worth watching this window.",
        touch: ["SLO-04", "2 services"] },
    ],
  },
  {
    tab: "Communications Studio", eyebrow: "Communications studio workspace", kind: "chain",
    heading: ["An event becomes", "a message someone reads."],
    sub: "Audience, template, delivery and acknowledgement stay attached to the event that raised them.",
    facts: [["92", "Notifications today"], ["3", "Locales rendered"], ["0", "Failed deliveries"]],
    head: [["Channels", "Inbox and email"], ["Locales", "3"], ["Quiet hours", "Respected"], ["MSG-9931", "Delivered", true]],
    foot: ["Delivered and read", "16 sent", "Failed 0"],
    chain: [
      { name: "Event", ref: "EVT-77401", meta: "Journal JE-77401 posted and period 09 closed on company code MY01", val: "1 event", state: "emitted" },
      { name: "Audience", ref: "AUD-220", meta: "Resolved to eighteen recipients from role membership and subscriptions", val: "18 people", state: "resolved" },
      { name: "Template", ref: "TPL-CLOSE-02", meta: "Rendered in three locales with the period figures bound into the body", val: "3 locales", state: "rendered" },
      { name: "Delivery", ref: "MSG-9931", meta: "Sixteen sent to inbox and email, two held by quiet hours until 08:00", val: "16 sent", state: "delivered" },
      { name: "Acknowledgement", ref: "ACK-4410", meta: "Fourteen opened it and the controller replied on the close thread", val: "14 read", state: "acknowledged" },
    ],
    acts: [
      { q: "Who has not read the close notice?", readonly: true, confidence: 97,
        say: "Four people have not opened it. Two are on leave until Monday and two are held by quiet hours, so nobody has actually missed it yet.",
        touch: ["MSG-9931", "ACK-4410"] },
      { q: "Remind the two still pending", confidence: 94,
        say: "I can resend to the two whose quiet hours lapse at 08:00 and leave the people on leave alone until they return.",
        touch: ["2 recipients", "TPL-CLOSE-02"], policy: "Reminder cadence COM-RM-02", approver: "You send it",
        done: "Reminder queued for 08:00. Two recipients, one locale." },
      { q: "Preview the template in Malay", readonly: true, confidence: 92,
        say: "The Malay rendering fits, though the period figures push the summary line onto a second row on mobile. The English and Mandarin versions hold to one row.",
        touch: ["TPL-CLOSE-02", "ms-MY"] },
    ],
  },
  {
    tab: "Integration Studio", eyebrow: "Integration studio workspace", kind: "chain",
    heading: ["A file arrives,", "the ledger clears."],
    sub: "Connection, ingest, mapping, job and handoff stay on one run with its exceptions.",
    facts: [["41", "Connections live"], ["318", "Lines in this run"], ["4", "Exceptions waiting"]],
    head: [["Connection", "Bank MY01"], ["Protocol", "SFTP"], ["Schedule", "Every 15 minutes"], ["JOB-5540", "Completed", true]],
    foot: ["Received and posted", "296 of 318", "Exceptions 4"],
    chain: [
      { name: "Connection", ref: "CON-BANK-01", meta: "Bank statement feed over SFTP, credentials rotated four days ago", val: "healthy", state: "connected" },
      { name: "Ingest", ref: "RUN-11204", meta: "MT940 file received on schedule and parsed into statement lines", val: "318 lines", state: "received" },
      { name: "Mapping", ref: "MAP-0071", meta: "Mapped to bank transactions, four lines failed validation and were quarantined", val: "314 valid", state: "mapped" },
      { name: "Job", ref: "JOB-5540", meta: "Automatic matching ran against open items on the first pass", val: "296 matched", state: "completed" },
      { name: "Handoff", ref: "HND-2210", meta: "Matched items passed to Neon for clearing, the rest queued for a human", val: "296 posted", state: "posted to Neon" },
    ],
    acts: [
      { q: "What is stuck in the exception queue?", readonly: true, confidence: 96,
        say: "Four lines failed on a missing reference and eighteen matched partially. The four all come from the same counterparty, which changed its remittance format on Tuesday.",
        touch: ["MAP-0071", "4 lines"] },
      { q: "Re-run the failed lines", confidence: 91,
        say: "I can re-run the four quarantined lines against the updated remittance pattern. If they still fail they stay quarantined rather than posting on a guess.",
        touch: ["RUN-11204", "4 lines"], policy: "Reprocessing INT-RP-01", approver: "Integration owner",
        done: "Four lines reprocessed, three matched. One remains quarantined for review." },
      { q: "Which connections look unhealthy?", readonly: true, confidence: 94,
        say: "Two of forty one need attention. The payroll SFTP key expires in six days and the tax authority endpoint has been slow since Thursday, though it has not failed.",
        touch: ["2 connections", "41 live"] },
    ],
  },
  {
    tab: "Atlas AI Studio", eyebrow: "Atlas AI studio workspace", kind: "chain",
    heading: ["Every answer shows", "where it came from."],
    sub: "Request, grounding, policy, tool call and evidence stay on one agent trace.",
    facts: [["4", "Providers in the pool"], ["0.94", "Median confidence"], ["0", "Actions without evidence"]],
    head: [["Provider", "Governed pool"], ["Autonomy", "Act with approval"], ["Threshold", "0.90"], ["ASK-9921", "Recorded", true]],
    foot: ["Above threshold", "0.94", "Unlogged actions 0"],
    chain: [
      { name: "Request", ref: "ASK-9921", meta: "A finance user asked Atlas to close period 09 from the Neon workspace", val: "1 request", state: "received" },
      { name: "Grounding", ref: "KNW-3308", meta: "Retrieved six records the user is permitted to see and nothing beyond them", val: "6 records", state: "grounded" },
      { name: "Policy", ref: "POL-AI-02", meta: "Autonomy set to act with approval, minimum confidence of 0.90 for this action", val: "0.94", state: "permitted" },
      { name: "Tool call", ref: "TL-7788", meta: "Called the period close tool with the parameters the approver confirmed", val: "1 tool", state: "executed" },
      { name: "Evidence", ref: "AUD-90233", meta: "Prompt, sources, decision and result written to the audit trail", val: "sealed", state: "recorded" },
    ],
    acts: [
      { q: "What did Atlas do yesterday?", readonly: true, confidence: 98,
        say: "Fourteen actions ran, twelve with approval and two automatically because they sat above the automatic threshold and changed nothing. All fourteen carry evidence records.",
        touch: ["AUD-90233", "14 actions"] },
      { q: "Lower autonomy for payments", confidence: 95,
        say: "Payment actions can drop to suggest only, so Atlas may prepare a run but never release one. That is stricter than the current setting of act with approval.",
        touch: ["POL-AI-02", "Payment actions"], policy: "Autonomy change AI-AU-01", approver: "AI governance owner",
        done: "Payment actions set to suggest only, effective immediately." },
      { q: "Show what grounded the last answer", readonly: true, confidence: 97,
        say: "Six records: the period record, two unmatched receipts, the parked payroll journal and two policy definitions. Nothing outside the requester's roles was read.",
        touch: ["KNW-3308", "6 records"] },
    ],
  },
  {
    tab: "Extension Studio", eyebrow: "Extension studio workspace", kind: "chain",
    heading: ["Extend the platform", "without forking it."],
    sub: "Scaffold, build, review, publish and install stay bound to a versioned contract.",
    facts: [["18", "Extensions listed"], ["1.2.0", "Current version"], ["0", "Open review findings"]],
    head: [["Extension", "Fleet tracking"], ["Version", "1.2.0"], ["Against contract", "1482"], ["INS-6620", "Installed", true]],
    foot: ["Published and installed", "3 tenants", "Findings 0"],
    chain: [
      { name: "Scaffold", ref: "EXT-2201", meta: "Generated from the SDK against the published entity contract 1482", val: "1 extension", state: "scaffolded" },
      { name: "Build", ref: "BLD-3390", meta: "Compiled and signed with its declared permissions and contracts checked", val: "4 permissions", state: "signed" },
      { name: "Review", ref: "REV-0088", meta: "Static analysis and a human review found no unscoped data access", val: "0 findings", state: "approved" },
      { name: "Publish", ref: "PUB-1150", meta: "Listed in the tenant catalogue and made available to entitled plans", val: "v1.2.0", state: "listed" },
      { name: "Install", ref: "INS-6620", meta: "Installed on Neon for three tenants and bound to their entitlements", val: "3 tenants", state: "installed" },
    ],
    acts: [
      { q: "What permissions does this extension hold?", readonly: true, confidence: 97,
        say: "Four: read on business_partner and equipment, write on fleet_assignment, and one outbound call to the telematics provider. None of them reach finance data.",
        touch: ["BLD-3390", "4 permissions"] },
      { q: "Roll it out to the rest of the tenants", confidence: 89,
        say: "Eleven more tenants are entitled. Two of them still run contract 1479, so I would install for the nine on 1482 and hold the other two until they catch up.",
        touch: ["INS-6620", "9 tenants"], policy: "Extension rollout EXT-RO-02", approver: "Platform owner",
        done: "Installed for nine tenants. Two held pending their contract upgrade." },
      { q: "Which extensions break on the next release?", readonly: true, confidence: 90,
        say: "Two of eighteen reference a field that the next contract renames. Both are internal, so a rebuild before the release window clears it without any tenant impact.",
        touch: ["2 extensions", "Next contract"] },
    ],
  },
  {
    tab: "Plans & Entitlements", eyebrow: "Plans & entitlements studio workspace", kind: "chain",
    heading: ["From catalogue", "to metered seat."],
    sub: "What is sold, what is subscribed and what is actually used stay on one entitlement.",
    facts: [["26", "Modules in the catalogue"], ["250", "Seats entitled"], ["0", "Overage this term"]],
    head: [["Tenant", "CirrusAtlantic"], ["Plan", "Enterprise"], ["Term", "Annual"], ["Quota", "68% used", true]],
    foot: ["Entitled and used", "214 of 250", "Overage 0"],
    chain: [
      { name: "Catalogue item", ref: "CAT-NEON-FIN", meta: "Finance listed with its capabilities, dependencies and supported planes", val: "1 module", state: "listed" },
      { name: "Plan", ref: "PLN-ENT-04", meta: "Bundled into Enterprise with seat count, quota ceiling and fair use terms", val: "250 seats", state: "published" },
      { name: "Subscription", ref: "SUB-2214", meta: "CirrusAtlantic subscribed from 1 September on annual terms", val: "12 months", state: "active" },
      { name: "Entitlement", ref: "ENT-9902", meta: "Finance unlocked for 214 users, everyone else keeps read only access", val: "214 seats", state: "granted" },
      { name: "Usage", ref: "USG-2609", meta: "Metered against quota with four months of the term still to run", val: "68%", state: "within quota" },
    ],
    acts: [
      { q: "Are we going to breach quota?", readonly: true, confidence: 91,
        say: "At the current rate you reach 94% by term end, so no breach. The rise comes almost entirely from document generation in Finance, which doubled after the period close.",
        touch: ["USG-2609", "SUB-2214"] },
      { q: "Add 40 seats to Finance", confidence: 90,
        say: "Forty seats takes you to 254, four above the plan ceiling. I can raise an amendment for the extra tier rather than let the overage bill at list price.",
        touch: ["ENT-9902", "PLN-ENT-04"], policy: "Subscription change PLN-SC-03", approver: "Commercial owner",
        done: "Amendment SUB-2214-A raised for 300 seats, effective 01 October." },
      { q: "Which modules are paid for but unused?", readonly: true, confidence: 95,
        say: "Three modules have entitlements and no usage this quarter: Real Estate Management, Strategic Sourcing and Knowledge & Retrieval. Together they hold 62 seats.",
        touch: ["3 modules", "62 seats"] },
    ],
  },
];

const WORKSPACES_BY_PLANE: Record<BrandPlane, readonly WorkspaceEntry[]> = {
  neon: NEON_WORKSPACES,
  mesh: MESH_WORKSPACES,
  studio: STUDIO_WORKSPACES,
};

const ROTATE_MS = 8000;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mql.matches);
  }, []);
  return reduced;
}

function LedgerTape({ entries }: { readonly entries: readonly LedgerEntry[] }) {
  function block(entry: LedgerEntry, dupKey: string) {
    return <div className="a-ws-group" key={dupKey}>
      <div className="a-ws-group-head"><b>{entry.ref}</b><span>{entry.source}</span><time>{entry.date}</time></div>
      {entry.lines.map((line, i) => <div className="a-ws-line" key={i}>
        <span className="a-ws-acct"><code>{line.account}</code><span>{line.label}</span></span>
        <span className="a-ws-amt a-ws-dr">{line.debit ?? "—"}</span>
        <span className="a-ws-amt a-ws-cr">{line.credit ?? "—"}</span>
      </div>)}
    </div>;
  }
  return <>
    <div className="a-ws-cols"><span>Account</span><i>Debit</i><i>Credit</i></div>
    <div className="a-ws-viewport">
      <div className="a-ws-tape">
        {entries.map((e) => block(e, `a-${e.ref}`))}
        {entries.map((e) => block(e, `b-${e.ref}`))}
      </div>
      <div className="a-ws-postline" />
    </div>
  </>;
}

function ChainBody({ steps }: { readonly steps: readonly ChainStep[] }) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const reduced = useReducedMotion();
  React.useEffect(() => {
    setActiveIndex(0);
    if (reduced) { setActiveIndex(steps.length); return; }
    let k = 0;
    const id = setInterval(() => {
      k++;
      setActiveIndex(k);
      if (k > steps.length) clearInterval(id);
    }, 1250);
    return () => clearInterval(id);
  }, [steps, reduced]);
  return <div className="a-ws-chain-wrap">
    <div className="a-ws-chain-head"><i /><span>Step</span><span>Result</span></div>
    <div className="a-ws-chain">
      {steps.map((step, i) => <div className={`a-ws-link${i < activeIndex ? " done" : ""}${i === activeIndex ? " now" : ""}`} key={step.ref}>
        <div className="a-ws-track"><i className="a-ws-node" /></div>
        <div className="a-ws-link-main">
          <div className="a-ws-link-top"><b>{step.name}</b><code>{step.ref}</code>
            {step.who ? <span className={`a-ws-who a-ws-who-${step.side ?? "both"}`}>{step.who}</span> : null}</div>
          <div className="a-ws-link-meta">{step.meta}</div>
        </div>
        <div className="a-ws-link-side"><b>{step.val}</b><span>{step.state}</span></div>
      </div>)}
    </div>
  </div>;
}

/* ---------- world map: real coastline data, hub/spoke network, hover tooltip ---------- */
const LAND: readonly (readonly number[])[] = [
  [-168,65.5,-165,60.5,-162,58,-156,57.5,-152,59,-148,60.5,-140,59.5,-135,57,-131,53,-127,50,
   -124,46,-122,37,-118,33.5,-115,31,-113,28,-111,25.5,-109,23.5,-106,22,-101,18.5,-96,16,
   -92,15,-89,13.5,-84,10,-79,9,-77,8,-80,9.5,-83,11,-86,14,-88,16,-91,18.5,-95,18.5,
   -97,21,-97,25.5,-94,29.5,-90,29,-86,30.5,-83,29.5,-81,25.5,-80.5,28,-81,31.5,-78,33.5,
   -76,35.5,-75,38.5,-71,41.5,-67,44.5,-64,45.5,-60,46.5,-56,50.5,-60,54,-64,56,-63,58.5,
   -66,61,-70,62.5,-78,62.5,-80,66,-85,70,-95,70,-105,68.5,-115,70,-125,70,-133,69,
   -141,70,-156,71,-164,68],
  [-45,60,-50,63.5,-54,67,-58,71,-66,76,-70,79,-62,82.5,-45,83,-25,82,-20,77,-22,72,-30,68.5,-38,65,-43,60],
  [-77,8,-72,11.5,-66,10.5,-60,8.5,-52,5,-50,0.5,-44,-2,-38,-5,-35,-8,-37,-12,-39,-18,-43,-23,
   -48,-25.5,-53,-33,-58,-35,-62,-39,-63,-42,-66,-45,-69,-50,-71,-54.5,-74,-53,-75,-48,-74,-42,
   -73,-37,-71,-30,-70,-23,-71,-18,-76,-14,-79,-8,-81,-5,-80.5,-2,-78,1,-77,4],
  [-6,36,-3,35.5,3,37,10,37,15,32.5,20,32,25,32,32,31.5,34,29,35,27,37,22,38.5,17.5,40,15,43,12,
   47,11.5,51,11.8,51,9,48,5,45,3,42,-1,40,-8,41,-13,36,-18,35,-22,33,-26,30,-31,27,-33.5,
   20,-34.8,17,-29,15,-22,12,-17,11,-13,13,-9,12,-6,9,-1,9,3,6,4,3,6.5,-2,5,-8,4.5,-12,7.5,
   -16,12,-17,14.5,-17,21,-14,26,-10,30],
  [43,-12,48,-13,50,-17,50,-24,46,-25.5,44,-21,43,-16],
  [-9,38,-9,43,-1,46,-2,48.5,3,51,8,54,10,57.5,13,55,19,55,22,60,25,65,21,66,25,70,31,70,
   40,66,50,68,60,71,70,72,80,73,90,75,100,76,110,74,120,73,130,72,140,72,150,70,160,69,
   170,68,179,66,179,62,172,60,163,58,160,54,155,50,143,45,140,42,133,42,128,40,122,38,
   120,35,122,30,118,24,110,21,107,12,105,9,100,6,98,12,94,16,90,22,87,21,80,15,77,8,
   73,15,72,20,70,23,65,25,60,25,57,26,56,22,52,18,48,15,43,12.5,41,17,38,22,35,28,34,31,
   36,36,32,36,30,36,27,37,26,40,23,40,23,37,21,38,19,40,19,42,14,45.5,16,42,18,40,16,38,
   12,42,10,44,7,44,4,43,3,42,-1,37,-6,36],
  [-5,50,-6,53,-5,55,-3,58.5,-2,57.5,0,53.5,1,51.5,-4,50],
  [-10.5,51.7,-10,55,-6,55.3,-6,52],
  [-24,65,-22,66.5,-14,66.3,-13.5,64.5,-18,63.4,-22,63.9],
  [130,31.5,135,34,140,35,142,39,145,43.5,142,45,140,39,137,36,133,35,129,33],
  [80,9.8,81.9,7.5,81,6,79.7,8],
  [95,5.5,99,3,104,-2,106,-6,103,-6,99,-1,96,2,94,4.5],
  [105,-6,111,-7,114,-8,114,-8.8,108,-8,105,-7.2],
  [109,2,113,4.5,117,5,119,3,118,-2,114,-3.5,110,-3,109,0],
  [119,1,121,1.5,125,1.5,125,-2,122,-3,121,-5,119,-5,120,-2],
  [131,-1,136,-2.5,141,-3,146,-6,150,-9,146,-9,141,-8,137,-8,133,-4],
  [120,18,122,17,124,13,126,9,126,6,123,6,121,12,119,15],
  [-85,22,-80,23,-75,20.5,-78,20,-84,21.5],
  [-74,19.5,-69,19.5,-68,18.5,-73,18],
  [113,-22,113,-26,115,-34,118,-35,123,-34,129,-32,134,-33,137,-35,140,-38,145,-38.5,
   150,-37.5,153,-32,153,-27,149,-21,146,-19,142,-11,137,-12,132,-11,129,-15,125,-14,122,-18,117,-21],
  [145,-41,148,-41,148,-43.5,145,-43.5],
  [172,-34.5,175,-37,178,-38,176,-41,172,-41,170,-44,167,-46.5,166,-45,170,-42,172,-38],
];
const WATER: readonly (readonly number[])[] = [
  [-95,58.5,-88,55.5,-80,55.5,-77,60,-79,64,-86,66.5,-95,64],
  [-92,48,-87,47,-82,45.5,-77,44,-79,43,-85,42,-90,44.5],
  [28,41,34,42,41,41,41,45,37,47,31,46.5,28,43],
  [47,37.5,53,38,53.5,45,51,47,47.5,45,48.5,41],
];
interface MapNode { readonly id: string; readonly name: string; readonly note: string; readonly lon: number; readonly lat: number; readonly hub?: boolean; readonly main?: boolean; }
const NODES: readonly MapNode[] = [
  { id: "kul", name: "Kuala Lumpur", note: "Home tenant · 214 partner accounts", lon: 101.7, lat: 3.1, hub: true, main: true },
  { id: "sin", name: "Singapore", note: "Hub · 96 published profiles", lon: 103.8, lat: 1.3, hub: true },
  { id: "tyo", name: "Tokyo", note: "Hub · 74 published profiles", lon: 139.7, lat: 35.7, hub: true },
  { id: "sha", name: "Shanghai", note: "Linked · 38 partner accounts", lon: 121.5, lat: 31.2 },
  { id: "syd", name: "Sydney", note: "Linked · 21 partner accounts", lon: 151.2, lat: -33.9 },
  { id: "bom", name: "Mumbai", note: "Linked · 43 partner accounts", lon: 72.9, lat: 19.1 },
  { id: "dxb", name: "Dubai", note: "Hub · 57 published profiles", lon: 55.3, lat: 25.2, hub: true },
  { id: "lon", name: "London", note: "Hub · 88 published profiles", lon: -0.1, lat: 51.5, hub: true },
  { id: "fra", name: "Frankfurt", note: "Linked · 34 partner accounts", lon: 8.7, lat: 50.1 },
  { id: "jnb", name: "Johannesburg", note: "Linked · 12 partner accounts", lon: 28.0, lat: -26.2 },
  { id: "nyc", name: "New York", note: "Hub · 102 published profiles", lon: -74.0, lat: 40.7, hub: true },
  { id: "tor", name: "Toronto", note: "Linked · 19 partner accounts", lon: -79.4, lat: 43.7 },
  { id: "sfo", name: "San Francisco", note: "Hub · 61 published profiles", lon: -122.4, lat: 37.8, hub: true },
  { id: "gru", name: "São Paulo", note: "Linked · 16 partner accounts", lon: -46.6, lat: -23.5 },
];
const LINKS: readonly (readonly [string, string])[] = [
  ["kul", "sin"], ["kul", "tyo"], ["kul", "bom"], ["kul", "syd"], ["kul", "dxb"],
  ["sin", "sha"], ["sin", "syd"], ["sha", "tyo"],
  ["dxb", "bom"], ["dxb", "fra"], ["fra", "lon"], ["lon", "nyc"], ["lon", "jnb"],
  ["nyc", "sfo"], ["nyc", "tor"], ["nyc", "gru"], ["tyo", "sfo"],
];
const LAT_TOP = 79, LAT_BOT = -57, LAT_SPAN = LAT_TOP - LAT_BOT;
function inRing(lon: number, lat: number, r: readonly number[]): boolean {
  let inside = false;
  const n = r.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = r[i * 2], yi = r[i * 2 + 1], xj = r[j * 2], yj = r[j * 2 + 1];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function isLand(lon: number, lat: number): boolean {
  for (const w of WATER) if (inRing(lon, lat, w)) return false;
  for (const l of LAND) if (inRing(lon, lat, l)) return true;
  return false;
}
function vec(lon: number, lat: number) {
  const a = (lon * Math.PI) / 180, b = (lat * Math.PI) / 180, c = Math.cos(b);
  return [c * Math.cos(a), c * Math.sin(a), Math.sin(b)] as const;
}
function ll(v: readonly number[]) {
  return [Math.atan2(v[1], v[0]) * (180 / Math.PI), Math.asin(Math.max(-1, Math.min(1, v[2]))) * (180 / Math.PI)] as const;
}

function MapBody() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const tipRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const cvs = canvasRef.current, tip = tipRef.current;
    if (!cvs || !tip) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let W = 0, H = 0, dpr = 1, mapW = 0, mapH = 0, offX = 0, offY = 0;
    let dots: HTMLCanvasElement | null = null;
    let paths: { pts: (readonly [number, number] | null)[]; phase: number; speed: number }[] = [];
    let pts: { n: MapNode; x: number; y: number }[] = [];
    let hover: { n: MapNode; x: number; y: number } | null = null;
    let raf = 0;

    function px(lon: number, lat: number): [number, number] {
      return [offX + ((lon + 180) / 360) * mapW, offY + ((LAT_TOP - lat) / LAT_SPAN) * mapH];
    }
    function arcPoints(a: MapNode, b: MapNode) {
      const va = vec(a.lon, a.lat), vb = vec(b.lon, b.lat);
      const d = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
      const om = Math.acos(d), so = Math.sin(om), steps = 56;
      const out: (readonly [number, number] | null)[] = [];
      let prevX: number | null = null;
      const p0 = px(a.lon, a.lat), p1 = px(b.lon, b.lat);
      const lift = Math.min(0.26 * Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), mapH * 0.3);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        let v: readonly number[];
        if (so < 1e-6) v = va;
        else {
          const s1 = Math.sin((1 - t) * om) / so, s2 = Math.sin(t * om) / so;
          v = [va[0] * s1 + vb[0] * s2, va[1] * s1 + vb[1] * s2, va[2] * s1 + vb[2] * s2];
        }
        const g = ll(v), p = px(g[0], g[1]);
        if (prevX !== null && Math.abs(p[0] - prevX) > mapW * 0.5) out.push(null);
        prevX = p[0];
        out.push([p[0], p[1] - Math.sin(Math.PI * t) * lift]);
      }
      return out;
    }
    function buildDots() {
      const step = Math.max(4.2, Math.min(8, mapW / 170));
      const cols = Math.round(mapW / step), rows = Math.round(mapH / step);
      const r = Math.max(0.8, step * 0.17);
      const oc = document.createElement("canvas");
      oc.width = Math.round(W * dpr);
      oc.height = Math.round(H * dpr);
      const g = oc.getContext("2d")!;
      g.scale(dpr, dpr);
      for (let y = 0; y <= rows; y++) {
        const lat = LAT_TOP - (y / rows) * LAT_SPAN;
        for (let x = 0; x <= cols; x++) {
          const lon = -180 + (x / cols) * 360;
          if (!isLand(lon, lat)) continue;
          const p = px(lon, lat);
          if (p[0] < -10 || p[0] > W + 10 || p[1] < -10 || p[1] > H + 10) continue;
          const a = 0.2 + (1 - Math.min(1, Math.abs(lat) / 95)) * 0.2;
          g.beginPath();
          g.arc(p[0], p[1], r, 0, 6.2832);
          g.fillStyle = `rgba(150,182,226,${a.toFixed(3)})`;
          g.fill();
        }
      }
      dots = oc;
    }
    function layout() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cvs!.clientWidth;
      H = cvs!.clientHeight;
      if (!W || !H) return;
      cvs!.width = Math.round(W * dpr);
      cvs!.height = Math.round(H * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      mapW = W * 1.1;
      mapH = (mapW * LAT_SPAN) / 360;
      if (mapH > H * 0.86) { mapH = H * 0.86; mapW = (mapH * 360) / LAT_SPAN; }
      offX = (W - mapW) / 2;
      offY = (H - mapH) / 2 - 6;
      buildDots();
      const byId: Record<string, MapNode> = {};
      NODES.forEach((n) => { byId[n.id] = n; });
      pts = NODES.map((n) => { const p = px(n.lon, n.lat); return { n, x: p[0], y: p[1] }; });
      paths = LINKS.map(([a, b], i) => ({ pts: arcPoints(byId[a], byId[b]), phase: (i * 0.37) % 1, speed: 0.055 + ((i * 7) % 5) * 0.011 }));
    }
    function strokePath(pl: (readonly [number, number] | null)[], from: number, to: number, style: string, width: number) {
      ctx!.beginPath();
      let started = false;
      for (let i = from; i <= to && i < pl.length; i++) {
        const p = pl[i];
        if (!p) { started = false; continue; }
        if (!started) { ctx!.moveTo(p[0], p[1]); started = true; } else ctx!.lineTo(p[0], p[1]);
      }
      ctx!.strokeStyle = style;
      ctx!.lineWidth = width;
      ctx!.lineCap = "round";
      ctx!.stroke();
    }
    function frame(ts: number) {
      if (cvs && document.body.contains(cvs) && W && H) {
        ctx!.clearRect(0, 0, W, H);
        if (dots) ctx!.drawImage(dots, 0, 0, W, H);
        const t = (ts || 0) / 1000;
        for (const pa of paths) {
          const pl = pa.pts, n = pl.length;
          strokePath(pl, 0, n - 1, "rgba(158,192,236,0.17)", 0.9);
          if (!reduced) {
            const prog = (t * pa.speed + pa.phase) % 1;
            const head = Math.floor(prog * (n - 1));
            strokePath(pl, Math.max(0, head - Math.round(n * 0.17)), head, "rgba(206,229,255,0.72)", 1.2);
            const hp = pl[head];
            if (hp) {
              const gr = ctx!.createRadialGradient(hp[0], hp[1], 0, hp[0], hp[1], 8);
              gr.addColorStop(0, "rgba(226,240,255,0.85)");
              gr.addColorStop(1, "rgba(226,240,255,0)");
              ctx!.fillStyle = gr;
              ctx!.beginPath();
              ctx!.arc(hp[0], hp[1], 8, 0, 6.2832);
              ctx!.fill();
            }
          }
        }
        for (const d of pts) {
          const nd = d.n, on = hover === d;
          const rr = nd.main ? 4.8 : nd.hub ? 3.9 : 3.2;
          if (nd.hub || on) {
            const g2 = ctx!.createRadialGradient(d.x, d.y, 0, d.x, d.y, rr * (on ? 6 : 4.6));
            g2.addColorStop(0, `rgba(180,214,255,${on ? 0.55 : 0.32})`);
            g2.addColorStop(1, "rgba(180,214,255,0)");
            ctx!.fillStyle = g2;
            ctx!.beginPath();
            ctx!.arc(d.x, d.y, rr * (on ? 6 : 4.6), 0, 6.2832);
            ctx!.fill();
          }
          ctx!.beginPath();
          ctx!.arc(d.x, d.y, rr, 0, 6.2832);
          if (nd.hub) { ctx!.fillStyle = "rgba(232,242,255,0.96)"; ctx!.fill(); }
          else { ctx!.strokeStyle = "rgba(206,228,255,0.82)"; ctx!.lineWidth = 1.3; ctx!.stroke(); }
        }
      }
      raf = requestAnimationFrame(frame);
    }
    function onMove(e: MouseEvent) {
      const r = cvs!.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      let found: { n: MapNode; x: number; y: number } | null = null;
      for (const p of pts) if (Math.hypot(p.x - mx, p.y - my) < 15) { found = p; break; }
      hover = found;
      if (found) {
        tip!.classList.add("on");
        tip!.style.left = `${found.x}px`;
        tip!.style.top = `${found.y}px`;
        const b = tip!.querySelector("b"), em = tip!.querySelector("em");
        if (b) b.textContent = found.n.name;
        if (em) em.textContent = found.n.note;
        cvs!.style.cursor = "pointer";
      } else {
        tip!.classList.remove("on");
        cvs!.style.cursor = "default";
      }
    }
    function onLeave() { hover = null; tip!.classList.remove("on"); }

    layout();
    raf = requestAnimationFrame(frame);
    cvs.addEventListener("mousemove", onMove);
    cvs.addEventListener("mouseleave", onLeave);
    let rt: ReturnType<typeof setTimeout>;
    const onResize = () => { clearTimeout(rt); rt = setTimeout(layout, 140); };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(rt);
      cvs.removeEventListener("mousemove", onMove);
      cvs.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <>
    <canvas ref={canvasRef} className="a-ws-map-canvas" aria-label="World map of linked partner accounts and published profile links" />
    <div className="a-ws-legend">
      <span><i className="a-ws-legend-hub" />Network hub</span>
      <span><i className="a-ws-legend-lnk" />Linked partner</span>
      <span><i className="a-ws-legend-arc" />Published profile link</span>
    </div>
    <div className="a-ws-tip" ref={tipRef}><b /><em /></div>
  </>;
}

/* ---------- Atlas assistant demo (decorative -- no real backend call) ---------- */
function AtlasBar({ acts, workspaceKey }: { readonly acts: readonly Act[]; readonly workspaceKey: string }) {
  const reduced = useReducedMotion();
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState<Act | null>(null);
  const [typed, setTyped] = React.useState("");
  const [settled, setSettled] = React.useState(false);
  const [confidenceWidth, setConfidenceWidth] = React.useState(0);
  const [done, setDone] = React.useState<string | null>(null);
  const [inputValue, setInputValue] = React.useState("");
  const typerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(() => { setOpen(false); setActive(null); }, [workspaceKey]);

  function run(act: Act) {
    if (typerRef.current) clearInterval(typerRef.current);
    setOpen(true);
    setActive(act);
    setDone(null);
    setSettled(false);
    setConfidenceWidth(0);
    setTyped("");
    if (reduced) { setTyped(act.say); setSettled(true); requestAnimationFrame(() => setConfidenceWidth(act.confidence)); return; }
    const words = act.say.split(" ");
    let i = 0;
    typerRef.current = setInterval(() => {
      i++;
      setTyped(words.slice(0, i).join(" "));
      if (i >= words.length) {
        if (typerRef.current) clearInterval(typerRef.current);
        setSettled(true);
        requestAnimationFrame(() => setConfidenceWidth(act.confidence));
      }
    }, 34);
  }

  function ask() {
    const q = inputValue.trim();
    if (!q) return;
    const hit = acts.find((a) => a.q.toLowerCase() === q.toLowerCase());
    setInputValue("");
    run(hit ?? { q, readonly: true, confidence: 72, say: "I can look into that across this workspace. Name a record to start from and I will pull it up with its history.", touch: [workspaceKey] });
  }

  return <div className="a-ws-atlas">
    {open && active ? <div className="a-ws-reply">
      <div className="a-ws-reply-head">
        <svg className="a-ws-spark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" /></svg>
        <b>Atlas</b>
        <span className="a-ws-mode">{active.readonly ? "Answers only" : "Acts with your approval"}</span>
        <button className="a-ws-dismiss" type="button" onClick={() => setOpen(false)}>Dismiss</button>
      </div>
      <p className="a-ws-say">{typed}{!settled ? <i className="a-ws-cur" /> : null}</p>
      {settled ? <>
        <div className="a-ws-touch">{active.touch.map((t) => <span key={t}>{t}</span>)}</div>
        <div className="a-ws-gov">
          {active.readonly
            ? <div><span>Effect</span><b>Reads only, nothing is written</b></div>
            : <><div><span>Policy</span><b>{active.policy}</b></div><div><span>Approval</span><b>{active.approver}</b></div></>}
          <div><span>Confidence</span><b>{(active.confidence / 100).toFixed(2)}</b><i className="a-ws-meter"><u style={{ width: `${confidenceWidth}%` }} /></i></div>
        </div>
        <div className="a-ws-run">
          {done ? <div className="a-ws-ok"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>{done}</div>
            : active.readonly
              ? <button className="a-ws-alt" type="button" onClick={() => setOpen(false)}>Open the records</button>
              : <>
                <button className="a-ws-go" type="button" onClick={() => setDone(active.done ?? "Done.")}>Approve and run</button>
                <button className="a-ws-alt" type="button" onClick={() => setOpen(false)}>Not now</button>
              </>}
        </div>
      </> : null}
    </div> : null}
    <div className="a-ws-bar">
      <AtlasAiSloganMark />
      <input className="a-ws-ask" type="text" placeholder="Try it — ask Atlas a question…" aria-label="Ask Atlas"
        value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ask(); }} />
      <button className="a-ws-send" type="button" aria-label="Send to Atlas" onClick={ask}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
      </button>
    </div>
    <div className="a-ws-sugg">{acts.map((a) => <button key={a.q} type="button" onClick={() => run(a)}>{a.q}</button>)}</div>
  </div>;
}

/* ---------- slogan lockups: vector text ported from brand-supplied SVGs.
   Fill overridden for the dark marketing panel (source files are tuned for
   light backgrounds); font falls back to the app sans-serif since the
   brand's display face isn't bundled in this repo. */
const SLOGAN_FONT = "'Conthrax-SemiBold','Conthrax',var(--a-font-sans)";

function SloganMark({ text }: { readonly text: string }) {
  return <svg viewBox="0 440 1300 70" className="a-ws-slogan-mark" role="img" aria-label={text}>
    <text x="4" y="495.28" fontFamily={SLOGAN_FONT} fontWeight={600} fontSize="50" fill="currentColor">{text}</text>
  </svg>;
}

function AtlasAiSloganMark() {
  return <svg viewBox="375 415 260 75" className="a-ws-atlas-slogan-mark" role="img" aria-label="atlasAI">
    <text x="390.45" y="471.23" fontFamily={SLOGAN_FONT} fontWeight={600} fontSize="50" fill="currentColor">atlasAI</text>
  </svg>;
}

/* Text sourced from plane-presentation.json -- the same descriptors already
   used for brand.description elsewhere on this page. */
const SLOGAN_BY_PLANE: Record<BrandPlane, () => React.JSX.Element> = {
  neon: () => <SloganMark text="Business Operating Platform" />,
  mesh: () => <SloganMark text="Business Collaboration Network" />,
  studio: () => <SloganMark text="Business Technology Platform" />,
};

export function WorkspaceShowcase({ plane }: { readonly plane: BrandPlane }) {
  const brand = getPlaneBrand(plane);
  const workspaces = WORKSPACES_BY_PLANE[plane];
  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const reduced = useReducedMotion();
  const active = workspaces[index];
  const railRefs = React.useRef<(HTMLSpanElement | null)[]>([]);

  const go = React.useCallback((i: number) => setIndex(((i % workspaces.length) + workspaces.length) % workspaces.length), [workspaces.length]);

  React.useEffect(() => {
    if (reduced) return;
    let raf = 0, t0 = 0, elapsed = 0;
    function tick(ts: number) {
      if (paused) { t0 = ts - elapsed; raf = requestAnimationFrame(tick); return; }
      if (!t0) t0 = ts;
      elapsed = ts - t0;
      const fill = railRefs.current[index];
      if (fill) fill.style.width = `${Math.min(100, (elapsed / ROTATE_MS) * 100)}%`;
      if (elapsed >= ROTATE_MS) { go(index + 1); return; }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [index, paused, reduced, go]);

  React.useEffect(() => {
    railRefs.current.forEach((el, i) => { if (el && i !== index) el.style.width = "0%"; });
  }, [index]);

  const PlaneSlogan = SLOGAN_BY_PLANE[plane];

  return <div className={`a-ws a-ws-${plane}`}>
    <div className="a-ws-center">
    <div className="a-ws-top">
      <section className="a-ws-panel" aria-live="polite">
        <div className="a-ws-panel-title"><PlaneSlogan /></div>
        <div className="a-ws-panel-head">
          {active.head.map(([label, value, live]) => <div key={label}><span>{label}</span><b className={live ? "a-ws-live" : undefined}>{value}</b></div>)}
          <span className="a-ws-tab-pill" key={active.tab}>{active.tab}</span>
        </div>
        <div className="a-ws-body">
          {active.kind === "ledger" && active.ledger ? <LedgerTape entries={active.ledger} /> : null}
          {active.kind === "chain" && active.chain ? <ChainBody steps={active.chain} key={active.tab} /> : null}
          {active.kind === "map" ? <MapBody key={active.tab} /> : null}
        </div>
        <div className="a-ws-panel-foot">
          <span className="a-ws-foot-k">{active.foot[0]}</span>
          <span className="a-ws-foot-vals"><span className="a-ws-foot-v">{active.foot[1]}</span><span className="a-ws-foot-balanced">{active.foot[2]}</span></span>
        </div>
      </section>
    </div>

    <div className="a-ws-rail" role="tablist" aria-label={`${brand.shortName} workspaces`}>
      {workspaces.map((w, i) => <button key={w.tab} type="button" role="tab" className="a-ws-indicator" aria-current={i === index} aria-label={w.tab}
        onClick={() => go(i)}>
        <span className="a-ws-indicator-fill" ref={(el) => { railRefs.current[i] = el; }} />
      </button>)}
    </div>

    <div className="a-ws-atlas-wrap" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <AtlasBar acts={active.acts} workspaceKey={active.tab} />
    </div>
    </div>
  </div>;
}
