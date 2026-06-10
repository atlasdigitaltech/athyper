export type { AccountingPanelProps, AccountingPanelHandle, SplitAccountingPanelProps, SplitAccountingPanelHandle } from "./AccountingPanel";
export { AccountingPanel, SplitAccountingPanel } from "./AccountingPanel";
export type { ClassificationPanelProps, ClassificationDecisionPanelProps, ClassificationStatusBadgeProps } from "./ClassificationPanel";
export { ClassificationPanel, ClassificationDecisionPanel, ClassificationStatusBadge } from "./ClassificationPanel";

// ── Shared meta-field panels (meta-entity driven via groupKeys) ──
export type { MetaFieldPanelProps } from "./MetaFieldPanel";
export { MetaFieldPanel }          from "./MetaFieldPanel";
export { TaxPanel }                from "./TaxPanel";
export { DiscountPanel }           from "./DiscountPanel";
export { ChargesPanel }            from "./ChargesPanel";
export { RetentionPanel }          from "./RetentionPanel";
export { ItemDescriptionPanel }    from "./ItemDescriptionPanel";

// ── Variant-specific panels ──
export { ProcureItemPanel }  from "./procure/ProcureItemPanel";
export { ReferencePanel }    from "./procure/ReferencePanel";
export { SalesItemPanel }    from "./sales/SalesItemPanel";
export { DeliveryPanel }     from "./sales/DeliveryPanel";
