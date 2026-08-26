import { Eyebrow, Heading, PresentationCard, SupportingText } from "@athyper/platform-ui";

export const neonApplication = Object.freeze({ plane: "neon", name: "Athyper Neon", purpose: "Enterprise operations" });

export function NeonApplicationSkeleton() {
  return <main className="a-application-skeleton"><PresentationCard aria-labelledby="application-title"><Eyebrow>NEON PLANE</Eyebrow><Heading id="application-title">{neonApplication.name}</Heading><SupportingText>The active frontend spine is ready for secure application capabilities.</SupportingText></PresentationCard></main>;
}
