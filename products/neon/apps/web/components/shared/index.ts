/**
 * Shared UI Primitives
 *
 * Standard building blocks used across ALL modules (finance, mesh, collab, etc.).
 * Every workspace page, dashboard, and detail view should use these instead of
 * inline loading/error/header patterns.
 */

// Error display
export { ErrorCard, ErrorInline } from "./ErrorCard";

// Loading indicators
export {
  LoadingSpinner,
  LoadingSkeleton,
  TableSkeleton,
  LoadingOverlay,
} from "./LoadingState";

// Page header
export { PageHeader } from "./PageHeader";

// Empty state (re-exported from mesh/shared for convenience)
export { EmptyState } from "../mesh/shared/EmptyState";
