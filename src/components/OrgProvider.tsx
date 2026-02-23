"use client";
import { createContext, useContext, type ReactNode } from "react";

const OrgContext = createContext<string>("feral");

export function OrgProvider({ orgId, children }: { orgId: string; children: ReactNode }) {
  return <OrgContext.Provider value={orgId}>{children}</OrgContext.Provider>;
}

export function useOrgId(): string {
  return useContext(OrgContext);
}
