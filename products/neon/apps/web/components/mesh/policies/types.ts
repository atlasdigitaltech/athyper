// components/mesh/policies/types.ts
//
// Types for policy studio.

export interface PolicySummary {
    id: string;
    name: string;
    description: string | null;
    scopeType: "global" | "module" | "entity" | "entity_version";
    scopeKey: string | null;
    isActive: boolean;
    currentVersion: {
        id: string;
        versionNo: number;
        status: "draft" | "published" | "archived";
        ruleCount: number;
        publishedAt: string | null;
    } | null;
    createdAt: string;
    updatedAt: string | null;
}
