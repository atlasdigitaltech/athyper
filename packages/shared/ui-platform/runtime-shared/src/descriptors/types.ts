export interface EntityFactDescriptor {
  id: string;
  label: string;
  field: string;
  emphasis?: "xl";
  currencyField?: string;
  subtotalField?: string;
  taxField?: string;
}

export interface EntityStatusDescriptor {
  id: string;
  label: string;
  field?: string;
}

export interface EntityAuditDescriptor {
  createdAtField?: string;
  createdByField?: string;
  updatedAtField?: string;
  updatedByField?: string;
  statusChangedAtField?: string;
  statusChangedByField?: string;
}

export type EntityEditFieldDescriptor = EntityEditableField;

export interface EntityDescriptorEditConfig {
  fields: EntityEditFieldDescriptor[];
  editableStatuses?: string[];
}

export interface EntityViewDescriptor {
  entityCode: string;

  identity: {
    typeLabel: string;
    numberField: string;
    statusField?: string;
    titleField?: string;
    partyIdField?: string;
  };

  facts?: EntityFactDescriptor[];
  statuses?: EntityStatusDescriptor[];
  audit?: EntityAuditDescriptor;
  hasLifecycle?: boolean;
  edit?: EntityDescriptorEditConfig;
}
import type { EntityEditableField } from "../edit/types";
