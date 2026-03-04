"use client";

import { useParams } from "next/navigation";

import { PolicyDetailView } from "@/components/mesh/policies/PolicyDetailView";

export default function PolicyDetailPage() {
    const { wb, policy } = useParams<{ wb: string; policy: string }>();
    const backHref = `/wb/${wb}/mesh/policy-studio`;

    return <PolicyDetailView policyId={policy} backHref={backHref} />;
}
