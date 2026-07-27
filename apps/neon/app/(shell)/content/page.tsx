"use client";
import { ContentHub } from "@athyper/content-hub-ui";
import { bffFetch } from "@/lib/bff-fetch";
const adapter = { plane: "neon", endpoint: "/api/relay/platform/content-hub?plane=neon", projection: "CMS and business content" } as const;
export default function ContentRoute() { return <ContentHub adapter={adapter} fetcher={bffFetch} />; }
