/**
 * Seed-accurate demo data for the GL Workbench.
 *
 * Charts, accounts, companies, and assignments match:
 *   - 200_chart_catalog.sql         (7 charts)
 *   - 210_group_chart_accounts.sql  (group COA — all L2 headers, ~105 postings)
 *   - 211_framework_ifrs_accounts.sql (IFRS operating — all 36 L2 headers)
 *   - 201_company_chart_assignments.sql (17 companies, 35 assignments)
 *
 * Trial balances are mathematically balanced (Total DR = Total CR).
 */
import type {
  ChartOfAccount,
  GlAccountNode,
  LegalEntity,
  CompanyCode,
  PostingControl,
  CoaMapping,
} from "./types";

/* -- Helper ---------------------------------------------------------------- */
const n = (
  id: string, code: string, name: string,
  accountClass: GlAccountNode["accountClass"],
  nodeType: GlAccountNode["nodeType"],
  normalBalance: GlAccountNode["normalBalance"],
  level: number, subledgerType: string | null,
  closingDebit: number, closingCredit: number,
  children?: GlAccountNode[],
): GlAccountNode => ({
  id, code, name, accountClass, nodeType, normalBalance, level, subledgerType,
  closingDebit, closingCredit, children: children ?? null,
});

/* ===========================================================================
   CHARTS — 7 per 200_chart_catalog.sql §18.1
   =========================================================================== */
export const CHARTS: ChartOfAccount[] = [
  { id: "grp",   code: "COA-IFRS-GROUP", name: "IFRS Group Consolidation Chart", framework: "ifrs",      tier: "group",     country: null, accountCount: 140, version: 1, isLocked: true  },
  { id: "ifrs",  code: "COA-IFRS",       name: "IFRS Operating Chart",           framework: "ifrs",      tier: "operating", country: null, accountCount: 238, version: 3, isLocked: false },
  { id: "usg",   code: "COA-USGAAP",     name: "US GAAP Operating Chart",        framework: "us_gaap",   tier: "operating", country: "US", accountCount: 220, version: 2, isLocked: false },
  { id: "hgb",   code: "COA-HGB",        name: "HGB Operating Chart",            framework: "local_gaap", tier: "local",    country: "DE", accountCount: 85,  version: 1, isLocked: false },
  { id: "indas", code: "COA-INDAS",      name: "Ind AS Operating Chart",         framework: "local_gaap", tier: "local",    country: "IN", accountCount: 210, version: 1, isLocked: false },
  { id: "jgaap", code: "COA-JGAAP",      name: "J-GAAP Operating Chart",         framework: "local_gaap", tier: "local",    country: "JP", accountCount: 195, version: 1, isLocked: false },
  { id: "socpa", code: "COA-SOCPA",       name: "SOCPA Operating Chart",          framework: "local_gaap", tier: "local",    country: "SA", accountCount: 180, version: 1, isLocked: false },
];

/* ===========================================================================
   GROUP CHART — per 210_group_chart_accounts.sql
   5 L1 roots · 30 L2 headers · ~105 L3 postings · BALANCED
   Total DR = 170,662,000 = Total CR
   =========================================================================== */
