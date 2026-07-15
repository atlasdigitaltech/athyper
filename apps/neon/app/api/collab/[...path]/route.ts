// {GET|POST|PUT|PATCH|DELETE} /api/collab/[...path] — BFF relay to runtime /api/collab/*. Comments, reactions, mentions, activity feed, attachments.
import { makeModuleRelay } from "@/lib/server/make-module-relay";

export const { GET, POST, PUT, PATCH, DELETE } = makeModuleRelay("collab");
