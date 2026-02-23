import { headers } from "next/headers";
import { ORG_ID } from "@/lib/constants";

/** Get org_id for current request. Reads x-org-id header set by middleware. */
export async function getOrgId(): Promise<string> {
  try {
    const h = await headers();
    return h.get("x-org-id") || ORG_ID;
  } catch {
    return ORG_ID; // Outside request context (build time)
  }
}

/** Sync version for API routes that have NextRequest. */
export function getOrgIdFromRequest(request: { headers: { get(name: string): string | null } }): string {
  return request.headers.get("x-org-id") || ORG_ID;
}