export const GROUP_TREE: GlAccountNode[] = [
  n("ga","GRP-A","Assets","asset","header","debit",1,null,0,0,[
    n("ga-cash","GRP-A-CASH","Cash & Bank","asset","header","debit",2,null,0,0,[
      n("ga-c1","GRP-A-CASH-OPER","Operating Cash","asset","posting","debit",3,null,2450000,0),
      n("ga-c2","GRP-A-CASH-BANK","Bank Accounts","asset","posting","debit",3,null,8920000,0),
      n("ga-c3","GRP-A-CASH-PETTY","Petty Cash","asset","posting","debit",3,null,15000,0),
    ]),
    n("ga-ar","GRP-A-AR","Trade Receivables","asset","header","debit",2,null,0,0,[
      n("ga-ar1","GRP-A-AR-TRADE","Trade Receivables Control","asset","posting","debit",3,"ar",4380000,0),
      n("ga-ar2","GRP-A-AR-ALLOW","Allowance for Doubtful Debts","contra_asset","posting","credit",3,null,0,218000),
    ]),
    n("ga-oar","GRP-A-OAR","Other Receivables","asset","header","debit",2,null,0,0,[
      n("ga-oar1","GRP-A-OAR-ADVANCE","Advances to Suppliers","asset","posting","debit",3,null,820000,0),
      n("ga-oar2","GRP-A-OAR-PREPAY","Prepaid Expenses","asset","posting","debit",3,null,640000,0),
      n("ga-oar3","GRP-A-OAR-DEPOSIT","Deposits & Guarantees","asset","posting","debit",3,null,350000,0),
    ]),
    n("ga-inv","GRP-A-INV","Inventory","asset","header","debit",2,null,0,0,[
      n("ga-i1","GRP-A-INV-RAW","Raw Materials Inventory","asset","posting","debit",3,"inventory",1820000,0),
      n("ga-i2","GRP-A-INV-WIP","Work in Progress","asset","posting","debit",3,"wip",940000,0),
      n("ga-i3","GRP-A-INV-FG","Finished Goods Inventory","asset","posting","debit",3,"inventory",2650000,0),
      n("ga-i4","GRP-A-INV-TRADE","Trading Goods Inventory","asset","posting","debit",3,"inventory",480000,0),
    ]),
    n("ga-fa","GRP-A-FA","Fixed Assets","asset","header","debit",2,null,0,0,[
      n("ga-fa1","GRP-A-FA-LAND","Land","asset","posting","debit",3,"asset",12500000,0),
      n("ga-fa2","GRP-A-FA-BLDG","Buildings","asset","posting","debit",3,"asset",28400000,0),
      n("ga-fa3","GRP-A-FA-PLANT","Plant & Machinery","asset","posting","debit",3,"asset",8200000,0),
      n("ga-fa4","GRP-A-FA-VEH","Vehicles","asset","posting","debit",3,"asset",3100000,0),
      n("ga-fa5","GRP-A-FA-IT","IT Equipment","asset","posting","debit",3,"asset",1800000,0),
      n("ga-fa6","GRP-A-FA-FURN","Furniture & Fixtures","asset","posting","debit",3,"asset",950000,0),
      n("ga-fa7","GRP-A-FA-CWIP","Capital Work in Progress","asset","posting","debit",3,null,2400000,0),
    ]),
    n("ga-dep","GRP-A-DEP","Accumulated Depreciation","asset","header","debit",2,null,0,0,[
      n("ga-d1","GRP-A-DEP-BLDG","Accum Depr — Buildings","contra_asset","posting","credit",3,null,0,5680000),
      n("ga-d2","GRP-A-DEP-PLANT","Accum Depr — Plant & Machinery","contra_asset","posting","credit",3,null,0,2460000),
      n("ga-d3","GRP-A-DEP-VEH","Accum Depr — Vehicles","contra_asset","posting","credit",3,null,0,1240000),
      n("ga-d4","GRP-A-DEP-IT","Accum Depr — IT Equipment","contra_asset","posting","credit",3,null,0,720000),
      n("ga-d5","GRP-A-DEP-FURN","Accum Depr — Furniture","contra_asset","posting","credit",3,null,0,285000),
    ]),
    n("ga-ia","GRP-A-IA","Intangible Assets","asset","header","debit",2,null,0,0,[
      n("ga-ia1","GRP-A-IA-GW","Goodwill","asset","posting","debit",3,null,4200000,0),
      n("ga-ia2","GRP-A-IA-SW","Software & Licences","asset","posting","debit",3,null,2800000,0),
      n("ga-ia3","GRP-A-IA-AMORT","Accum Amortisation","contra_asset","posting","credit",3,null,0,1960000),
    ]),
    n("ga-rou","GRP-A-ROU","Right-of-Use Assets","asset","header","debit",2,null,0,0,[
      n("ga-rou1","GRP-A-ROU-PROP","Right-of-Use — Property","asset","posting","debit",3,null,3600000,0),
      n("ga-rou2","GRP-A-ROU-EQUIP","Right-of-Use — Equipment","asset","posting","debit",3,null,1200000,0),
      n("ga-rou3","GRP-A-ROU-AMORT","Accum Depr — ROU","contra_asset","posting","credit",3,null,0,1440000),
    ]),
    n("ga-icr","GRP-A-ICR","Intercompany Receivables","asset","header","debit",2,null,0,0,[
      n("ga-icr1","GRP-A-ICR-TRADE","IC Receivables — Trade","asset","posting","debit",3,null,1680000,0),
      n("ga-icr2","GRP-A-ICR-LOAN","IC Receivables — Loans","asset","posting","debit",3,null,2500000,0),
    ]),
  ]),

  n("gl","GRP-L","Liabilities","liability","header","credit",1,null,0,0,[
    n("gl-ap","GRP-L-AP","Trade Payables","liability","header","credit",2,null,0,0,[
      n("gl-a1","GRP-L-AP-TRADE","Trade Payables Control","liability","posting","credit",3,"ap",0,5640000),
      n("gl-a2","GRP-L-AP-RETENTION","Retention Payable","liability","posting","credit",3,null,0,420000),
    ]),
    n("gl-accr","GRP-L-ACCR","Accruals & Provisions","liability","header","credit",2,null,0,0,[
      n("gl-ac1","GRP-L-ACCR-GEN","General Accruals","liability","posting","credit",3,null,0,890000),
      n("gl-ac2","GRP-L-ACCR-PROV","Provisions","liability","posting","credit",3,null,0,640000),
    ]),
    n("gl-tax","GRP-L-TAX","Tax Payables","liability","header","credit",2,null,0,0,[
      n("gl-tx1","GRP-L-TAX-CIT","Corporate Income Tax Payable","liability","posting","credit",3,null,0,1480000),
      n("gl-tx2","GRP-L-TAX-VAT-OUT","VAT/GST Output","liability","posting","credit",3,null,0,920000),
      n("gl-tx3","GRP-L-TAX-VAT-IN","VAT/GST Input Receivable","contra_liability","posting","debit",3,null,580000,0),
      n("gl-tx4","GRP-L-TAX-WHT","Withholding Tax Payable","liability","posting","credit",3,null,0,340000),
    ]),
    n("gl-emp","GRP-L-EMP","Employee Liabilities","liability","header","credit",2,null,0,0,[
      n("gl-em1","GRP-L-EMP-SAL","Salaries Payable","liability","posting","credit",3,null,0,1200000),
      n("gl-em2","GRP-L-EMP-BEN","Employee Benefits Payable","liability","posting","credit",3,null,0,480000),
      n("gl-em3","GRP-L-EMP-LEAVE","Leave Provision","liability","posting","credit",3,null,0,380000),
      n("gl-em4","GRP-L-EMP-EOS","End of Service / Gratuity","liability","posting","credit",3,null,0,1640000),
    ]),
    n("gl-lease","GRP-L-LEASE","Lease Liabilities","liability","header","credit",2,null,0,0,[
      n("gl-le1","GRP-L-LEASE-CUR","Lease Liabilities — Current","liability","posting","credit",3,null,0,720000),
      n("gl-le2","GRP-L-LEASE-NCR","Lease Liabilities — Non-Current","liability","posting","credit",3,null,0,2400000),
    ]),
    n("gl-icp","GRP-L-ICP","Intercompany Payables","liability","header","credit",2,null,0,0,[
      n("gl-ic1","GRP-L-ICP-TRADE","IC Payables — Trade","liability","posting","credit",3,null,0,1680000),
      n("gl-ic2","GRP-L-ICP-LOAN","IC Payables — Loans","liability","posting","credit",3,null,0,2500000),
    ]),
    n("gl-defrev","GRP-L-DEFREV","Deferred Revenue","liability","header","credit",2,null,0,0,[
      n("gl-dr1","GRP-L-DEFREV-SVC","Deferred Revenue — Services","liability","posting","credit",3,null,0,540000),
      n("gl-dr2","GRP-L-DEFREV-PROJ","Deferred Revenue — Projects","liability","posting","credit",3,null,0,320000),
    ]),
    n("gl-othl","GRP-L-OTHL","Other Liabilities","liability","header","credit",2,null,0,0,[
      n("gl-ot1","GRP-L-OTHL-OTHER","Other Current Liabilities","liability","posting","credit",3,null,0,480000),
    ]),
  ]),

  n("gq","GRP-Q","Equity","equity","header","credit",1,null,0,0,[
    n("gq-cap","GRP-Q-CAP","Share Capital","equity","header","credit",2,null,0,0,[
      n("gq-c1","GRP-Q-CAP-ISSUED","Issued Share Capital","equity","posting","credit",3,null,0,10000000),
      n("gq-c2","GRP-Q-CAP-PREM","Share Premium","equity","posting","credit",3,null,0,3200000),
    ]),
    n("gq-res","GRP-Q-RES","Reserves","equity","header","credit",2,null,0,0,[
      n("gq-r1","GRP-Q-RES-STAT","Statutory Reserve","equity","posting","credit",3,null,0,2400000),
      n("gq-r2","GRP-Q-RES-GEN","General Reserve","equity","posting","credit",3,null,0,1800000),
      n("gq-r3","GRP-Q-RES-TRANS","Translation Reserve","equity","posting","credit",3,null,0,420000),
      n("gq-r4","GRP-Q-RES-HEDGE","Hedging Reserve","equity","posting","credit",3,null,0,180000),
    ]),
    n("gq-re","GRP-Q-RE","Retained Earnings","equity","header","credit",2,null,0,0,[
      n("gq-re1","GRP-Q-RE-OPENING","Retained Earnings — Opening","equity","posting","credit",3,null,0,29606000),
      n("gq-re2","GRP-Q-RE-CY","Current Year P&L","equity","posting","credit",3,null,0,7148000),
      n("gq-re3","GRP-Q-RE-DIV","Dividends Declared","contra_equity","posting","debit",3,null,1200000,0),
    ]),
  ]),

  n("gr","GRP-R","Revenue","income","header","credit",1,null,0,0,[
    n("gr-sales","GRP-R-SALES","Sales Revenue","income","header","credit",2,null,0,0,[
      n("gr-s1","GRP-R-SALES-GOODS","Revenue — Goods","income","posting","credit",3,null,0,48000000),
      n("gr-s2","GRP-R-SALES-SVC","Revenue — Services","income","posting","credit",3,null,0,22000000),
      n("gr-s3","GRP-R-SALES-PROJ","Revenue — Projects","income","posting","credit",3,null,0,6400000),
    ]),
    n("gr-ooi","GRP-R-OOI","Other Operating Income","income","header","credit",2,null,0,0,[
      n("gr-o1","GRP-R-OOI-RENTAL","Rental Income","income","posting","credit",3,null,0,480000),
      n("gr-o2","GRP-R-OOI-GAIN","Gain on Disposal","income","posting","credit",3,null,0,320000),
      n("gr-o3","GRP-R-OOI-MISC","Miscellaneous Income","income","posting","credit",3,null,0,140000),
    ]),
    n("gr-fin","GRP-R-FIN","Finance Income","income","header","credit",2,null,0,0,[
      n("gr-f1","GRP-R-FIN-INT","Interest Income","income","posting","credit",3,null,0,425000),
      n("gr-f2","GRP-R-FIN-FX","Foreign Exchange Gain","income","posting","credit",3,null,0,110000),
    ]),
    n("gr-icr","GRP-R-ICR","Intercompany Revenue","income","header","credit",2,null,0,0,[
      n("gr-ic1","GRP-R-ICR-MGMT","IC Management Fee Income","income","posting","credit",3,null,0,820000),
      n("gr-ic2","GRP-R-ICR-SVCS","IC Service Revenue","income","posting","credit",3,null,0,540000),
    ]),
  ]),

  n("ge","GRP-E","Expenses","expense","header","debit",1,null,0,0,[
    n("ge-cogs","GRP-E-COGS","Cost of Sales","expense","header","debit",2,null,0,0,[
      n("ge-cg1","GRP-E-COGS-MAT","Materials Consumed","expense","posting","debit",3,null,18400000,0),
      n("ge-cg2","GRP-E-COGS-LABOUR","Direct Labour","expense","posting","debit",3,null,8900000,0),
      n("ge-cg3","GRP-E-COGS-OH","Production Overhead","expense","posting","debit",3,null,3200000,0),
      n("ge-cg4","GRP-E-COGS-SUB","Subcontracting","expense","posting","debit",3,null,1400000,0),
      n("ge-cg5","GRP-E-COGS-FREIGHT","Freight & Distribution","expense","posting","debit",3,null,980000,0),
    ]),
    n("ge-sga","GRP-E-SGA","Selling, General & Admin","expense","header","debit",2,null,0,0,[
      n("ge-sg1","GRP-E-SGA-OFFICE","Office & Admin","expense","posting","debit",3,null,2100000,0),
      n("ge-sg2","GRP-E-SGA-MKTG","Marketing & Advertising","expense","posting","debit",3,null,3400000,0),
      n("ge-sg3","GRP-E-SGA-TRAVEL","Travel & Entertainment","expense","posting","debit",3,null,680000,0),
      n("ge-sg4","GRP-E-SGA-PROF","Professional Fees","expense","posting","debit",3,null,1200000,0),
      n("ge-sg5","GRP-E-SGA-IT","IT & Communications","expense","posting","debit",3,null,1800000,0),
      n("ge-sg6","GRP-E-SGA-INS","Insurance","expense","posting","debit",3,null,420000,0),
      n("ge-sg7","GRP-E-SGA-RENT","Rent & Occupancy","expense","posting","debit",3,null,1560000,0),
      n("ge-sg8","GRP-E-SGA-UTIL","Utilities","expense","posting","debit",3,null,380000,0),
      n("ge-sg9","GRP-E-SGA-REPAIR","Repairs & Maintenance","expense","posting","debit",3,null,460000,0),
    ]),
    n("ge-hr","GRP-E-HR","HR & Payroll","expense","header","debit",2,null,0,0,[
      n("ge-h1","GRP-E-HR-SAL","Salaries & Wages","expense","posting","debit",3,null,12600000,0),
      n("ge-h2","GRP-E-HR-BEN","Employee Benefits","expense","posting","debit",3,null,2800000,0),
      n("ge-h3","GRP-E-HR-TRAIN","Training & Development","expense","posting","debit",3,null,340000,0),
      n("ge-h4","GRP-E-HR-RECRUIT","Recruitment","expense","posting","debit",3,null,180000,0),
    ]),
    n("ge-da","GRP-E-DA","Depreciation & Amortisation","expense","header","debit",2,null,0,0,[
      n("ge-da1","GRP-E-DA-BLDG","Depreciation — Buildings","expense","posting","debit",3,null,1420000,0),
      n("ge-da2","GRP-E-DA-PLANT","Depreciation — Plant","expense","posting","debit",3,null,820000,0),
      n("ge-da3","GRP-E-DA-VEH","Depreciation — Vehicles","expense","posting","debit",3,null,620000,0),
      n("ge-da4","GRP-E-DA-IT","Depreciation — IT","expense","posting","debit",3,null,360000,0),
      n("ge-da5","GRP-E-DA-ROU","Depreciation — ROU Assets","expense","posting","debit",3,null,720000,0),
      n("ge-da6","GRP-E-DA-AMORT","Amortisation — Intangibles","expense","posting","debit",3,null,560000,0),
    ]),
    n("ge-fin","GRP-E-FIN","Finance Costs","expense","header","debit",2,null,0,0,[
      n("ge-fi1","GRP-E-FIN-INT","Interest Expense","expense","posting","debit",3,null,920000,0),
      n("ge-fi2","GRP-E-FIN-LEASE","Lease Interest (IFRS 16)","expense","posting","debit",3,null,240000,0),
      n("ge-fi3","GRP-E-FIN-FX","Foreign Exchange Loss","expense","posting","debit",3,null,180000,0),
      n("ge-fi4","GRP-E-FIN-BANK","Bank Charges","expense","posting","debit",3,null,145000,0),
    ]),
    n("ge-tax","GRP-E-TAX","Tax Expense","expense","header","debit",2,null,0,0,[
      n("ge-tx1","GRP-E-TAX-CIT","Income Tax Expense","expense","posting","debit",3,null,4200000,0),
      n("ge-tx2","GRP-E-TAX-DT","Deferred Tax Expense","expense","posting","debit",3,null,32000,0),
    ]),
    n("ge-ice","GRP-E-ICE","Intercompany Expense","expense","header","debit",2,null,0,0,[
      n("ge-ie1","GRP-E-ICE-MGMT","IC Management Fee Expense","expense","posting","debit",3,null,480000,0),
      n("ge-ie2","GRP-E-ICE-SVCS","IC Service Expense","expense","posting","debit",3,null,320000,0),
    ]),
    n("ge-other","GRP-E-OTHER","Other Expenses","expense","header","debit",2,null,0,0,[
      n("ge-oe1","GRP-E-OTHER-LOSS","Loss on Disposal","expense","posting","debit",3,null,85000,0),
      n("ge-oe2","GRP-E-OTHER-IMPAIR","Impairment Loss","expense","posting","debit",3,null,120000,0),
      n("ge-oe3","GRP-E-OTHER-MISC","Miscellaneous Expense","expense","posting","debit",3,null,65000,0),
    ]),
  ]),
];

