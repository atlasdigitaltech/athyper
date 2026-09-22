"use client";
import * as React from "react";

export function AtlasPanelResize({width, onWidthChange}: {readonly width:number; readonly onWidthChange:(width:number)=>void}) {
  return (
        <div className="athyper-atlas-workspace__resize" role="separator" tabIndex={0}
          aria-label="Resize Atlas" aria-orientation="vertical"
          aria-valuemin={360} aria-valuemax={560} aria-valuenow={width}
          onPointerDown={event => { event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerMove={event => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              onWidthChange(Math.max(360, Math.min(560, window.innerWidth - event.clientX)));
          }}
          onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)}
          onKeyDown={event => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            onWidthChange(event.key === "Home" ? 360 : event.key === "End" ? 560 : Math.max(360, Math.min(560, width + (event.key === "ArrowLeft" ? 20 : -20))));
          }} />
  );
}
