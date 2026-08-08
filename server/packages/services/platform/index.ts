export { registerPlatformRoutes,       type PlatformRoutesDeps       } from "./routes/platform.route.js";
export { registerRefRoutes,            type RefRoutesDeps            } from "./routes/ref.route.js";
export { registerTaxonomyRoutes,       type TaxonomyRoutesDeps       } from "./routes/taxonomy.route.js";
export { registerClassificationRoutes, type ClassificationRoutesDeps } from "./routes/classification.route.js";
export { registerCommerceRoutes,       type CommerceRoutesDeps       } from "./routes/commerce.route.js";
export { registerNotificationRoutes,   type NotificationRoutesDeps   } from "./routes/notification.route.js";
export {
  FeatureFlagService,
  createFeatureFlagService,
  type FeatureFlagContext,
  type FeatureFlagDeps,
} from "./feature-flag.service.js";
export {
  NotificationOrchestrator,
  type DispatchNotificationInput,
  type DispatchResult,
} from "./notification-orchestrator.js";
export * from "./notification-orchestrator.js";