/* ===========================================================================
   HGB LOCAL — German SKR-style chart (proper UTF-8)
   Balanced: Total DR = 16,955,000 = Total CR
   =========================================================================== */
export const HGB_TREE: GlAccountNode[] = [
  n("ha","HGB-A","Aktiva","asset","header","debit",1,null,0,0,[
    n("ha-bank","HGB-A-BANK","Bankguthaben","asset","header","debit",2,null,0,0,[
      n("ha-b1","HGB-1200","Geschäftskonto","asset","posting","debit",3,null,980000,0),
      n("ha-b2","HGB-1210","Fremdwährungskonto USD","asset","posting","debit",3,null,420000,0),
      n("ha-b3","HGB-1000","Kasse","asset","posting","debit",3,null,5000,0),
    ]),
    n("ha-ford","HGB-A-FORD","Forderungen","asset","header","debit",2,null,0,0,[
      n("ha-f1","HGB-1400","Forderungen aus Lieferungen und Leistungen","asset","posting","debit",3,"ar",680000,0),
      n("ha-f2","HGB-1499","Einzelwertberichtigung","contra_asset","posting","credit",3,null,0,34000),
    ]),
    n("ha-sav","HGB-A-SAV","Sachanlagen","asset","header","debit",2,null,0,0,[
      n("ha-s1","HGB-0200","Grundstücke","asset","posting","debit",3,"asset",2400000,0),
      n("ha-s2","HGB-0300","Gebäude","asset","posting","debit",3,"asset",4800000,0),
      n("ha-s3","HGB-0400","Technische Anlagen und Maschinen","asset","posting","debit",3,"asset",1600000,0),
      n("ha-s4","HGB-0090","Kumulierte Abschreibungen","contra_asset","posting","credit",3,null,0,1420000),
    ]),
  ]),
  n("hl","HGB-P","Passiva","liability","header","credit",1,null,0,0,[
    n("hl-verb","HGB-P-VERB","Verbindlichkeiten","liability","header","credit",2,null,0,0,[
      n("hl-v1","HGB-1600","Verbindlichkeiten aus Lieferungen und Leistungen","liability","posting","credit",3,"ap",0,820000),
      n("hl-v2","HGB-1700","Sonstige Verbindlichkeiten","liability","posting","credit",3,null,0,310000),
    ]),
    n("hl-dar","HGB-P-DAR","Darlehen","liability","header","credit",2,null,0,0,[
      n("hl-d1","HGB-3100","Bankdarlehen langfristig","liability","posting","credit",3,null,0,2800000),
    ]),
  ]),
  n("hq","HGB-EK","Eigenkapital","equity","header","credit",1,null,0,0,[
    n("hq-1","HGB-2900","Gezeichnetes Kapital","equity","posting","credit",2,null,0,1500000),
    n("hq-2","HGB-2970","Gewinnvortrag","equity","posting","credit",2,null,0,4001000),
  ]),
  n("hr","HGB-E","Erträge","income","header","credit",1,null,0,0,[
    n("hr-1","HGB-4000","Umsatzerlöse Inland","income","posting","credit",2,null,0,4800000),
    n("hr-2","HGB-4100","Umsatzerlöse Ausland","income","posting","credit",2,null,0,1200000),
    n("hr-3","HGB-4900","Sonstige betriebliche Erträge","income","posting","credit",2,null,0,70000),
  ]),
  n("he","HGB-W","Aufwendungen","expense","header","debit",1,null,0,0,[
    n("he-mat","HGB-W-MAT","Materialaufwand","expense","header","debit",2,null,0,0,[
      n("he-m1","HGB-5000","Roh-, Hilfs- und Betriebsstoffe","expense","posting","debit",3,null,2400000,0),
      n("he-m2","HGB-5100","Bezogene Leistungen","expense","posting","debit",3,null,600000,0),
    ]),
    n("he-pers","HGB-W-PERS","Personalaufwand","expense","header","debit",2,null,0,0,[
      n("he-p1","HGB-6000","Löhne und Gehälter","expense","posting","debit",3,null,1800000,0),
      n("he-p2","HGB-6100","Soziale Abgaben","expense","posting","debit",3,null,360000,0),
    ]),
    n("he-afa","HGB-W-AFA","Abschreibungen","expense","header","debit",2,null,0,0,[
      n("he-a1","HGB-6200","Abschreibungen auf Sachanlagen","expense","posting","debit",3,null,320000,0),
    ]),
    n("he-sonst","HGB-W-SONST","Sonstige Aufwendungen","expense","header","debit",2,null,0,0,[
      n("he-so1","HGB-6300","Miete und Nebenkosten","expense","posting","debit",3,null,180000,0),
      n("he-so2","HGB-6800","Zinsen und Bankgebühren","expense","posting","debit",3,null,110000,0),
      n("he-so3","HGB-7600","Körperschaftsteuer","expense","posting","debit",3,null,300000,0),
    ]),
  ]),
];

