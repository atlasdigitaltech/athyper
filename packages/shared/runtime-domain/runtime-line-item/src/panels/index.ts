export type { AccountingPanelProps, AccountingPanelHandle, SplitAccountingPanelProps, SplitAccountingPanelHandle } from "./accounting-panel";
export { AccountingPanel, SplitAccountingPanel } from "./accounting-panel";
export type { ClassificationPanelProps, ClassificationDecisionPanelProps, ClassificationStatusBadgeProps } from "./classification-panel";
export { ClassificationPanel, ClassificationDecisionPanel, ClassificationStatusBadge } from "./classification-panel";

// ── Shared meta-field panels (meta-entity driven via groupKeys) ──
export type { MetaFieldPanelProps } from "./meta-field-panel";
export { MetaFieldPanel }          from "./meta-field-panel";
export { TaxPanel }                from "./tax-panel";
export { DiscountPanel }           from "./discount-panel";
export { ChargesPanel }            from "./charges-panel";
export { RetentionPanel }          from "./retention-panel";
export { ItemDescriptionPanel }    from "./item-description-panel";

// ── Variant-specific panels ──
export { ProcureItemPanel }  from "./procure/procure-item-panel";
export { ReferencePanel }    from "./procure/reference-panel";
export { DeliveryPanel as ProcureDeliveryPanel } from "./procure/delivery-panel";
export { BudgetPanel }       from "./procure/budget-panel";
export { SalesItemPanel }    from "./sales/sales-item-panel";
export { DeliveryPanel }     from "./sales/delivery-panel";
