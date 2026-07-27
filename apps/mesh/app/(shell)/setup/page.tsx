"use client";
import { useRouter } from "next/navigation";
import { SetupDirectory } from "@athyper/setup-ui";
import { bffFetch } from "@/lib/bff-fetch";
export default function SetupRoute() {
  const router = useRouter();
  return <SetupDirectory plane="mesh" fetcher={bffFetch} navigate={(href) => router.push(href)} />;
}
