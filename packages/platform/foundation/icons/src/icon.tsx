import * as React from "react";
import type { SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  readonly size?: number | string;
  readonly title?: string;
}

export function IconFrame({ size = 20, title, children, ...props }: IconProps & { readonly children: React.ReactNode }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? "img" : undefined} {...props}>{title ? <title>{title}</title> : null}{children}</svg>;
}
