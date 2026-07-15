// {GET|POST|PUT|PATCH|DELETE} /api/admin/[...path] — BFF relay to runtime /api/platform/admin/*. Powers the diagnostics page and platform admin surfaces.
import { makeModuleRelay } from "@/lib/server/make-module-relay";

export const { GET, POST, PUT, PATCH, DELETE } = makeModuleRelay("platform/admin");