/* ===========================================================================
   SOCPA LOCAL — Saudi chart with Zakat, housing allowance, EOS
   Balanced: Total DR = 29,585,000 = Total CR
   =========================================================================== */
export const SOCPA_TREE: GlAccountNode[] = [
  n("sa","SOCPA-A","Assets","asset","header","debit",1,null,0,0,[
    n("sa-cash","SOCPA-A-CASH","Cash & Bank","asset","header","debit",2,null,0,0,[
      n("sa-c1","SOCPA-A-CASH-OPER","Operating Cash","asset","posting","debit",3,null,1200000,0),
      n("sa-c2","SOCPA-A-CASH-BANK","Bank Accounts","asset","posting","debit",3,null,3400000,0),
    ]),
    n("sa-ar","SOCPA-A-AR","Trade Receivables","asset","header","debit",2,null,0,0,[
      n("sa-ar1","SOCPA-A-AR-TRADE","Trade Receivables","asset","posting","debit",3,"ar",2100000,0),
      n("sa-ar2","SOCPA-A-AR-ALLOW","Allowance Doubtful","contra_asset","posting","credit",3,null,0,105000),
    ]),
    n("sa-inv","SOCPA-A-INV","Inventory","asset","header","debit",2,null,0,0,[
      n("sa-i1","SOCPA-A-INV-GOODS","Trading Goods","asset","posting","debit",3,"inventory",1800000,0),
    ]),
    n("sa-fa","SOCPA-A-FA","Fixed Assets","asset","header","debit",2,null,0,0,[
      n("sa-f1","SOCPA-A-FA-BLDG","Buildings","asset","posting","debit",3,"asset",8500000,0),
      n("sa-f2","SOCPA-A-FA-VEH","Vehicles","asset","posting","debit",3,"asset",1200000,0),
    ]),
    n("sa-dep","SOCPA-A-DEP","Accumulated Depreciation","asset","header","debit",2,null,0,0,[
      n("sa-d1","SOCPA-A-DEP-BLDG","Accum Depr — Buildings","contra_asset","posting","credit",3,null,0,1700000),
      n("sa-d2","SOCPA-A-DEP-VEH","Accum Depr — Vehicles","contra_asset","posting","credit",3,null,0,480000),
    ]),
  ]),
  n("sl","SOCPA-L","Liabilities","liability","header","credit",1,null,0,0,[
    n("sl-ap","SOCPA-L-AP","Trade Payables","liability","header","credit",2,null,0,0,[
      n("sl-a1","SOCPA-L-AP-TRADE","Trade Payables","liability","posting","credit",3,"ap",0,2800000),
    ]),
    n("sl-emp","SOCPA-L-EMP","Employee Liabilities","liability","header","credit",2,null,0,0,[
      n("sl-e1","SOCPA-L-EMP-SAL","Salaries Payable","liability","posting","credit",3,null,0,520000),
      n("sl-e2","SOCPA-L-EMP-EOS","End of Service","liability","posting","credit",3,null,0,1840000),
    ]),
    n("sl-tax","SOCPA-L-TAX","Tax & Zakat","liability","header","credit",2,null,0,0,[
      n("sl-t1","SOCPA-L-TAX-VAT","VAT Payable","liability","posting","credit",3,null,0,420000),
    ]),
  ]),
  n("sq","SOCPA-Q","Equity","equity","header","credit",1,null,0,0,[
    n("sq-1","SOCPA-Q-CAP","Share Capital","equity","posting","credit",2,null,0,4000000),
    n("sq-2","SOCPA-Q-RE-OPENING","Retained Earnings — Opening","equity","posting","credit",2,null,0,2705000),
    n("sq-3","SOCPA-Q-RE-CY","Current Year P&L","equity","posting","credit",2,null,0,1815000),
  ]),
  n("sr","SOCPA-R","Revenue","income","header","credit",1,null,0,0,[
    n("sr-1","SOCPA-R-SALES","Sales Revenue","income","posting","credit",2,null,0,12600000),
    n("sr-2","SOCPA-R-OOI-RENTAL","Rental Income","income","posting","credit",2,null,0,320000),
    n("sr-3","SOCPA-R-FIN-INT","Interest Income","income","posting","credit",2,null,0,280000),
  ]),
  n("se","SOCPA-E","Expenses","expense","header","debit",1,null,0,0,[
    n("se-cogs","SOCPA-E-COGS","Cost of Sales","expense","header","debit",2,null,0,0,[
      n("se-c1","SOCPA-E-COGS-MAT","Materials & Goods","expense","posting","debit",3,null,4200000,0),
    ]),
    n("se-hr","SOCPA-E-HR","HR & Payroll","expense","header","debit",2,null,0,0,[
      n("se-h1","SOCPA-E-HR-SAL","Salaries & Wages","expense","posting","debit",3,null,3600000,0),
      n("se-h2","SOCPA-E-HR-ALLOW","Housing & Transport Allowance","expense","posting","debit",3,null,1200000,0),
      n("se-h3","SOCPA-E-HR-EOS","End of Service Expense","expense","posting","debit",3,null,480000,0),
    ]),
    n("se-ga","SOCPA-E-GA","General & Admin","expense","header","debit",2,null,0,0,[
      n("se-g1","SOCPA-E-GA-OFFICE","Office & Admin","expense","posting","debit",3,null,600000,0),
      n("se-g2","SOCPA-E-GA-RENT","Rent & Occupancy","expense","posting","debit",3,null,880000,0),
    ]),
    n("se-fin","SOCPA-E-FIN","Finance & Tax","expense","header","debit",2,null,0,0,[
      n("se-f1","SOCPA-E-FIN-BANK","Bank Charges","expense","posting","debit",3,null,45000,0),
      n("se-f2","SOCPA-E-TAX-ZAKAT","Zakat Expense","expense","posting","debit",3,null,380000,0),
    ]),
  ]),
];

