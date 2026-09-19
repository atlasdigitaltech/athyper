import { Card } from "@athyper/platform-ui";
import { RelatedSection } from "./related-section";
export function PrimaryDetails({
  provider,
  label,
}: {
  provider: "primary-contact" | "primary-address";
  label: string;
}) {
  const code = provider === "primary-contact" ? "contacts" : "addresses";
  return (
    <Card className={`bp360-primary-card bp360-primary-card--${provider}`}>
      <h2>{label}</h2>
      <RelatedSection code={code} compact />
    </Card>
  );
}
