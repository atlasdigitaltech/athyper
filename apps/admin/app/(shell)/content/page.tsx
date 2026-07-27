"use client";
import { ContentHub } from "@athyper/content-hub-ui";
import { bffFetch } from "@/lib/bff-fetch";
const adapter = { plane: "admin", endpoint: "/api/relay/platform/content-hub?plane=admin", projection: "Governed configuration artifacts" } as const;
export default function ContentRoute() { return <ContentHub adapter={adapter} fetcher={bffFetch} />; }