/** Chart code → account tree lookup. Charts without seed data fall back to GROUP. */
export const CHART_TREES: Record<string, GlAccountNode[]> = {
  "COA-IFRS-GROUP": GROUP_TREE,
  "COA-HGB": HGB_TREE,
  "COA-SOCPA": SOCPA_TREE,
  // Unseed charts: show group structure with a proxy note
  "COA-IFRS": GROUP_TREE,
  "COA-USGAAP": GROUP_TREE,
  "COA-INDAS": GROUP_TREE,
  "COA-JGAAP": GROUP_TREE,
};

/** Charts whose trees are proxied (not natively seeded yet) */
export const PROXY_CHARTS = new Set(["COA-IFRS", "COA-USGAAP", "COA-INDAS", "COA-JGAAP"]);

/* ===========================================================================
   COMPANIES — 17 per 201_company_chart_assignments.sql
   =========================================================================== */
export const COMPANIES: CompanyCode[] = [
  { code: "ATHQ", name: "Atlas Group HQ",          currency: "SAR", operatingChart: "COA-IFRS",   groupChart: "COA-IFRS-GROUP", localChart: null,       region: "MENA" },
  { code: "AMRE", name: "Atlas Maritime",           currency: "USD", operatingChart: "COA-IFRS",   groupChart: "COA-IFRS-GROUP", localChart: null,       region: "MENA" },
  { code: "AQTU", name: "Atlas Qatar Trading",      currency: "QAR", operatingChart: "COA-IFRS",   groupChart: "COA-IFRS-GROUP", localChart: null,       region: "MENA" },
  { code: "ASAC", name: "Atlas Saudi Operations",   currency: "SAR", operatingChart: "COA-SOCPA",  groupChart: "COA-IFRS-GROUP", localChart: null,       region: "MENA" },
  { code: "AQTS", name: "Atlas Qatar Services",     currency: "QAR", operatingChart: "COA-IFRS",   groupChart: "COA-IFRS-GROUP", localChart: null,       region: "MENA" },
  { code: "AUET", name: "Atlas UAE Trading",        currency: "AED", operatingChart: "COA-IFRS",   groupChart: "COA-IFRS-GROUP", localChart: null,       region: "MENA" },
  { code: "ASAH", name: "Atlas Saudi Al Ahsa",      currency: "SAR", operatingChart: "COA-SOCPA",  groupChart: "COA-IFRS-GROUP", localChart: null,       region: "MENA" },
  { code: "AUIC", name: "Atlas USA IC",             currency: "USD", operatingChart: "COA-USGAAP", groupChart: "COA-IFRS-GROUP", localChart: null,       region: "Americas" },
  { code: "ASGF", name: "Atlas Gulf Foods",         currency: "BHD", operatingChart: "COA-IFRS",   groupChart: "COA-IFRS-GROUP", localChart: null,       region: "MENA" },
  { code: "AITM", name: "Atlas India Tech",         currency: "INR", operatingChart: "COA-INDAS",  groupChart: "COA-IFRS-GROUP", localChart: null,       region: "APAC" },
  { code: "ACFB", name: "Atlas Capital & Finance",  currency: "SAR", operatingChart: "COA-IFRS",   groupChart: "COA-IFRS-GROUP", localChart: null,       region: "MENA" },
  { code: "ADPM", name: "Atlas Germany Precision",  currency: "EUR", operatingChart: "COA-HGB",    groupChart: "COA-IFRS-GROUP", localChart: "COA-IFRS", region: "EMEA" },
  { code: "ATEM", name: "Atlas Emerging Markets",   currency: "USD", operatingChart: "COA-IFRS",   groupChart: "COA-IFRS-GROUP", localChart: null,       region: "EMEA" },
  { code: "ASPE", name: "Atlas Spain Engineering",  currency: "EUR", operatingChart: "COA-IFRS",   groupChart: "COA-IFRS-GROUP", localChart: null,       region: "EMEA" },
  { code: "AUKA", name: "Atlas UK Automotive",      currency: "GBP", operatingChart: "COA-IFRS",   groupChart: "COA-IFRS-GROUP", localChart: null,       region: "EMEA" },
  { code: "AJED", name: "Atlas Japan Trading",      currency: "JPY", operatingChart: "COA-JGAAP",  groupChart: "COA-IFRS-GROUP", localChart: null,       region: "APAC" },
  { code: "APHS", name: "Atlas Philippines",        currency: "PHP", operatingChart: "COA-IFRS",   groupChart: "COA-IFRS-GROUP", localChart: null,       region: "APAC" },
];

/* ===========================================================================
   LEGAL ENTITIES — group/subsidiary hierarchy
   =========================================================================== */
