"use client";
import { Tooltip } from "@athyper/platform-ui";
import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";

/** Labels adapt to available row width; the accessible name stays stable. */
export function FileAction({ label, tooltipLabel, icon, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {label:string;tooltipLabel?:string;icon:ReactNode}) {
  const [dismissed, setDismissed] = useState(false);
  return <Tooltip portal label={tooltipLabel??label}><button {...props} type="button" data-tooltip-dismissed={dismissed || undefined}
    onClick={event=>{setDismissed(true);props.onClick?.(event);}}
    onPointerEnter={event=>{setDismissed(false);props.onPointerEnter?.(event);}}
    onKeyUp={event=>{if(event.key==="Tab")setDismissed(false);props.onKeyUp?.(event);}}
    className="a-file-action" aria-label={label}>{icon}<span className="a-file-action__label">{children??label}</span></button></Tooltip>;
}
