import * as React from "react";
import type { ReactNode } from "react";
import { PresentationCard } from "@athyper/platform-ui/presentation";

export interface PublicIdentitySurfaceProps {
  readonly brand: ReactNode;
  readonly children: ReactNode;
  readonly footer: ReactNode;
  readonly labelledBy: string;
  readonly plane: string;
  readonly story: ReactNode;
}

export function PublicIdentitySurface({ brand, children, footer, labelledBy, plane, story }: PublicIdentitySurfaceProps) {
  return <main className="a-public-identity" data-plane={plane} aria-labelledby={labelledBy}>
    <aside className="a-public-identity__story">{story}</aside>
    <section className="a-public-identity__task">
      <header className="a-public-identity__header">{brand}</header>
      <section className="a-public-identity__stage"><PresentationCard>{children}</PresentationCard></section>
      <footer className="a-public-identity__footer">{footer}</footer>
    </section>
  </main>;
}