export const ENTITIES: LegalEntity[] = [
  { id: "root", code: "ATG-LE",  name: "Atlas Group Holdings",    parentId: null,   entityType: "holding",  consolidationMethod: null,           ownershipPct: null, country: "SA", functionalCurrency: "SAR", reportingCurrency: "USD", companyCodes: ["ATHQ"],       status: "active" },
  { id: "mena", code: "MENA-LE", name: "Atlas MENA Holdings",     parentId: "root", entityType: "holding",  consolidationMethod: "full",         ownershipPct: 100,  country: "SA", functionalCurrency: "SAR", reportingCurrency: "USD", companyCodes: [],             status: "active" },
  { id: "asac", code: "ASAC-LE", name: "Atlas Saudi Operations",  parentId: "mena", entityType: "operating",consolidationMethod: "full",         ownershipPct: 100,  country: "SA", functionalCurrency: "SAR", reportingCurrency: "USD", companyCodes: ["ASAC"],       status: "active" },
  { id: "asah", code: "ASAH-LE", name: "Atlas Saudi Al Ahsa",     parentId: "mena", entityType: "operating",consolidationMethod: "full",         ownershipPct: 100,  country: "SA", functionalCurrency: "SAR", reportingCurrency: "USD", companyCodes: ["ASAH"],       status: "active" },
  { id: "auet", code: "AUET-LE", name: "Atlas UAE Trading",       parentId: "mena", entityType: "operating",consolidationMethod: "full",         ownershipPct: 100,  country: "AE", functionalCurrency: "AED", reportingCurrency: "USD", companyCodes: ["AUET"],       status: "active" },
  { id: "aqtu", code: "AQTU-LE", name: "Atlas Qatar Trading",     parentId: "mena", entityType: "operating",consolidationMethod: "full",         ownershipPct: 100,  country: "QA", functionalCurrency: "QAR", reportingCurrency: "USD", companyCodes: ["AQTU"],       status: "active" },
  { id: "aqts", code: "AQTS-LE", name: "Atlas Qatar Services",    parentId: "mena", entityType: "operating",consolidationMethod: "full",         ownershipPct: 100,  country: "QA", functionalCurrency: "QAR", reportingCurrency: "USD", companyCodes: ["AQTS"],       status: "active" },
  { id: "asgf", code: "ASGF-LE", name: "Atlas Gulf Foods",        parentId: "mena", entityType: "operating",consolidationMethod: "full",         ownershipPct: 100,  country: "BH", functionalCurrency: "BHD", reportingCurrency: "USD", companyCodes: ["ASGF"],       status: "active" },
  { id: "acfb", code: "ACFB-LE", name: "Atlas Capital & Finance", parentId: "mena", entityType: "operating",consolidationMethod: "full",         ownershipPct: 100,  country: "SA", functionalCurrency: "SAR", reportingCurrency: "USD", companyCodes: ["ACFB"],       status: "active" },
  { id: "amre", code: "AMRE-LE", name: "Atlas Maritime",          parentId: "mena", entityType: "operating",consolidationMethod: "full",         ownershipPct: 80,   country: "PA", functionalCurrency: "USD", reportingCurrency: "USD", companyCodes: ["AMRE"],       status: "active" },
  { id: "apac", code: "APAC-LE", name: "Atlas APAC Holdings",     parentId: "root", entityType: "holding",  consolidationMethod: "full",         ownershipPct: 100,  country: "SG", functionalCurrency: "USD", reportingCurrency: "USD", companyCodes: [],             status: "active" },
  { id: "aitm", code: "AITM-LE", name: "Atlas India Tech",        parentId: "apac", entityType: "operating",consolidationMethod: "full",         ownershipPct: 100,  country: "IN", functionalCurrency: "INR", reportingCurrency: "USD", companyCodes: ["AITM"],       status: "active" },
  { id: "ajed", code: "AJED-LE", name: "Atlas Japan Trading",     parentId: "apac", entityType: "operating",consolidationMethod: "proportional", ownershipPct: 75,   country: "JP", functionalCurrency: "JPY", reportingCurrency: "USD", companyCodes: ["AJED"],       status: "active" },
  { id: "aphs", code: "APHS-LE", name: "Atlas Philippines",       parentId: "apac", entityType: "operating",consolidationMethod: "full",         ownershipPct: 100,  country: "PH", functionalCurrency: "PHP", reportingCurrency: "USD", companyCodes: ["APHS"],       status: "active" },
  { id: "emea", code: "EMEA-LE", name: "Atlas EMEA Holdings",     parentId: "root", entityType: "holding",  consolidationMethod: "full",         ownershipPct: 100,  country: "GB", functionalCurrency: "GBP", reportingCurrency: "USD", companyCodes: [],             status: "active" },
  { id: "adpm", code: "ADPM-LE", name: "Atlas Germany Precision", parentId: "emea", entityType: "operating",consolidationMethod: "full",         ownershipPct: 100,  country: "DE", functionalCurrency: "EUR", reportingCurrency: "USD", companyCodes: ["ADPM"],       status: "active" },
  { id: "auka", code: "AUKA-LE", name: "Atlas UK Automotive",     parentId: "emea", entityType: "operating",consolidationMethod: "full",         ownershipPct: 100,  country: "GB", functionalCurrency: "GBP", reportingCurrency: "USD", companyCodes: ["AUKA"],       status: "active" },
  { id: "aspe", code: "ASPE-LE", name: "Atlas Spain Engineering", parentId: "emea", entityType: "operating",consolidationMethod: "full",         ownershipPct: 100,  country: "ES", functionalCurrency: "EUR", reportingCurrency: "USD", companyCodes: ["ASPE"],       status: "active" },
  { id: "atem", code: "ATEM-LE", name: "Atlas Emerging Markets",  parentId: "emea", entityType: "operating",consolidationMethod: "equity",       ownershipPct: 40,   country: "KE", functionalCurrency: "USD", reportingCurrency: "USD", companyCodes: ["ATEM"],       status: "active" },
  { id: "amer", code: "AMER-LE", name: "Atlas Americas Holdings", parentId: "root", entityType: "holding",  consolidationMethod: "full",         ownershipPct: 100,  country: "US", functionalCurrency: "USD", reportingCurrency: "USD", companyCodes: [],             status: "active" },
  { id: "auic", code: "AUIC-LE", name: "Atlas USA IC",            parentId: "amer", entityType: "operating",consolidationMethod: "full",         ownershipPct: 100,  country: "US", functionalCurrency: "USD", reportingCurrency: "USD", companyCodes: ["AUIC"],       status: "active" },
];

/* ===========================================================================
   COMPANY POSTING CONTROLS
   =========================================================================== */
