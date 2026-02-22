"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Users,
  UserPlus,
  Loader2,
  Shield,
  Calendar,
  ShoppingCart,
  BarChart3,
  Wallet,
  MoreVertical,
  Mail,
  Trash2,
  Pencil,
  Save,
} from "lucide-react";
import type { OrgUser } from "@/types/team";

const PERMISSION_CONFIG = [
  {
    key: "perm_events" as const,
    label: "Events",
    description: "Create/edit events, ticket types, artists, guest lists",
    icon: Calendar,
  },
  {
    key: "perm_orders" as const,
    label: "Orders",
    description: "View/manage orders, refunds, scan tickets, customers",
    icon: ShoppingCart,
  },
  {
    key: "perm_marketing" as const,
    label: "Marketing",
    description: "Analytics, reps, communications, discounts",
    icon: BarChart3,
  },
  {
    key: "perm_finance" as const,
    label: "Finance",
    description: "Payment settings, tax, org settings, branding",
    icon: Wallet,
  },
];

export default function UsersPage() {
  const [members, setMembers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Invite dialog state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    first_name: "",
    last_name: "",
    perm_events: false,
    perm_orders: false,
    perm_marketing: false,
    perm_finance: false,
  });
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editMember, setEditMember] = useState<OrgUser | null>(null);
  const [editPerms, setEditPerms] = useState({
    perm_events: false,
    perm_orders: false,
    perm_marketing: false,
    perm_finance: false,
  });
  const [editSaving, setEditSaving] = useState(false);

  // Actions dropdown
  const [actionsOpen, setActionsOpen] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch("/api/team");
      if (!res.ok) {
        if (res.status === 403) {
          setError("Only the org owner can manage team members");
          return;
        }
        throw new Error("Failed to load");
      }
      const { data } = await res.json();
      setMembers(data || []);
    } catch {
      setError("Failed to load team members");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Close actions menu on outside click
  useEffect(() => {
    if (!actionsOpen) return;
    const handler = () => setActionsOpen(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [actionsOpen]);

  const handleInvite = async () => {
    setInviting(true);
    setInviteError("");

    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inviteForm),
      });

      if (!res.ok) {
        const { error } = await res.json();
        setInviteError(error || "Failed to send invite");
        return;
      }

      setInviteOpen(false);
      setInviteForm({
        email: "",
        first_name: "",
        last_name: "",
        perm_events: false,
        perm_orders: false,
        perm_marketing: false,
        perm_finance: false,
      });
      fetchMembers();
    } catch {
      setInviteError("Failed to send invite");
    } finally {
      setInviting(false);
    }
  };

  const handleEdit = (member: OrgUser) => {
    setEditMember(member);
    setEditPerms({
      perm_events: member.perm_events,
      perm_orders: member.perm_orders,
      perm_marketing: member.perm_marketing,
      perm_finance: member.perm_finance,
    });
    setEditOpen(true);
    setActionsOpen(null);
  };

  const handleSaveEdit = async () => {
    if (!editMember) return;
    setEditSaving(true);

    try {
      const res = await fetch(`/api/team/${editMember.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editPerms),
      });

      if (!res.ok) {
        const { error } = await res.json();
        alert(error || "Failed to update");
        return;
      }

      setEditOpen(false);
      setEditMember(null);
      fetchMembers();
    } catch {
      alert("Failed to update permissions");
    } finally {
      setEditSaving(false);
    }
  };

  const handleRemove = async (member: OrgUser) => {
    if (!confirm(`Remove ${member.first_name} ${member.last_name} (${member.email}) from the team?`)) return;
    setActionsOpen(null);

    try {
      const res = await fetch(`/api/team/${member.id}`, { method: "DELETE" });
      if (!res.ok) {
        const { error } = await res.json();
        alert(error || "Failed to remove");
        return;
      }
      fetchMembers();
    } catch {
      alert("Failed to remove team member");
    }
  };

  const handleResendInvite = async (member: OrgUser) => {
    setActionsOpen(null);
    try {
      const res = await fetch(`/api/team/${member.id}/resend-invite`, {
        method: "POST",
      });
      if (!res.ok) {
        const { error } = await res.json();
        alert(error || "Failed to resend");
        return;
      }
      alert("Invite resent successfully");
    } catch {
      alert("Failed to resend invite");
    }
  };

  const getInitials = (m: OrgUser) => {
    const f = m.first_name?.[0] || "";
    const l = m.last_name?.[0] || "";
    return (f + l).toUpperCase() || m.email[0].toUpperCase();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Users size={20} className="text-primary" />
          <div>
            <h1 className="font-mono text-sm font-bold uppercase tracking-[2px] text-foreground">
              Users & Permissions
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Invite team members and manage their access
            </p>
          </div>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="gap-2" size="sm">
          <UserPlus size={14} />
          Invite
        </Button>
      </div>

      {/* Member list */}
      <div className="space-y-3">
        {members.map((member) => (
          <Card key={member.id} className={`border-border bg-card p-4 ${member.role === "owner" ? "ring-1 ring-primary/20" : ""}`}>
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                member.role === "owner"
                  ? "bg-primary/15 text-primary"
                  : "bg-muted-foreground/10 text-muted-foreground"
              }`}>
                {getInitials(member)}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {member.first_name} {member.last_name}
                  </span>
                  <Badge variant={member.role === "owner" ? "default" : "secondary"} className="text-[10px]">
                    {member.role === "owner" ? "Owner" : "Member"}
                  </Badge>
                  <Badge
                    variant={
                      member.status === "active"
                        ? "outline"
                        : member.status === "invited"
                        ? "secondary"
                        : "destructive"
                    }
                    className="text-[10px]"
                  >
                    {member.status === "active" ? "Active" : member.status === "invited" ? "Invited" : "Suspended"}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{member.email}</p>

                {/* Permissions */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {member.role === "owner" ? (
                    <span className="flex items-center gap-1 text-[11px] text-primary">
                      <Shield size={10} />
                      Full Access
                    </span>
                  ) : (
                    PERMISSION_CONFIG.filter((p) => member[p.key]).map((p) => (
                      <Badge key={p.key} variant="outline" className="text-[10px] text-muted-foreground">
                        {p.label}
                      </Badge>
                    ))
                  )}
                </div>
              </div>

              {/* Actions */}
              {member.role !== "owner" && (
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActionsOpen(actionsOpen === member.id ? null : member.id);
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <MoreVertical size={14} />
                  </Button>

                  {actionsOpen === member.id && (
                    <div
                      className="absolute right-0 top-8 z-20 w-44 rounded-lg border border-border bg-card py-1 shadow-lg"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => handleEdit(member)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-foreground/5"
                      >
                        <Pencil size={13} />
                        Edit Permissions
                      </button>
                      {member.status === "invited" && (
                        <button
                          onClick={() => handleResendInvite(member)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-foreground/5"
                        >
                          <Mail size={13} />
                          Resend Invite
                        </button>
                      )}
                      <Separator className="my-1" />
                      <button
                        onClick={() => handleRemove(member)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/5"
                      >
                        <Trash2 size={13} />
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        ))}

        {members.length === 0 && (
          <Card className="border-border bg-card p-8 text-center">
            <Users size={24} className="mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No team members yet</p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              Invite your first team member to get started
            </p>
          </Card>
        )}
      </div>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>
              Send an invite email to join your team with specific permissions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@example.com"
                value={inviteForm.email}
                onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="invite-first">First Name</Label>
                <Input
                  id="invite-first"
                  placeholder="First name"
                  value={inviteForm.first_name}
                  onChange={(e) => setInviteForm((f) => ({ ...f, first_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-last">Last Name</Label>
                <Input
                  id="invite-last"
                  placeholder="Last name"
                  value={inviteForm.last_name}
                  onChange={(e) => setInviteForm((f) => ({ ...f, last_name: e.target.value }))}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Permissions</Label>
              {PERMISSION_CONFIG.map((perm) => {
                const Icon = perm.icon;
                return (
                  <div key={perm.key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon size={14} className="text-muted-foreground" />
                      <div>
                        <span className="text-sm text-foreground">{perm.label}</span>
                        <p className="text-[11px] text-muted-foreground">{perm.description}</p>
                      </div>
                    </div>
                    <Switch
                      checked={inviteForm[perm.key]}
                      onCheckedChange={(checked) =>
                        setInviteForm((f) => ({ ...f, [perm.key]: checked }))
                      }
                    />
                  </div>
                );
              })}
            </div>

            {inviteError && (
              <p className="text-sm text-destructive">{inviteError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleInvite}
              disabled={inviting || !inviteForm.email || !inviteForm.first_name}
              className="gap-2"
            >
              {inviting ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
              Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Permissions Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Permissions</DialogTitle>
            <DialogDescription>
              {editMember && `Update permissions for ${editMember.first_name} ${editMember.last_name}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {PERMISSION_CONFIG.map((perm) => {
              const Icon = perm.icon;
              return (
                <div key={perm.key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon size={14} className="text-muted-foreground" />
                    <div>
                      <span className="text-sm text-foreground">{perm.label}</span>
                      <p className="text-[11px] text-muted-foreground">{perm.description}</p>
                    </div>
                  </div>
                  <Switch
                    checked={editPerms[perm.key]}
                    onCheckedChange={(checked) =>
                      setEditPerms((p) => ({ ...p, [perm.key]: checked }))
                    }
                  />
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={editSaving} className="gap-2">
              {editSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

