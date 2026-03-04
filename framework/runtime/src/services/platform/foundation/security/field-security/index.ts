/**
 * Field-Level Security
 *
 * Column Level Security (CLS) for the META Engine.
 * Provides runtime field filtering with masking, write protection, and audit logging.
 */

export const moduleCode = "field-security";
export const moduleName = "Field-Level Security";

// Types
export * from "./types.js";

// Repository
export {
  type IFieldSecurityRepository,
  InMemoryFieldSecurityRepository,
  DatabaseFieldSecurityRepository,
} from "./field-security.repository.js";

// Services
export { MaskingService, defaultMaskingService } from "./masking.service.js";
export { FieldAccessService } from "./field-access.service.js";
export { PolicyExplainService } from "./policy-explain.service.js";

// Query Integration
export {
  FieldProjectionBuilder,
  buildProjectedSelectExpression,
  buildSafeColumnList,
  type ProjectedField,
  type EntityProjection,
  type QueryProjection,
  type ProjectionOptions,
} from "./field-projection.js";
