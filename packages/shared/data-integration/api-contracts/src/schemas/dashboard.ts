import { z } from "zod";

export const DashboardPlaneSchema = z.enum(["admin", "neon", "mesh"]);
export type DashboardPlane = z.infer<typeof DashboardPlaneSchema>;

export const DashboardWidgetStateSchema = z.enum(["ready", "empty", "stale", "denied", "failed"]);
export type DashboardWidgetState = z.infer<typeof DashboardWidgetStateSchema>;

export const DashboardWidgetResultSchema = z.object({
  id: z.string().min(1),
  state: DashboardWidgetStateSchema,
  data: z.unknown().optional(),
  generatedAt: z.string().datetime(),
  staleAt: z.string().datetime(),
  error: z.string().optional(),
});
export type DashboardWidgetResult<T = unknown> = Omit<z.infer<typeof DashboardWidgetResultSchema>, "data"> & {
  data?: T;
};

export const DashboardAggregateSchema = z.object({
  plane: DashboardPlaneSchema,
  scopeKey: z.string(),
  permissionStamp: z.string(),
  generatedAt: z.string().datetime(),
  staleAt: z.string().datetime(),
  permissions: z.array(z.string()),
  widgets: z.record(z.string(), DashboardWidgetResultSchema),
});
export type DashboardAggregate = z.infer<typeof DashboardAggregateSchema>;

export interface DashboardMetricData {
  value: number | string;
  detail?: string;
  href?: string;
  trend?: string;
}

export interface DashboardQueueItem {
  id: string;
  title: string;
  detail?: string;
  status?: string;
  href?: string;
  occurredAt?: string;
}

export interface DashboardQueueData {
  items: DashboardQueueItem[];
  total?: number;
  href?: string;
}
