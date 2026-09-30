"use client";
import { forwardRef, useImperativeHandle, useRef, type InputHTMLAttributes } from "react";
import { SearchIcon, CloseIcon } from "@athyper/platform-icons";

export type SearchFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "size"> & {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  onClear?: () => void;
  clearLabel?: string;
};

/** Controlled input only: filtering and submit behavior belong to the caller. */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField({label,value,onValueChange,onClear,clearLabel="Clear search",className="",disabled,readOnly,...props},ref) {
  const input=useRef<HTMLInputElement>(null);
  useImperativeHandle(ref,()=>input.current!);
  return <div className={`a-search-field ${className}`} data-disabled={disabled || undefined}>
    <SearchIcon size={18} aria-hidden="true"/>
    <input {...props} ref={input} type="text" role="searchbox" aria-label={label} value={value} disabled={disabled} readOnly={readOnly} onChange={event=>onValueChange(event.currentTarget.value)}/>
    {value && !readOnly ? <button type="button" disabled={disabled} aria-label={clearLabel} onClick={()=>{if(onClear)onClear();else onValueChange("");input.current?.focus({preventScroll:true});}}><CloseIcon size={16} aria-hidden="true"/></button>:null}
  </div>;
});
