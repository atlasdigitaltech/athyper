"use client";
import React, {
  useRef,
  useState,
  type ReactNode,
  type ComponentType,
} from "react";
import {
  Drawer,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Button,
} from "@athyper/platform-ui";
import { CheckIcon, ChevronDownIcon } from "@athyper/platform-icons";
export * from "./filter-editor";
export * from "./filter-state";
export function CollectionDrawerHost<K extends string>({
  active,
  onSelect,
  onOpenChange,
  options,
  sections,
}: {
  active: K;
  onSelect: (key: K) => void;
  onOpenChange: (open: boolean) => void;
  options: readonly {
    key: K;
    label: string;
    description: string;
    Icon: ComponentType<{ size?: number }>;
  }[];
  sections: Partial<Record<K, ReactNode>>;
}) {
  const selector = useRef<HTMLSpanElement>(null),
    [visited, setVisited] = useState<readonly K[]>([active]);
  const current = options.find((o) => o.key === active) ?? options[0];
  if (!current) return null;
  const Icon = current.Icon;
  return (
    <Drawer.Root open onOpenChange={onOpenChange}>
      <Drawer.Panel
        size="wide"
        variant="task"
        mobilePresentation="fullscreen"
        className="a-entity-list__controls-drawer"
      >
        <Drawer.Header
          icon={<Icon />}
          title={
            <span ref={selector}>
              <Menu>
                <MenuTrigger
                  aria-label={`Switch list controls, current: ${current.label}`}
                >
                  {current.label}
                  <ChevronDownIcon size={16} />
                </MenuTrigger>
                <MenuContent>
                  {options.map((item) => (
                    <MenuItem
                      key={item.key}
                      aria-current={
                        item.key === current.key ? "true" : undefined
                      }
                      onClick={() => {
                        setVisited((v) =>
                          v.includes(item.key) ? v : [...v, item.key],
                        );
                        onSelect(item.key);
                        selector.current
                          ?.querySelector<HTMLButtonElement>("button")
                          ?.focus();
                      }}
                    >
                      <item.Icon size={18} />
                      {item.label}
                      {item.key === current.key ? (
                        <CheckIcon size={16} />
                      ) : null}
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
            </span>
          }
          description={current.description}
          closeLabel={`Close ${current.label.toLowerCase()}`}
        />
        <span className="a-visually-hidden" role="status">
          {current.label} controls
        </span>
        {options
          .filter((o) => visited.includes(o.key) || o.key === current.key)
          .map((item) => (
            <div
              key={item.key}
              hidden={item.key !== current.key}
              inert={item.key !== current.key}
              className={`a-entity-list__drawer-section a-entity-list__${item.key === "views" ? "manage-views" : item.key === "display" ? "display-settings" : item.key === "filters" ? "filter" : item.key}-drawer`}
              data-list-drawer={item.key}
            >
              {sections[item.key]}
            </div>
          ))}
      </Drawer.Panel>
    </Drawer.Root>
  );
}
export function CollectionDraftFooter({count,dirty,error,onReset,onCancel,onApply,summary,resetLabel="Reset",applyLabel="Apply",resetDisabled=false,applyDisabled=false,className}:{count?:number;dirty:boolean;error?:string;onReset:()=>void;onCancel?:()=>void;onApply:()=>void;summary?:ReactNode;resetLabel?:ReactNode;applyLabel?:ReactNode;resetDisabled?:boolean;applyDisabled?:boolean;className?:string}) {
 return <Drawer.Footer className={className}><Drawer.FooterSummary>{summary??<strong>{count===undefined?"Apply to refresh results":`${count} matching items`}</strong>}{error?<span role="alert">{error}</span>:null}</Drawer.FooterSummary><Drawer.FooterActions><Button variant="ghost" size="small" disabled={resetDisabled} onClick={onReset}>{resetLabel}</Button>{onCancel?<Button variant="secondary" size="small" onClick={onCancel}>Cancel</Button>:<Drawer.Close className="a-button a-button--secondary a-button--small">Cancel</Drawer.Close>}<Button size="small" disabled={!dirty||!!error||applyDisabled} onClick={onApply}>{applyLabel}</Button></Drawer.FooterActions></Drawer.Footer>;
}
