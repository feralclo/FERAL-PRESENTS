"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useOnboarding } from "./_state";
import { WizardShell } from "./_components/Shell";
import { BrandPreview } from "./_components/BrandPreview";
import { IdentitySection } from "./_components/sections/IdentitySection";
import { BrandingSection } from "./_components/sections/BrandingSection";
import { FinishSection } from "./_components/sections/FinishSection";
import { getSupabaseClient } from "@/lib/supabase/client";
import "@/styles/tailwind.css";
import "@/styles/admin.css";

/**
 * Onboarding wizard — three steps then dashboard.
 *
 * Auth gating: unauthenticated → /admin/signup. Already-onboarded users land
 * at the Finish step which has explicit "Open dashboard" CTAs. Reactive
 * redirects on completed_at were causing users to be bounced mid-wizard so
 * we never auto-redirect — the wizard is always the right place to be.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const api = useOnboarding();
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/check-org");
        const json = await res.json();

        if (cancelled) return;

        if (!json.authenticated) {
          router.replace("/admin/signup/");
          return;
        }

        // We never redirect logged-in users away from /admin/onboarding/ —
        // if they already finished, the wizard resumes at the Finish section,
        // which has explicit "Open dashboard" CTAs. A reactive redirect on
        // `completed_at` was causing users to be bounced mid-wizard the moment
        // any code path set that flag.
        setAuthReady(true);

        // Track invite-code usage for OAuth signups (mirrors old page).
        const inviteCode = sessionStorage.getItem("entry_beta_invite");
        if (inviteCode) {
          const supabase = getSupabaseClient();
          const email = supabase ? (await supabase.auth.getUser()).data.user?.email : undefined;
          fetch("/api/beta/track-usage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: inviteCode, email: email || "" }),
          }).catch(() => {});
          sessionStorage.removeItem("entry_beta_invite");
        }
      } catch {
        if (!cancelled) router.replace("/admin/signup/");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!authReady || api.loading) {
    return <FullPageLoader />;
  }

  const sectionNode = (() => {
    switch (api.current) {
      case "identity":
        return <IdentitySection api={api} />;
      case "branding":
        return <BrandingSection api={api} />;
      case "finish":
        return <FinishSection api={api} />;
      default:
        return <IdentitySection api={api} />;
    }
  })();

  return (
    <WizardShell
      api={api}
      showPreview
      preview={<BrandPreview state={api.state} />}
    >
      {sectionNode}
    </WizardShell>
  );
}

function FullPageLoader() {
  return (
    <div data-admin className="flex min-h-screen items-center justify-center bg-background">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]" />
      </div>
      <div className="flex flex-col items-center gap-4">
        <span
          className="font-mono text-[36px] font-bold uppercase tracking-[8px] select-none"
          style={{
            background: "linear-gradient(135deg, #A78BFA, #8B5CF6, #7C3AED)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Entry
        </span>
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}
