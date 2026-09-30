"use client";
import React, { type ReactNode } from "react";
import { resolveIcon } from "@athyper/platform-icons";
export type SubsectionHeader = {
  readonly style: "accent";
  readonly icon: string;
};
/** Icon and emphasis are declared by section metadata. */
export function SubsectionHeading({
  header,
  children,
}: {
  header?: SubsectionHeader;
  children: ReactNode;
}) {
  const Icon = header ? resolveIcon(header.icon) : undefined;
  return (
    <>
      {Icon ? (
        <span className="a-subsection-header__icon" aria-hidden="true">
          <Icon />
        </span>
      ) : null}
      <span>{children}</span>
    </>
  );
}
