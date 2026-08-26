import { Eyebrow, Heading, PresentationCard, SupportingText } from "@athyper/platform-ui";

export const meshApplication = Object.freeze({ plane: "mesh", name: "Athyper Mesh", purpose: "Trusted network exchange" });

export function MeshApplicationSkeleton() {
  return <main className="a-application-skeleton"><PresentationCard aria-labelledby="application-title"><Eyebrow>MESH PLANE</Eyebrow><Heading id="application-title">{meshApplication.name}</Heading><SupportingText>The active frontend spine is ready for secure application capabilities.</SupportingText></PresentationCard></main>;
}
