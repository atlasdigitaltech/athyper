"use client";

import { useParams } from "next/navigation";

import { PolicyExplorer } from "@/components/mesh/policies/PolicyExplorer";

export default function PolicyStudioPage() {
    const { wb } = useParams<{ wb: string }>();
    const basePath = `/wb/${wb}/mesh/policy-studio`;

    return <PolicyExplorer basePath={basePath} />;
}
