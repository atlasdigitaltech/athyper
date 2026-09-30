"use client";
import { createContext, useContext, useEffect, useRef } from "react";
import { PanelHeaderActions, type PanelHeaderCapabilities, type PanelHeaderAction } from "@athyper/platform-ui";
export const RecordPanelActionContext = createContext<{ section: string; recordLabel?: string; toolbarFirst?: boolean; capabilities?: PanelHeaderCapabilities; register: (section: string, action?: PanelHeaderAction) => void } | undefined>(undefined);
/** Keep callbacks current without re-registering on every parent render. */
export function useRecordPanelNewAction(action: PanelHeaderAction | undefined) {
  const context = useContext(RecordPanelActionContext), latest = useRef(action);
  latest.current = action;
  const register = context?.register, section = context?.section;
  const available = Boolean(action), label = action?.label, disabled = action?.disabled;
  useEffect(() => {
    if (!register || !section) return;
    register(section, available ? { label: label!, disabled, icon: latest.current!.icon, buttonRef:latest.current!.buttonRef,
      onClick: event => latest.current?.onClick?.(event) } : undefined);
    return () => register(section, undefined);
  }, [register, section, available, label, disabled]);
}

/** Full-view tools share the same commands as the compact side header. */
export function RecordPanelToolbarActions({omitNew=false}:{omitNew?:boolean}) {
 const context=useContext(RecordPanelActionContext);
 if(!context?.toolbarFirst || !context.capabilities)return null;
 const capabilities=omitNew ? {...context.capabilities,new:undefined} : context.capabilities;
 return <div className="a-panel-header__actions a-record-panel-toolbar-actions"><PanelHeaderActions capabilities={capabilities}/></div>;
}
