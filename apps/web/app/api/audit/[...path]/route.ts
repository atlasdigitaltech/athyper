import { makeModuleRelay } from "@/lib/server/make-module-relay";
export const { GET, POST, PUT, PATCH, DELETE } = makeModuleRelay("audit");
