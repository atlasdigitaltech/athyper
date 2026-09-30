"use client";
import React, { createContext, useContext, type AnchorHTMLAttributes, type ReactNode } from "react";

const NavigationContext = createContext<((href: string) => void) | undefined>(undefined);
export function EntityNavigationProvider({ navigate, children }: { navigate?: (href: string) => void; children: ReactNode }) {
  const inherited = useContext(NavigationContext);
  return <NavigationContext.Provider value={navigate ?? inherited}>{children}</NavigationContext.Provider>;
}
export function useEntityNavigate() {
  const navigate = useContext(NavigationContext);
  return (href: string) => {
    const target = new URL(href, window.location.href);
    if (navigate && target.origin === window.location.origin) navigate(target.pathname + target.search + target.hash);
    else window.location.assign(href);
  };
}
/** Real hrefs preserve browser navigation, downloads and modified-click behavior. */
export function EntityLink({ onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const navigate = useContext(NavigationContext);
  return <a {...props} onClick={event => {
    onClick?.(event);
    if (!navigate || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
      (props.target && props.target !== "_self") || props.download !== undefined || !props.href) return;
    const target = new URL(props.href, window.location.href);
    if (target.origin !== window.location.origin) return;
    event.preventDefault();
    navigate(target.pathname + target.search + target.hash);
  }} />;
}
