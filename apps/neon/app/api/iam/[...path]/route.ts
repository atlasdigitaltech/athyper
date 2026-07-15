// {GET|POST|PUT|PATCH|DELETE} /api/iam/[...path] — BFF relay to runtime /api/iam/*. Groups, roles, principals, bindings, delegations admin.
import { makeModuleRelay } from "@/lib/server/make-module-relay";

export const { GET, POST, PUT, PATCH, DELETE } = makeModuleRelay("iam");
