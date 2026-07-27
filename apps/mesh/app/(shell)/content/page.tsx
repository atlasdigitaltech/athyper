"use client";
import { ContentHub } from "@athyper/content-hub-ui";
import { bffFetch } from "@/lib/bff-fetch";
const adapter = { plane: "mesh", endpoint: "/api/relay/platform/content-hub?plane=mesh", projection: "Partner-safe exchange content" } as const;
export default function ContentRoute() { return <ContentHub adapter={adapter} fetcher={bffFetch} />; }
