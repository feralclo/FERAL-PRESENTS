import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/email/status
 *
 * Checks whether Resend is configured and the API key is valid.
 * Returns domain verification status so the admin can see it's live.
 */
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        configured: false,
        verified: false,
        domains: [],
        error: "RESEND_API_KEY environment variable is not set",
      });
    }

    const resend = new Resend(apiKey);

    // List domains to verify the key works and check domain verification
    const { data, error } = await resend.domains.list();

    if (error) {
      return NextResponse.json({
        configured: true,
        verified: false,
        domains: [],
        error: error.message || "Failed to verify API key",
      });
    }

    const domains = (data?.data || []).map((d) => ({
      name: d.name,
      status: d.status,
    }));

    const verifiedDomains = domains.filter((d) => d.status === "verified");

    return NextResponse.json({
      configured: true,
      verified: verifiedDomains.length > 0,
      domains,
    });
  } catch (err) {
    return NextResponse.json({
      configured: false,
      verified: false,
      domains: [],
      error: err instanceof Error ? err.message : "Status check failed",
    });
  }
}
