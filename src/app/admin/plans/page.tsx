"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { fmtMoney } from "@/lib/format";
import { Loader2, Check, Zap, Rocket } from "lucide-react";

interface OrgPlanRow {
  org_id: string;
  plan_id: string;
  plan_name: string;
  fee_percent: number;
  min_fee: number;
  billing_waived: boolean;
  assigned_at: string | null;
}

interface PlanDef {
  id: string;
  name: string;
  description: string;
  monthly_price: number;
  fee_percent: number;
  min_fee: number;
  features: string[];
}

export function PlansPage() {
  const [orgs, setOrgs] = useState<OrgPlanRow[]>([]);
  const [plans, setPlans] = useState<Record<string, PlanDef>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState("");

  // Pending edits: org_id → { plan_id, billing_waived }
  const [edits, setEdits] = useState<
    Record<string, { plan_id: string; billing_waived: boolean }>
  >({});

  useEffect(() => {
    fetch("/api/plans")
      .then((res) => res.json())
      .then((json) => {
        if (json.data) setOrgs(json.data);
        if (json.plans) setPlans(json.plans);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const getEdit = (org: OrgPlanRow) =>
    edits[org.org_id] ?? {
      plan_id: org.plan_id,
      billing_waived: org.billing_waived,
    };

  const setEdit = (orgId: string, field: string, value: unknown) => {
    setEdits((prev) => ({
      ...prev,
      [orgId]: { ...getEditForId(orgId), [field]: value },
    }));
  };

  const getEditForId = (orgId: string) => {
    const org = orgs.find((o) => o.org_id === orgId);
    return (
      edits[orgId] ?? {
        plan_id: org?.plan_id ?? "starter",
        billing_waived: org?.billing_waived ?? false,
      }
    );
  };

  const isDirty = (org: OrgPlanRow) => {
    const edit = edits[org.org_id];
    if (!edit) return false;
    return (
      edit.plan_id !== org.plan_id ||
      edit.billing_waived !== org.billing_waived
    );
  };

  const handleSave = async (orgId: string) => {
    const edit = getEditForId(orgId);
    setSaving(orgId);
    setSaveMsg("");

    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          plan_id: edit.plan_id,
          billing_waived: edit.billing_waived,
        }),
      });

      if (res.ok) {
        // Refresh data
        const refreshRes = await fetch("/api/plans");
        const refreshJson = await refreshRes.json();
        if (refreshJson.data) setOrgs(refreshJson.data);
        // Clear this edit
        setEdits((prev) => {
          const next = { ...prev };
          delete next[orgId];
          return next;
        });
        setSaveMsg(`Saved ${orgId}`);
      } else {
        const json = await res.json();
        setSaveMsg(`Error: ${json.error}`);
      }
    } catch {
      setSaveMsg("Network error");
    }

    setSaving(null);
    setTimeout(() => setSaveMsg(""), 3000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin text-primary/60" />
        <span className="ml-3 text-sm text-muted-foreground">
          Loading plans...
        </span>
      </div>
    );
  }

  const planList = Object.values(plans);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          Platform Plans
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Define fee tiers and assign orgs to plans. Monthly billing collection
          is not yet implemented.
        </p>
      </div>

      {saveMsg && (
        <div
          className={`rounded-md border px-4 py-2.5 text-sm ${
            saveMsg.includes("Error") || saveMsg.includes("error")
              ? "border-destructive/20 bg-destructive/5 text-destructive"
              : "border-success/20 bg-success/5 text-success"
          }`}
        >
          {saveMsg}
        </div>
      )}

      {/* Plan Definition Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {planList.map((plan) => {
          const Icon = plan.id === "pro" ? Rocket : Zap;
          return (
            <Card key={plan.id} className="py-0 gap-0">
              <CardHeader className="px-6 pt-5 pb-3">
                <div className="flex items-center gap-2">
                  <Icon
                    size={16}
                    className={
                      plan.id === "pro"
                        ? "text-primary"
                        : "text-muted-foreground"
                    }
                  />
                  <CardTitle className="text-sm">{plan.name}</CardTitle>
                  {plan.id === "pro" && (
                    <Badge variant="default" className="text-[10px]">
                      Recommended
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {plan.description}
                </p>
              </CardHeader>
              <CardContent className="px-6 pb-6 space-y-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-foreground">
                    {plan.monthly_price === 0
                      ? "Free"
                      : fmtMoney(plan.monthly_price / 100).replace(/\.00$/, "")}
                  </span>
                  {plan.monthly_price > 0 && (
                    <span className="text-xs text-muted-foreground">
                      /month
                    </span>
                  )}
                </div>
                <div className="rounded-md border border-border/50 bg-muted/20 p-3">
                  <p className="text-xs font-medium text-foreground">
                    {plan.fee_percent}% + {fmtMoney(plan.min_fee / 100)} min
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Per transaction platform fee
                  </p>
                </div>
                <ul className="space-y-1.5">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <Check size={12} className="text-success shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Org Assignments Table */}
      <Card className="py-0 gap-0">
        <CardHeader className="px-6 pt-5 pb-4">
          <CardTitle className="text-sm">Org Plan Assignments</CardTitle>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Org</th>
                  <th className="pb-2 pr-4 font-medium">Plan</th>
                  <th className="pb-2 pr-4 font-medium">Fees</th>
                  <th className="pb-2 pr-4 font-medium">Billing Waived</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {orgs.map((org) => {
                  const edit = getEdit(org);
                  const editPlan =
                    plans[edit.plan_id] ?? plans["starter"];
                  const dirty = isDirty(org);

                  return (
                    <tr key={org.org_id}>
                      <td className="py-3 pr-4">
                        <span className="font-mono text-xs text-foreground">
                          {org.org_id}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <Select
                          value={edit.plan_id}
                          onValueChange={(v) =>
                            setEdit(org.org_id, "plan_id", v)
                          }
                        >
                          <SelectTrigger className="w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {planList.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-xs text-muted-foreground">
                          {editPlan?.fee_percent}% + {fmtMoney((editPlan?.min_fee ?? 50) / 100)} min
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={edit.billing_waived}
                            onCheckedChange={(v) =>
                              setEdit(org.org_id, "billing_waived", v)
                            }
                          />
                          <Label className="text-xs text-muted-foreground">
                            {edit.billing_waived ? "Waived" : "Active"}
                          </Label>
                        </div>
                      </td>
                      <td className="py-3">
                        <Button
                          size="sm"
                          disabled={!dirty || saving === org.org_id}
                          onClick={() => handleSave(org.org_id)}
                        >
                          {saving === org.org_id ? (
                            <Loader2
                              size={14}
                              className="animate-spin"
                            />
                          ) : (
                            "Save"
                          )}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {orgs.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No organizations found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default PlansPage;
