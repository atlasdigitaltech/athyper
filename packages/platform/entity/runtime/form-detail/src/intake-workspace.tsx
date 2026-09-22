"use client";
import { PageLayout, type PageLayoutProps } from "@athyper/platform-shell";
import type { EntityIntakeSurfaceV1, IntakeWorkspaceLayout } from "@athyper/contract-platform-entity-runtime";
import { useState, type ReactNode } from "react";
import { useEntityIntake } from "./intake";

/** Generic intake composition. Metadata selects a valid layout; callers supply the already-authorized form and actions. */
export function EntityIntakeWorkspace({surface,sectionNavigation,children,guidance,status,actions}:{readonly surface:EntityIntakeSurfaceV1;readonly sectionNavigation:ReactNode;readonly children:ReactNode;readonly guidance?:ReactNode;/** Server-trusted request/record status; never inferred from form values. */readonly status?:ReactNode;/** Metadata-authorized Back, draft, continue and submit controls. */readonly actions?:ReactNode}) {
 const intake=useEntityIntake();
 const presentation=surface.presentation,initial=presentation?.defaultLayout??"content",[layout,setLayout]=useState<IntakeWorkspaceLayout>(initial);
 // Intake owns the authoritative adapter. Props remain a migration fallback for
 // non-intake surfaces, but cannot replace a mounted intake's state/actions.
 const workspaceStatus=intake?.workspace.status??status,workspaceActions=intake?.workspace.actions??actions;
 const allowed=presentation?.allowedLayouts??["content"];
 const active=allowed.includes(layout)?layout:initial;
 const help=guidance??(presentation?.guidance?<aside aria-label="Guidance"><h2>{presentation.guidance.title??"Guidance"}</h2>{presentation.guidance.description?<p>{presentation.guidance.description}</p>:null}</aside>:null);
 const props:PageLayoutProps=active==="content"?{variant:"content",children}:active==="sections-content"?{variant:"sections-content",sectionNavigation,children}:{variant:"sections-content-overview",sectionNavigation,overview:help,children};
 return <section className="a-intake-workspace" data-layout={active}>{allowed.length>1?<div className="a-intake-workspace__modes" aria-label="Layout">{allowed.map(mode=><button key={mode} type="button" aria-pressed={mode===active} onClick={()=>setLayout(mode)}>{mode.replaceAll("-"," ")}</button>)}</div>:null}{workspaceStatus?<div className="a-intake-workspace__status" role="status">{workspaceStatus}</div>:null}<PageLayout {...props}/>{workspaceActions?<div className="a-intake-workspace__footer" data-slot="intake-actions">{workspaceActions}</div>:null}</section>;
}
