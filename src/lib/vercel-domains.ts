/**
 * Vercel Domain API wrapper for multi-tenant domain management.
 * Adds/removes/verifies custom domains on the Vercel project.
 *
 * Requires env vars: VERCEL_API_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID
 */

const VERCEL_API = "https://api.vercel.com";

function getConfig() {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;

  if (!token || !projectId) {
    throw new Error("Missing VERCEL_API_TOKEN or VERCEL_PROJECT_ID env vars");
  }

  return { token, projectId, teamId };
}

function teamParam(teamId?: string): string {
  return teamId ? `?teamId=${teamId}` : "";
}

export interface VercelDomainResponse {
  name: string;
  verified: boolean;
  verification?: {
    type: string;
    domain: string;
    value: string;
    reason: string;
  }[];
  error?: { code: string; message: string };
}

/**
 * Add a domain to the Vercel project.
 * Returns domain config including any verification challenges.
 */
export async function addDomainToVercel(
  hostname: string
): Promise<VercelDomainResponse> {
  const { token, projectId, teamId } = getConfig();

  const res = await fetch(
    `${VERCEL_API}/v10/projects/${projectId}/domains${teamParam(teamId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: hostname }),
    }
  );

  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      data.error?.message || `Vercel API error: ${res.status}`
    );
  }

  return data;
}

/**
 * Remove a domain from the Vercel project.
 */
export async function removeDomainFromVercel(hostname: string): Promise<void> {
  const { token, projectId, teamId } = getConfig();

  const res = await fetch(
    `${VERCEL_API}/v10/projects/${projectId}/domains/${hostname}${teamParam(teamId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    const data = await res.json();
    throw new Error(
      data.error?.message || `Vercel API error: ${res.status}`
    );
  }
}

/**
 * Check verification status for a domain on the Vercel project.
 * Returns current domain config with verification details.
 */
export async function checkDomainVerification(
  hostname: string
): Promise<VercelDomainResponse> {
  const { token, projectId, teamId } = getConfig();

  const res = await fetch(
    `${VERCEL_API}/v10/projects/${projectId}/domains/${hostname}${teamParam(teamId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      data.error?.message || `Vercel API error: ${res.status}`
    );
  }

  return data;
}

/**
 * Trigger Vercel to re-verify a domain.
 */
export async function verifyDomainOnVercel(
  hostname: string
): Promise<VercelDomainResponse> {
  const { token, projectId, teamId } = getConfig();

  const res = await fetch(
    `${VERCEL_API}/v10/projects/${projectId}/domains/${hostname}/verify${teamParam(teamId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      data.error?.message || `Vercel API error: ${res.status}`
    );
  }

  return data;
}
