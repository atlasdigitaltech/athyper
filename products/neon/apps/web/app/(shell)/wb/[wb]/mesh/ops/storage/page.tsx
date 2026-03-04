import { StubPage } from "@/components/stubs/StubPage";

export default function StoragePage() {
    return (
        <StubPage
            epic={9}
            title="Object Storage Management"
            description="Manage MinIO buckets, object lifecycle policies, storage quotas, and access configurations."
            route="/wb/:wb/mesh/ops/storage"
        />
    );
}
