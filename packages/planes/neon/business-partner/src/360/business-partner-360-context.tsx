"use client";
import {createContext,useContext,type ReactNode} from "react";import type {RoleLens,Summary} from "./business-partner-360-client";
export interface BusinessPartner360State{readonly summary:Summary;readonly section:string;readonly roleLens:RoleLens;selectSection(code:string):void;selectRole(role:RoleLens):void;}
const Context=createContext<BusinessPartner360State|undefined>(undefined);export function BusinessPartner360Provider({value,children}:{readonly value:BusinessPartner360State;readonly children:ReactNode}){return <Context.Provider value={value}>{children}</Context.Provider>;}export function useBusinessPartner360(){const value=useContext(Context);if(!value)throw new Error("useBusinessPartner360 must be used inside BusinessPartner360Provider");return value;}
