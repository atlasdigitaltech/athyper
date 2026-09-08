"use client";
import type {ReactNode} from "react";
import {usePathname} from "next/navigation";
import {NeonEntityApplication} from "@athyper/product-neon-list-view";
export function EntityApplicationLayout({entityCode,children}:{readonly entityCode:string;readonly children:ReactNode}) {
  return <NeonEntityApplication entityCode={entityCode} activePath={usePathname()}>{children}</NeonEntityApplication>;
}
