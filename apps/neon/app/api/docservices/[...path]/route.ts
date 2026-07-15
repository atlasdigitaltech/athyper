// {GET|POST|PUT|PATCH|DELETE} /api/docservices/[...path] — BFF relay to runtime /api/docservices/*. Print profiles, document export, format adapters.
import { makeModuleRelay } from "@/lib/server/make-module-relay";

export const { GET, POST, PUT, PATCH, DELETE } = makeModuleRelay("docservices");
