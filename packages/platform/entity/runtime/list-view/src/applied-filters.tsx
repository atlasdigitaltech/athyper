"use client";
import React, { useEffect, useId, useRef, useState } from "react";
import { CloseIcon } from "@athyper/platform-icons";
export interface AppliedFilterChip { key: string; label: string; title?: string; removeLabel?: string; onRemove: () => void; }
export function AppliedFilters({ chips, onClear }: { chips: readonly AppliedFilterChip[]; onClear: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [layout, setLayout] = useState({ visible: chips.length, height: 0 });
  const list = useRef<HTMLDivElement>(null), id = useId();
  const signature = chips.map(chip => chip.key + chip.label).join("|");
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const measure = () => {
      const children = [...element.children] as HTMLElement[];
      const tops = [...new Set(children.map(child => child.offsetTop))].sort((a,b) => a-b);
      const visible = children.filter(child => child.offsetTop < (tops[2] ?? Infinity)).length;
      const height = Math.max(0,...children.slice(0,visible).map(child => child.offsetTop + child.offsetHeight));
      setLayout(previous => previous.visible === visible && previous.height === height ? previous : {visible,height});
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [signature]);
  if (!chips.length) return null;
  const overflowing = layout.visible < chips.length;
  return <section className="a-applied-filters" aria-label="Applied filters">
    <span className="a-applied-filters__label">Applied filters</span>
    <div ref={list} id={id} className="a-applied-filters__list a-directory-filter__chips" style={!expanded && overflowing ? {maxHeight:layout.height} : undefined}>
      {chips.map((chip,index) => { const hidden = !expanded && overflowing && index >= layout.visible; return <button type="button" key={chip.key} title={chip.title ?? chip.label} aria-label={chip.removeLabel ?? `Remove ${chip.label} filter`} aria-hidden={hidden || undefined} tabIndex={hidden ? -1 : 0} style={hidden ? {visibility:"hidden"} : undefined} onClick={chip.onRemove}><span>{chip.label}</span><CloseIcon size={14}/></button>; })}
    </div>
    <div className="a-applied-filters__actions">{overflowing ? <button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>{expanded ? "Show less" : `Show all (${chips.length})`}</button> : null}<button type="button" onClick={onClear}>Clear all</button></div>
  </section>;
}
