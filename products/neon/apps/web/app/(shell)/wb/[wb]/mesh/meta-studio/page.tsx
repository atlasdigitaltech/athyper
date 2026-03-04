"use client";

import { useParams } from "next/navigation";

import { SchemaExplorer } from "@/components/mesh/schemas/SchemaExplorer";

export default function SchemasPage() {
    const { wb } = useParams<{ wb: string }>();
    const basePath = `/wb/${wb}/mesh/meta-studio`;

    return <SchemaExplorer basePath={basePath} />;
}
