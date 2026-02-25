import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { requirePlatformOwner } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

interface BetaApplication {
  id: string;
  company_name: string;
  email: string;
  event_types: string[];
  monthly_events: string | null;
  audience_size: string | null;
  status: "pending" | "accepted" | "rejected";
  invite_code?: string;
  applied_at: string;
  reviewed_at?: string;
}

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

const BETA_ACCESS_URL = "https://admin.entry.events/admin/beta/";

function buildAcceptanceEmail(app: BetaApplication): { subject: string; html: string } {
  const code = app.invite_code || "";

  return {
    subject: "You're in — your Entry invite code",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#08080c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:48px 24px;">

    <!-- Wordmark -->
    <div style="text-align:center;margin-bottom:40px;">
      <span style="font-family:'Courier New',monospace;font-size:24px;font-weight:bold;letter-spacing:6px;text-transform:uppercase;background:linear-gradient(135deg,#A78BFA,#8B5CF6,#7C3AED);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">ENTRY</span>
    </div>

    <!-- Main card -->
    <div style="background:#111117;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:40px 32px;">

      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#f0f0f5;line-height:1.3;">
        You've been accepted
      </h1>
      <p style="margin:0 0 28px;font-size:15px;color:#8888a0;line-height:1.6;">
        Your application for ${app.company_name} has been reviewed and approved. Welcome to Entry.
      </p>

      <!-- Invite code box -->
      <div style="background:#08080c;border:1px solid rgba(139,92,246,0.2);border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
        <p style="margin:0 0 8px;font-family:'Courier New',monospace;font-size:10px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:rgba(139,92,246,0.6);">
          Your invite code
        </p>
        <p style="margin:0;font-family:'Courier New',monospace;font-size:28px;font-weight:bold;color:#f0f0f5;letter-spacing:2px;">
          ${code}
        </p>
      </div>

      <!-- CTA button -->
      <div style="text-align:center;margin-bottom:28px;">
        <a href="${BETA_ACCESS_URL}" style="display:inline-block;background:linear-gradient(135deg,#8B5CF6,#7C3AED);color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:12px;">
          Get started now
        </a>
      </div>

      <!-- Steps -->
      <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:24px;">
        <p style="margin:0 0 16px;font-size:13px;font-weight:600;color:#f0f0f5;">How it works</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:0 12px 12px 0;vertical-align:top;width:24px;">
              <div style="width:20px;height:20px;border-radius:50%;background:rgba(139,92,246,0.1);color:#8B5CF6;font-size:11px;font-weight:700;text-align:center;line-height:20px;">1</div>
            </td>
            <td style="padding:0 0 12px;font-size:13px;color:#8888a0;line-height:1.5;">
              Enter your invite code on the access page
            </td>
          </tr>
          <tr>
            <td style="padding:0 12px 12px 0;vertical-align:top;">
              <div style="width:20px;height:20px;border-radius:50%;background:rgba(139,92,246,0.1);color:#8B5CF6;font-size:11px;font-weight:700;text-align:center;line-height:20px;">2</div>
            </td>
            <td style="padding:0 0 12px;font-size:13px;color:#8888a0;line-height:1.5;">
              Create your account and set up your brand
            </td>
          </tr>
          <tr>
            <td style="padding:0 12px 0 0;vertical-align:top;">
              <div style="width:20px;height:20px;border-radius:50%;background:rgba(139,92,246,0.1);color:#8B5CF6;font-size:11px;font-weight:700;text-align:center;line-height:20px;">3</div>
            </td>
            <td style="padding:0;font-size:13px;color:#8888a0;line-height:1.5;">
              Connect Stripe and start selling — takes 5 minutes
            </td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Footer -->
    <p style="text-align:center;margin-top:32px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:2px;color:rgba(255,255,255,0.15);">
      ENTRY &middot; YOUR EVENTS, YOUR BRAND
    </p>
  </div>
</body>
</html>`,
  };
}

/** Send acceptance email — fire and forget */
async function sendAcceptanceEmail(app: BetaApplication): Promise<void> {
  try {
    const resend = getResendClient();
    if (!resend) {
      console.log("[beta] RESEND_API_KEY not configured — skipping acceptance email");
      return;
    }

    const { subject, html } = buildAcceptanceEmail(app);

    const { error } = await resend.emails.send({
      from: "Entry <hello@mail.entry.events>",
      to: [app.email],
      subject,
      html,
    });

    if (error) {
      console.error("[beta] Failed to send acceptance email:", error);
    }
  } catch (err) {
    console.error("[beta] Acceptance email error:", err);
  }
}

/** GET — list all beta applications */
export async function GET() {
  const auth = await requirePlatformOwner();
  if (auth.error) return auth.error;

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data } = await supabase
    .from("site_settings")
    .select("data")
    .eq("key", "platform_beta_applications")
    .single();

  const applications = ((data?.data as BetaApplication[]) || []).sort(
    (a, b) =>
      new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime()
  );

  const stats = {
    total: applications.length,
    pending: applications.filter((a) => a.status === "pending").length,
    accepted: applications.filter((a) => a.status === "accepted").length,
    rejected: applications.filter((a) => a.status === "rejected").length,
  };

  return NextResponse.json({ applications, stats });
}

/** POST — accept or reject an application */
export async function POST(request: NextRequest) {
  const auth = await requirePlatformOwner();
  if (auth.error) return auth.error;

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { id, action } = await request.json();

  if (!id || !["accept", "reject"].includes(action)) {
    return NextResponse.json(
      { error: "Invalid request — need id and action (accept/reject)" },
      { status: 400 }
    );
  }

  // Load applications
  const { data: existing } = await supabase
    .from("site_settings")
    .select("data")
    .eq("key", "platform_beta_applications")
    .single();

  const applications = (existing?.data as BetaApplication[]) || [];
  const appIndex = applications.findIndex((a) => a.id === id);

  if (appIndex === -1) {
    return NextResponse.json(
      { error: "Application not found" },
      { status: 404 }
    );
  }

  const app = applications[appIndex];

  if (action === "accept") {
    // Generate a unique invite code for this applicant
    const code = `ENTRY-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    app.status = "accepted";
    app.invite_code = code;
    app.reviewed_at = new Date().toISOString();

    // Store the code in the invite codes list so it can be verified
    const { data: codesData } = await supabase
      .from("site_settings")
      .select("data")
      .eq("key", "platform_beta_invite_codes")
      .single();

    const codes = (codesData?.data as Record<string, unknown>[]) || [];
    codes.push({
      code,
      label: `Accepted: ${app.company_name}`,
      created_for: app.email,
      created_at: new Date().toISOString(),
      used: false,
      source: "application",
    });

    await supabase.from("site_settings").upsert(
      {
        key: "platform_beta_invite_codes",
        data: codes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
  } else {
    app.status = "rejected";
    app.reviewed_at = new Date().toISOString();
  }

  applications[appIndex] = app;

  await supabase.from("site_settings").upsert(
    {
      key: "platform_beta_applications",
      data: applications,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  // Send acceptance email (fire-and-forget — don't block the response)
  if (action === "accept") {
    sendAcceptanceEmail(app);
  }

  return NextResponse.json({
    success: true,
    application: app,
  });
}
