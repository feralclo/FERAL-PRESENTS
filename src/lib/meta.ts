import { createHash } from "crypto";
import type { MetaEventPayload } from "@/types/marketing";
import type { MarketingSettings } from "@/types/marketing";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SETTINGS_KEYS } from "@/lib/constants";

const META_API_VERSION = "v22.0";

/** SHA-256 hash a value (lowercase, trimmed) per Meta's normalization rules */
export function hashSHA256(value: string): string {
  return createHash("sha256")
    .update(value.toLowerCase().trim())
    .digest("hex");
}

/** Fetch marketing settings from Supabase (server-side) */
export async function fetchMarketingSettings(): Promise<MarketingSettings | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/site_settings?key=eq.${encodeURIComponent(SETTINGS_KEYS.MARKETING)}&select=data`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        cache: "no-store",
      }
    );

    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows || rows.length === 0) return null;
    return rows[0].data as MarketingSettings;
  } catch {
    return null;
  }
}

/**
 * Send events to Meta's Conversions API.
 * @returns The Meta API response or null on failure
 */
export async function sendMetaEvents(
  pixelId: string,
  accessToken: string,
  events: MetaEventPayload[],
  testEventCode?: string
): Promise<{ events_received?: number; messages?: string[]; error?: string } | null> {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${pixelId}/events`;

  const body: Record<string, unknown> = {
    data: events,
    access_token: accessToken,
  };

  if (testEventCode) {
    body.test_event_code = testEventCode;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await res.json();

    if (!res.ok) {
      return {
        error: json?.error?.message || `Meta API error: ${res.status}`,
      };
    }

    return json;
  } catch (e) {
    return { error: (e as Error).message };
  }
}
