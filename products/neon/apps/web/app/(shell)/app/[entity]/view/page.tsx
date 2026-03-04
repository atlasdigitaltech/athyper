import { StubPage } from "@/components/stubs/StubPage";

export default function EntityViewsPage() {
    return <StubPage epic={5} title="Entity Views" description="Browse entity records using different view types." route="/app/:entity/view" />;
}
