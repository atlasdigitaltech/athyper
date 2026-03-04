/**
 * Template Binding — maps templates to entity + operation + variant.
 */

import type { TemplateBindingId, TemplateId } from "../types.js";

export interface DocTemplateBinding {
    id: TemplateBindingId;
    tenantId: string;
    templateId: TemplateId;
    entityName: string;
    operation: string;
    variant: string;
    priority: number;
    active: boolean;
    createdAt: Date;
    createdBy: string;
}
