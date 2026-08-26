import { Eyebrow, Heading, PresentationCard, SupportingText } from "@athyper/platform-ui";

export const studioApplication = Object.freeze({ plane: "studio", name: "Athyper Studio", purpose: "Platform control and authoring" });

export function StudioApplicationSkeleton() {
  return <main className="a-application-skeleton"><PresentationCard aria-labelledby="application-title"><Eyebrow>STUDIO PLANE</Eyebrow><Heading id="application-title">{studioApplication.name}</Heading><SupportingText>The active frontend spine is ready for secure application capabilities.</SupportingText></PresentationCard></main>;
}
