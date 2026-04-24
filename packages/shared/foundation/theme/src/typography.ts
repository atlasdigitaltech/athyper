/**
 * @athyper/theme — canonical typography scale (spec §2)
 *
 * Seven ranks, nothing else allowed. Import `t` and apply via cn():
 *   <h1 className={t.title}>Invoices</h1>
 *   <dt className={t.label}>Supplier</dt>
 *   <dd className={t.body}>Acme Corp</dd>
 *
 * Line-height: 1.2 (title/docNo), 1.4 (body), 1.5 (label/meta/micro).
 * Letter-spacing: 0 everywhere — no uppercase tracking-wider on field labels.
 */

export const t = {
  /** 20/600 · foreground · page title on list views ("Invoices") */
  title:  "text-xl  font-semibold  leading-tight text-foreground",
  /** 16/600 · foreground · entity id on detail ("INV-A1-0001") */
  docNo:  "text-base font-semibold  leading-tight text-foreground",
  /** 18/600 mono · foreground · metric values ("$1,000.00") */
  amount: "text-lg   font-semibold  leading-tight font-mono text-foreground",
  /** 14/400 · foreground · table cells, KV values, body copy */
  body:   "text-sm   font-normal    leading-snug  text-foreground",
  /** 12/500 · muted-foreground · section labels, field labels */
  label:  "text-xs   font-medium    leading-normal text-muted-foreground",
  /** 12/400 · muted-foreground · subtitles, helper text, meta rows */
  meta:   "text-xs   font-normal    leading-normal text-muted-foreground",
  /** 11/400 · muted-foreground · units (USD), captions, micro badges */
  micro:  "text-[11px] font-normal  leading-normal text-muted-foreground",
} as const;

export type TypographyToken = keyof typeof t;
