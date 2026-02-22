"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Shield, AlertTriangle, Loader2 } from "lucide-react";

export default function PlatformSettings() {
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmReset, setConfirmReset] = useState("");
  const [status, setStatus] = useState("");
  const router = useRouter();

  // Verify platform owner access client-side
  useEffect(() => {
    (async () => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) {
          router.replace("/admin/");
          return;
        }
        const { data } = await supabase.auth.getUser();
        if (data.user?.app_metadata?.is_platform_owner === true) {
          setIsPlatformOwner(true);
        } else {
          router.replace("/admin/");
        }
      } catch {
        router.replace("/admin/");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const handleResetTraffic = useCallback(async () => {
    if (confirmReset !== "RESET") {
      setStatus('Type "RESET" to confirm');
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus("Error: Supabase not configured");
      return;
    }
    const { error } = await supabase
      .from(TABLES.TRAFFIC_EVENTS)
      .delete()
      .neq("id", 0);

    if (error) {
      setStatus(`Error: ${error.message}`);
    } else {
      setStatus("Traffic data reset successfully");
      setConfirmReset("");
    }
  }, [confirmReset]);

  const handleResetPopups = useCallback(async () => {
    if (confirmReset !== "RESET") {
      setStatus('Type "RESET" to confirm');
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus("Error: Supabase not configured");
      return;
    }
    const { error } = await supabase
      .from(TABLES.POPUP_EVENTS)
      .delete()
      .neq("id", 0);

    if (error) {
      setStatus(`Error: ${error.message}`);
    } else {
      setStatus("Popup data reset successfully");
      setConfirmReset("");
    }
  }, [confirmReset]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isPlatformOwner) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div className="flex items-center gap-3">
        <Shield size={20} className="text-warning" />
        <div>
          <h1 className="font-mono text-sm font-bold uppercase tracking-[2px] text-foreground">
            Platform Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Platform owner controls — not visible to tenant admins
          </p>
        </div>
      </div>

      <Card className="border-destructive/30 bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle size={16} className="text-destructive" />
          <h2 className="font-mono text-xs font-semibold uppercase tracking-[2px] text-destructive">
            Danger Zone
          </h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          These actions cannot be undone. Type &quot;RESET&quot; to confirm.
        </p>

        <div className="space-y-4">
          <Input
            value={confirmReset}
            onChange={(e) => setConfirmReset(e.target.value)}
            placeholder='Type "RESET" to confirm'
            className="max-w-xs"
          />

          <div className="flex gap-3">
            <Button
              variant={confirmReset === "RESET" ? "destructive" : "secondary"}
              onClick={handleResetTraffic}
              disabled={confirmReset !== "RESET"}
            >
              Reset Traffic Data
            </Button>
            <Button
              variant={confirmReset === "RESET" ? "destructive" : "secondary"}
              onClick={handleResetPopups}
              disabled={confirmReset !== "RESET"}
            >
              Reset Popup Data
            </Button>
          </div>

          {status && (
            <p
              className={`text-sm ${
                status.includes("Error") ? "text-destructive" : "text-success"
              }`}
            >
              {status}
            </p>
          )}
        </div>
      </Card>

      <Separator />

      <Card className="border-border bg-card p-6">
        <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-[2px] text-foreground">
          Platform Info
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-1.5">
            <span className="text-muted-foreground">Platform</span>
            <span className="text-foreground">Entry</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-muted-foreground">Framework</span>
            <span className="text-foreground">Next.js (App Router)</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-muted-foreground">Database</span>
            <span className="text-foreground">Supabase (PostgreSQL)</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-muted-foreground">Hosting</span>
            <span className="text-foreground">Vercel</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-muted-foreground">Payments</span>
            <span className="text-foreground">Stripe (Connect)</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-muted-foreground">Email</span>
            <span className="text-foreground">Resend</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
