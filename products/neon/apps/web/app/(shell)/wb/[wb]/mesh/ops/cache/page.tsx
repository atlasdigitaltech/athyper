import { StubPage } from "@/components/stubs/StubPage";

export default function CachePage() {
    return (
        <StubPage
            epic={9}
            title="Cache Management"
            description="Monitor Redis instances, inspect cache keys, manage eviction policies, and view memory utilization."
            route="/wb/:wb/mesh/ops/cache"
        />
    );
}