export const CONTROLS: PostingControl[] = [
  // AUKA — IFRS operating chart (uses group codes as proxy)
  { companyCode: "AUKA", accountCode: "GRP-A-CASH-OPER", accountName: "Operating Cash",      accountClass: "asset",     ownerType: "internal", subledgerType: null, postingAllowed: true,  blockedForManual: false, blockedForAuto: false, requiresCostCenter: true,  requiresProfitCenter: false, requiresProject: false, defaultCostCenter: "CC-100", defaultProfitCenter: null,    defaultSite: null,      reconciliation: "manual", taxTreatment: null,        openItemManaged: false, lineItemDisplay: true  },
  { companyCode: "AUKA", accountCode: "GRP-A-AR-TRADE",  accountName: "Trade Receivables",   accountClass: "asset",     ownerType: "customer", subledgerType: "ar", postingAllowed: true,  blockedForManual: true,  blockedForAuto: false, requiresCostCenter: true,  requiresProfitCenter: true,  requiresProject: false, defaultCostCenter: "CC-100", defaultProfitCenter: "PC-10", defaultSite: null,      reconciliation: "auto",   taxTreatment: "standard",  openItemManaged: true,  lineItemDisplay: true  },
  { companyCode: "AUKA", accountCode: "GRP-L-AP-TRADE",  accountName: "Trade Payables",      accountClass: "liability", ownerType: "supplier", subledgerType: "ap", postingAllowed: true,  blockedForManual: true,  blockedForAuto: false, requiresCostCenter: true,  requiresProfitCenter: true,  requiresProject: false, defaultCostCenter: "CC-200", defaultProfitCenter: "PC-20", defaultSite: null,      reconciliation: "auto",   taxTreatment: "standard",  openItemManaged: true,  lineItemDisplay: true  },
  { companyCode: "AUKA", accountCode: "GRP-L-EMP-SAL",   accountName: "Salaries Payable",    accountClass: "liability", ownerType: "employee", subledgerType: null, postingAllowed: true,  blockedForManual: false, blockedForAuto: false, requiresCostCenter: true,  requiresProfitCenter: true,  requiresProject: false, defaultCostCenter: "CC-400", defaultProfitCenter: "PC-40", defaultSite: null,      reconciliation: "none",   taxTreatment: null,        openItemManaged: false, lineItemDisplay: false },
  { companyCode: "AUKA", accountCode: "GRP-E-HR-SAL",    accountName: "Salaries & Wages",    accountClass: "expense",   ownerType: "employee", subledgerType: null, postingAllowed: true,  blockedForManual: false, blockedForAuto: false, requiresCostCenter: true,  requiresProfitCenter: true,  requiresProject: false, defaultCostCenter: "CC-400", defaultProfitCenter: "PC-40", defaultSite: null,      reconciliation: "none",   taxTreatment: null,        openItemManaged: false, lineItemDisplay: false },
  { companyCode: "AUKA", accountCode: "GRP-E-COGS-MAT",  accountName: "Materials Consumed",  accountClass: "expense",   ownerType: "supplier", subledgerType: null, postingAllowed: true,  blockedForManual: false, blockedForAuto: false, requiresCostCenter: true,  requiresProfitCenter: true,  requiresProject: true,  defaultCostCenter: "CC-210", defaultProfitCenter: "PC-20", defaultSite: "SITE-HQ", reconciliation: "none",   taxTreatment: "standard",  openItemManaged: false, lineItemDisplay: true  },
  { companyCode: "AUKA", accountCode: "GRP-R-SALES-GOODS",accountName: "Revenue — Goods",    accountClass: "income",    ownerType: "customer", subledgerType: null, postingAllowed: true,  blockedForManual: true,  blockedForAuto: false, requiresCostCenter: true,  requiresProfitCenter: true,  requiresProject: false, defaultCostCenter: "CC-100", defaultProfitCenter: "PC-10", defaultSite: null,      reconciliation: "none",   taxTreatment: "standard",  openItemManaged: false, lineItemDisplay: true  },
  { companyCode: "AUKA", accountCode: "GRP-Q-RE-OPENING",accountName: "Retained Earnings",   accountClass: "equity",    ownerType: "internal", subledgerType: null, postingAllowed: false, blockedForManual: true,  blockedForAuto: true,  requiresCostCenter: false, requiresProfitCenter: false, requiresProject: false, defaultCostCenter: null,     defaultProfitCenter: null,    defaultSite: null,      reconciliation: "none",   taxTreatment: null,        openItemManaged: false, lineItemDisplay: false },
  // ADPM — HGB operating chart
  { companyCode: "ADPM", accountCode: "HGB-1200",        accountName: "Geschäftskonto",      accountClass: "asset",     ownerType: "internal", subledgerType: null, postingAllowed: true,  blockedForManual: false, blockedForAuto: false, requiresCostCenter: true,  requiresProfitCenter: false, requiresProject: false, defaultCostCenter: "CC-120", defaultProfitCenter: null,    defaultSite: null,      reconciliation: "manual", taxTreatment: null,        openItemManaged: false, lineItemDisplay: true  },
  { companyCode: "ADPM", accountCode: "HGB-1400",        accountName: "Forderungen L+L",     accountClass: "asset",     ownerType: "customer", subledgerType: "ar", postingAllowed: true,  blockedForManual: true,  blockedForAuto: false, requiresCostCenter: true,  requiresProfitCenter: true,  requiresProject: false, defaultCostCenter: "CC-120", defaultProfitCenter: "PC-12", defaultSite: null,      reconciliation: "auto",   taxTreatment: "standard",  openItemManaged: true,  lineItemDisplay: true  },
  { companyCode: "ADPM", accountCode: "HGB-1600",        accountName: "Verbindlichkeiten L+L",accountClass: "liability",ownerType: "supplier", subledgerType: "ap", postingAllowed: true,  blockedForManual: true,  blockedForAuto: false, requiresCostCenter: true,  requiresProfitCenter: true,  requiresProject: false, defaultCostCenter: "CC-120", defaultProfitCenter: "PC-12", defaultSite: null,      reconciliation: "auto",   taxTreatment: "standard",  openItemManaged: true,  lineItemDisplay: true  },
  { companyCode: "ADPM", accountCode: "HGB-6000",        accountName: "Löhne und Gehälter",  accountClass: "expense",   ownerType: "employee", subledgerType: null, postingAllowed: true,  blockedForManual: false, blockedForAuto: false, requiresCostCenter: true,  requiresProfitCenter: true,  requiresProject: false, defaultCostCenter: "CC-420", defaultProfitCenter: "PC-42", defaultSite: null,      reconciliation: "none",   taxTreatment: "lohnsteuer", openItemManaged: false, lineItemDisplay: false },
  // ASAC — SOCPA operating chart
  { companyCode: "ASAC", accountCode: "SOCPA-A-CASH-OPER",accountName: "Operating Cash",     accountClass: "asset",     ownerType: "internal", subledgerType: null, postingAllowed: true,  blockedForManual: false, blockedForAuto: false, requiresCostCenter: true,  requiresProfitCenter: false, requiresProject: false, defaultCostCenter: "CC-100", defaultProfitCenter: null,    defaultSite: null,      reconciliation: "manual", taxTreatment: null,        openItemManaged: false, lineItemDisplay: true  },
  { companyCode: "ASAC", accountCode: "SOCPA-A-AR-TRADE", accountName: "Trade Receivables",  accountClass: "asset",     ownerType: "customer", subledgerType: "ar", postingAllowed: true,  blockedForManual: true,  blockedForAuto: false, requiresCostCenter: true,  requiresProfitCenter: true,  requiresProject: false, defaultCostCenter: "CC-100", defaultProfitCenter: "PC-10", defaultSite: null,      reconciliation: "auto",   taxTreatment: "vat",       openItemManaged: true,  lineItemDisplay: true  },
  { companyCode: "ASAC", accountCode: "SOCPA-L-AP-TRADE", accountName: "Trade Payables",     accountClass: "liability", ownerType: "supplier", subledgerType: "ap", postingAllowed: true,  blockedForManual: true,  blockedForAuto: false, requiresCostCenter: true,  requiresProfitCenter: true,  requiresProject: false, defaultCostCenter: "CC-200", defaultProfitCenter: "PC-20", defaultSite: null,      reconciliation: "auto",   taxTreatment: "vat",       openItemManaged: true,  lineItemDisplay: true  },
  { companyCode: "ASAC", accountCode: "SOCPA-L-EMP-EOS",  accountName: "End of Service",     accountClass: "liability", ownerType: "employee", subledgerType: null, postingAllowed: true,  blockedForManual: false, blockedForAuto: false, requiresCostCenter: true,  requiresProfitCenter: true,  requiresProject: false, defaultCostCenter: "CC-400", defaultProfitCenter: "PC-40", defaultSite: null,      reconciliation: "none",   taxTreatment: null,        openItemManaged: false, lineItemDisplay: false },
  { companyCode: "ASAC", accountCode: "SOCPA-E-HR-SAL",   accountName: "Salaries & Wages",   accountClass: "expense",   ownerType: "employee", subledgerType: null, postingAllowed: true,  blockedForManual: false, blockedForAuto: false, requiresCostCenter: true,  requiresProfitCenter: true,  requiresProject: false, defaultCostCenter: "CC-400", defaultProfitCenter: "PC-40", defaultSite: null,      reconciliation: "none",   taxTreatment: null,        openItemManaged: false, lineItemDisplay: false },
  { companyCode: "ASAC", accountCode: "SOCPA-E-TAX-ZAKAT",accountName: "Zakat Expense",      accountClass: "expense",   ownerType: "internal", subledgerType: null, postingAllowed: true,  blockedForManual: false, blockedForAuto: true,  requiresCostCenter: false, requiresProfitCenter: false, requiresProject: false, defaultCostCenter: null,     defaultProfitCenter: null,    defaultSite: null,      reconciliation: "none",   taxTreatment: "zakat",     openItemManaged: false, lineItemDisplay: false },
  // ATHQ — IFRS operating chart (HQ-level IC accounts)
  { companyCode: "ATHQ", accountCode: "GRP-A-CASH-OPER",  accountName: "Operating Cash",     accountClass: "asset",     ownerType: "internal", subledgerType: null, postingAllowed: true,  blockedForManual: false, blockedForAuto: false, requiresCostCenter: true,  requiresProfitCenter: false, requiresProject: false, defaultCostCenter: "CC-HQ",  defaultProfitCenter: null,    defaultSite: null,      reconciliation: "manual", taxTreatment: null,        openItemManaged: false, lineItemDisplay: true  },
  { companyCode: "ATHQ", accountCode: "GRP-A-ICR-TRADE",  accountName: "IC Receivables",     accountClass: "asset",     ownerType: "internal", subledgerType: null, postingAllowed: true,  blockedForManual: true,  blockedForAuto: false, requiresCostCenter: true,  requiresProfitCenter: true,  requiresProject: false, defaultCostCenter: "CC-HQ",  defaultProfitCenter: "PC-HQ", defaultSite: null,      reconciliation: "auto",   taxTreatment: null,        openItemManaged: true,  lineItemDisplay: true  },
  { companyCode: "ATHQ", accountCode: "GRP-R-ICR-MGMT",   accountName: "IC Mgmt Fee Income", accountClass: "income",    ownerType: "internal", subledgerType: null, postingAllowed: true,  blockedForManual: true,  blockedForAuto: false, requiresCostCenter: true,  requiresProfitCenter: true,  requiresProject: false, defaultCostCenter: "CC-HQ",  defaultProfitCenter: "PC-HQ", defaultSite: null,      reconciliation: "none",   taxTreatment: null,        openItemManaged: false, lineItemDisplay: true  },
];

