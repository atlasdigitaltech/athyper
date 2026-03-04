"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function EntityOverviewPage() {
    const { wb, entity } = useParams<{ wb: string; entity: string }>();
    const router = useRouter();

    // Redirect to the Fields tab as the default view
    useEffect(() => {
        router.replace(`/wb/${wb}/mesh/meta-studio/${entity}/fields`);
    }, [wb, entity, router]);

    return null;
}
