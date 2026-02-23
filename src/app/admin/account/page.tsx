"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  User,
  Shield,
  Lock,
  Save,
  Loader2,
  Check,
  Eye,
  EyeOff,
} from "lucide-react";

interface AccountData {
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  perm_events: boolean;
  perm_orders: boolean;
  perm_marketing: boolean;
  perm_finance: boolean;
  created_at: string | null;
  has_google: boolean;
  has_password: boolean;
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function AccountPage() {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileStatus, setProfileStatus] = useState("");

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/account");
        if (res.ok) {
          const data: AccountData = await res.json();
          setAccount(data);
          setFirstName(data.first_name);
          setLastName(data.last_name);
        }
      } catch {
        // Fetch failed
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileStatus("");
    try {
      const res = await fetch("/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name: firstName, last_name: lastName }),
      });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || "Failed to save");
      }
      setProfileStatus("Profile saved");
      setAccount((prev) =>
        prev ? { ...prev, first_name: firstName, last_name: lastName } : prev
      );
    } catch (err) {
      setProfileStatus(
        err instanceof Error ? err.message : "Error saving profile"
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdatePassword = async () => {
    setPasswordStatus("");

    if (newPassword.length < 8) {
      setPasswordStatus("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus("Passwords do not match");
      return;
    }

    setSavingPassword(true);
    try {
      const body: Record<string, string> = { new_password: newPassword };
      if (account?.has_password) {
        body.current_password = currentPassword;
      }

      const res = await fetch("/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || "Failed to update password");
      }

      setPasswordStatus("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      // User now has a password
      setAccount((prev) => (prev ? { ...prev, has_password: true } : prev));
    } catch (err) {
      setPasswordStatus(
        err instanceof Error ? err.message : "Error updating password"
      );
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">
          Failed to load account data
        </p>
      </div>
    );
  }

  const initials = [account.first_name, account.last_name]
    .filter(Boolean)
    .map((n) => n.charAt(0).toUpperCase())
    .join("");
  const avatarInitials = initials || account.email.charAt(0).toUpperCase();

  const PERMISSIONS = [
    { key: "perm_events", label: "Events" },
    { key: "perm_orders", label: "Orders" },
    { key: "perm_marketing", label: "Marketing" },
    { key: "perm_finance", label: "Finance" },
  ] as const;

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <User size={20} className="text-primary" />
        <div>
          <h1 className="font-mono text-sm font-bold uppercase tracking-[2px] text-foreground">
            Account
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your profile and security settings
          </p>
        </div>
      </div>

      {/* ── Profile Card ── */}
      <Card className="border-border bg-card p-6">
        <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-[2px] text-foreground">
          Profile
        </h2>

        <div className="space-y-5">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/60 to-primary/25 text-lg font-bold text-white ring-1 ring-primary/20">
              {avatarInitials}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {[account.first_name, account.last_name]
                  .filter(Boolean)
                  .join(" ") || "No name set"}
              </p>
              <p className="text-xs text-muted-foreground">{account.email}</p>
            </div>
          </div>

          <Separator />

          {/* Name fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="first-name">First Name</Label>
              <Input
                id="first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                maxLength={50}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last-name">Last Name</Label>
              <Input
                id="last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                maxLength={50}
              />
            </div>
          </div>

          {/* Email (read-only) */}
          <div className="space-y-2">
            <Label>Email</Label>
            <p className="text-sm text-foreground">{account.email}</p>
            <p className="text-xs text-muted-foreground">
              Managed by your authentication provider
            </p>
          </div>

          {/* Save profile */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="gap-2"
            >
              {savingProfile ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              Save Changes
            </Button>
            {profileStatus && (
              <span
                className={`text-sm ${
                  profileStatus.includes("saved")
                    ? "text-success"
                    : "text-destructive"
                }`}
              >
                {profileStatus}
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* ── Security Card ── */}
      <Card className="border-border bg-card p-6">
        <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-[2px] text-foreground">
          Security
        </h2>

        <div className="space-y-6">
          {/* Password section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Lock size={14} className="text-muted-foreground" />
              <h3 className="text-sm font-medium text-foreground">
                {account.has_password ? "Change Password" : "Set Password"}
              </h3>
            </div>

            {account.has_password && (
              <div className="space-y-2">
                <Label htmlFor="current-password">Current Password</Label>
                <div className="relative">
                  <Input
                    id="current-password"
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showCurrentPassword ? (
                      <EyeOff size={14} />
                    ) : (
                      <Eye size={14} />
                    )}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNewPassword ? (
                    <EyeOff size={14} />
                  ) : (
                    <Eye size={14} />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
              />
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={handleUpdatePassword}
                disabled={savingPassword || !newPassword || !confirmPassword}
                variant="secondary"
                className="gap-2"
              >
                {savingPassword ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Lock size={14} />
                )}
                {account.has_password ? "Update Password" : "Set Password"}
              </Button>
              {passwordStatus && (
                <span
                  className={`text-sm ${
                    passwordStatus.includes("updated")
                      ? "text-success"
                      : "text-destructive"
                  }`}
                >
                  {passwordStatus}
                </span>
              )}
            </div>
          </div>

          <Separator />

          {/* Connected accounts */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">
              Connected Accounts
            </h3>
            <div className="flex items-center justify-between rounded-lg border border-border bg-background/50 px-4 py-3">
              <div className="flex items-center gap-3">
                <GoogleIcon className="h-4 w-4" />
                <div>
                  <p className="text-sm font-medium text-foreground">Google</p>
                  {account.has_google && (
                    <p className="text-xs text-muted-foreground">
                      {account.email}
                    </p>
                  )}
                </div>
              </div>
              {account.has_google ? (
                <Badge
                  variant="outline"
                  className="border-success/30 bg-success/10 text-success"
                >
                  <Check size={10} className="mr-1" />
                  Connected
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Not connected
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Role & Permissions Card ── */}
      <Card className="border-border bg-card p-6">
        <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-[2px] text-foreground">
          Role &amp; Permissions
        </h2>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Shield size={14} className="text-muted-foreground" />
            <Badge
              variant={account.role === "owner" ? "default" : "secondary"}
            >
              {account.role === "owner" ? "Owner" : "Member"}
            </Badge>
          </div>

          {account.role === "owner" ? (
            <p className="text-sm text-muted-foreground">
              Full access to all features
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {PERMISSIONS.map(({ key, label }) => {
                  const enabled = account[key];
                  return (
                    <Badge
                      key={key}
                      variant={enabled ? "default" : "outline"}
                      className={
                        enabled
                          ? ""
                          : "border-border text-muted-foreground opacity-50"
                      }
                    >
                      {label}
                    </Badge>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Contact your organisation owner to change permissions
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