/* ===========================================================================
   COA MAPPINGS — operating → group chart
   =========================================================================== */
export const MAPPINGS: CoaMapping[] = [
  { id: 1,  sourceChart: "COA-SOCPA", sourceAccount: "SOCPA-A-CASH-OPER", sourceName: "Operating Cash",          targetChart: "COA-IFRS-GROUP", targetAccount: "GRP-A-CASH-OPER", targetName: "Operating Cash",    mappingType: "direct", allocationPct: null, effectiveFrom: "2024-01-01", effectiveTo: null,         version: 1, status: "active",  reason: "Initial setup" },
  { id: 2,  sourceChart: "COA-SOCPA", sourceAccount: "SOCPA-A-AR-TRADE",  sourceName: "Trade Receivables",       targetChart: "COA-IFRS-GROUP", targetAccount: "GRP-A-AR-TRADE",  targetName: "Receivables Ctrl",  mappingType: "direct", allocationPct: null, effectiveFrom: "2024-01-01", effectiveTo: null,         version: 1, status: "active",  reason: "Initial setup" },
  { id: 3,  sourceChart: "COA-SOCPA", sourceAccount: "SOCPA-E-TAX-ZAKAT", sourceName: "Zakat Expense",           targetChart: "COA-IFRS-GROUP", targetAccount: "GRP-E-TAX-CIT",   targetName: "Income Tax Exp",    mappingType: "direct", allocationPct: null, effectiveFrom: "2024-01-01", effectiveTo: null,         version: 1, status: "active",  reason: "Zakat → CIT crosswalk" },
  { id: 4,  sourceChart: "COA-SOCPA", sourceAccount: "SOCPA-E-HR-ALLOW",  sourceName: "Housing Allowance",       targetChart: "COA-IFRS-GROUP", targetAccount: "GRP-E-HR-BEN",    targetName: "Employee Benefits", mappingType: "direct", allocationPct: null, effectiveFrom: "2024-01-01", effectiveTo: null,         version: 1, status: "active",  reason: "SA housing → benefits" },
  { id: 5,  sourceChart: "COA-SOCPA", sourceAccount: "SOCPA-L-EMP-EOS",   sourceName: "End of Service",          targetChart: "COA-IFRS-GROUP", targetAccount: "GRP-L-EMP-EOS",   targetName: "End of Service",    mappingType: "direct", allocationPct: null, effectiveFrom: "2024-01-01", effectiveTo: null,         version: 1, status: "active",  reason: "Initial setup" },
  { id: 6,  sourceChart: "COA-HGB",   sourceAccount: "HGB-1000",          sourceName: "Kasse",                   targetChart: "COA-IFRS-GROUP", targetAccount: "GRP-A-CASH-PETTY",targetName: "Petty Cash",        mappingType: "direct", allocationPct: null, effectiveFrom: "2024-01-01", effectiveTo: null,         version: 1, status: "active",  reason: "Initial setup" },
  { id: 7,  sourceChart: "COA-HGB",   sourceAccount: "HGB-1200",          sourceName: "Geschäftskonto",          targetChart: "COA-IFRS-GROUP", targetAccount: "GRP-A-CASH-BANK", targetName: "Bank Accounts",     mappingType: "direct", allocationPct: null, effectiveFrom: "2024-01-01", effectiveTo: null,         version: 1, status: "active",  reason: "Initial setup" },
  { id: 8,  sourceChart: "COA-HGB",   sourceAccount: "HGB-7600",          sourceName: "Körperschaftsteuer",      targetChart: "COA-IFRS-GROUP", targetAccount: "GRP-E-TAX-CIT",   targetName: "Income Tax Exp",    mappingType: "direct", allocationPct: null, effectiveFrom: "2024-01-01", effectiveTo: null,         version: 1, status: "active",  reason: "KSt → CIT crosswalk" },
  { id: 9,  sourceChart: "COA-HGB",   sourceAccount: "HGB-6300",          sourceName: "Miete und Nebenkosten",   targetChart: "COA-IFRS-GROUP", targetAccount: "GRP-E-SGA-OFFICE",targetName: "Office & Admin",    mappingType: "split",  allocationPct: 70,   effectiveFrom: "2024-04-01", effectiveTo: null,         version: 2, status: "active",  reason: "Revised split Q2" },
  { id: 10, sourceChart: "COA-HGB",   sourceAccount: "HGB-6300",          sourceName: "Miete und Nebenkosten",   targetChart: "COA-IFRS-GROUP", targetAccount: "GRP-E-SGA-IT",    targetName: "IT & Comms",        mappingType: "split",  allocationPct: 30,   effectiveFrom: "2024-04-01", effectiveTo: null,         version: 2, status: "active",  reason: "Revised split Q2" },
  { id: 11, sourceChart: "COA-HGB",   sourceAccount: "HGB-6300",          sourceName: "Miete (OLD)",             targetChart: "COA-IFRS-GROUP", targetAccount: "GRP-E-SGA-OFFICE",targetName: "Office & Admin",    mappingType: "direct", allocationPct: null, effectiveFrom: "2024-01-01", effectiveTo: "2024-03-31", version: 1, status: "expired", reason: "Replaced by split" },
];

/* -- Tree utilities -------------------------------------------------------- */

/** Collect all posting (leaf) accounts from a tree */
export function collectPostings(nodes: GlAccountNode[]): GlAccountNode[] {
  return nodes.flatMap((nd) =>
    nd.nodeType === "posting" ? [nd] : nd.children ? collectPostings(nd.children) : [],
  );
}

/** Sum DR and CR across a tree */
export function sumTree(nodes: GlAccountNode[]): { dr: number; cr: number } {
  return nodes.reduce(
    (acc, nd) => {
      if (nd.children) {
        const sub = sumTree(nd.children);
        return { dr: acc.dr + sub.dr, cr: acc.cr + sub.cr };
      }
      return { dr: acc.dr + nd.closingDebit, cr: acc.cr + nd.closingCredit };
    },
    { dr: 0, cr: 0 },
  );
}

/** Find a node by id in a tree */
export function findNode(nodes: GlAccountNode[], id: string): GlAccountNode | null {
  for (const nd of nodes) {
    if (nd.id === id) return nd;
    if (nd.children) {
      const found = findNode(nd.children, id);
      if (found) return found;
    }
  }
  return null;
}
