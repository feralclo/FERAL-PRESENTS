"use client";

import { useState, useEffect, useCallback } from "react";
import { useOrgId } from "@/components/OrgProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Domain } from "@/types/domains";
import {
  Globe,
  Plus,
  Trash2,
  RefreshCw,
  Star,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";

export default function DomainsSettings() {
  const orgId = useOrgId();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [newHostname, setNewHostname] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch("/api/domains");
      if (res.ok) {
        const { domains: data } = await res.json();
        setDomains(data || []);
      }
    } catch {
      // Ignore fetch errors on load
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  const handleAdd = async () => {
    const hostname = newHostname.trim().toLowerCase();
    if (!hostname) return;

    setAdding(true);
    setError("");

    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostname }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add domain");
        return;
      }

      setNewHostname("");
      await fetchDomains();
    } catch {
      setError("Failed to add domain");
    } finally {
      setAdding(false);
    }
  };

  const handleVerify = async (id: string) => {
    setVerifying(id);
    try {
      const res = await fetch(`/api/domains/${id}/verify`, { method: "POST" });
      if (res.ok) {
        await fetchDomains();
      }
    } catch {
      // Ignore
    } finally {
      setVerifying(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this domain? This cannot be undone.")) return;

    setDeleting(id);
    try {
      const res = await fetch(`/api/domains/${id}`, { method: "DELETE" });
      if (res.ok) {
        await fetchDomains();
      }
    } catch {
      // Ignore
    } finally {
      setDeleting(null);
    }
  };

  const handleSetPrimary = async (id: string) => {
    try {
      await fetch(`/api/domains/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_primary: true }),
      });
      await fetchDomains();
    } catch {
      // Ignore
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const statusBadge = (status: Domain["status"]) => {
    const variants: Record<string, string> = {
      active: "bg-success/10 text-success border-success/20",
      pending: "bg-warning/10 text-warning border-warning/20",
      failed: "bg-destructive/10 text-destructive border-destructive/20",
      removing: "bg-muted-foreground/10 text-muted-foreground border-muted-foreground/20",
    };
    return (
      <Badge variant="outline" className={variants[status] || ""}>
        {status}
      </Badge>
    );
  };

  const typeBadge = (type: Domain["type"]) => (
    <Badge
      variant="outline"
      className={
        type === "subdomain"
          ? "bg-info/10 text-info border-info/20"
          : "bg-foreground/5 text-foreground/60 border-foreground/10"
      }
    >
      {type === "subdomain" ? "default" : "custom"}
    </Badge>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const subdomain = domains.find((d) => d.type === "subdomain");
  const customDomains = domains.filter((d) => d.type === "custom");
  const pendingDomains = customDomains.filter((d) => d.status === "pending");

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 lg:p-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <Globe size={20} className="text-primary" />
          <h2 className="font-mono text-lg font-bold uppercase tracking-[2px] text-foreground">
            Domains
          </h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage the domains where your events are hosted. Your default subdomain is always available.
        </p>
      </div>

      <Separator />

      {/* Default subdomain */}
      {subdomain && (
        <Card className="border-border/50 bg-card/50 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe size={16} className="text-info" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium text-foreground">
                    {subdomain.hostname}
                  </span>
                  {typeBadge(subdomain.type)}
                  {statusBadge(subdomain.status)}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Your default Entry subdomain — always active, cannot be removed
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Custom domains list */}
      <div>
        <h3 className="mb-4 font-mono text-xs font-bold uppercase tracking-[2px] text-foreground/60">
          Custom Domains
        </h3>

        {customDomains.length === 0 ? (
          <Card className="border-border/50 bg-card/30 p-8">
            <div className="text-center">
              <Globe size={24} className="mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No custom domains added yet</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Add your own domain so ticket buyers see your brand
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {customDomains.map((domain) => (
              <Card key={domain.id} className="border-border/50 bg-card/50 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium text-foreground">
                        {domain.hostname}
                      </span>
                      {typeBadge(domain.type)}
                      {statusBadge(domain.status)}
                      {domain.is_primary && (
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                          <Star size={10} className="mr-1" />
                          primary
                        </Badge>
                      )}
                    </div>

                    {/* DNS instructions for pending domains */}
                    {domain.status === "pending" && domain.verification_domain && (
                      <div className="mt-3 rounded-lg border border-warning/20 bg-warning/5 p-4">
                        <div className="flex items-center gap-2 text-xs font-medium text-warning">
                          <AlertCircle size={14} />
                          DNS Configuration Required
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Add the following DNS record at your domain registrar:
                        </p>
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center justify-between rounded bg-background/50 px-3 py-2">
                            <div>
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Type</span>
                              <p className="font-mono text-xs text-foreground">
                                {(domain.verification_type || "TXT").toUpperCase()}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Name</span>
                              <p className="font-mono text-xs text-foreground">{domain.verification_domain}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2 rounded bg-background/50 px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Value</span>
                              <p className="truncate font-mono text-xs text-foreground">
                                {domain.verification_value}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() =>
                                copyToClipboard(domain.verification_value || "", domain.id)
                              }
                              className="shrink-0"
                            >
                              {copied === domain.id ? (
                                <Check size={12} className="text-success" />
                              ) : (
                                <Copy size={12} />
                              )}
                            </Button>
                          </div>
                        </div>
                        <p className="mt-3 text-[11px] text-muted-foreground/60">
                          Also add a CNAME record pointing <strong>{domain.hostname}</strong> to{" "}
                          <strong>cname.vercel-dns.com</strong>
                        </p>
                      </div>
                    )}

                    {/* Failed reason */}
                    {domain.status === "failed" && domain.verification_reason && (
                      <p className="mt-2 text-xs text-destructive">
                        {domain.verification_reason}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-1">
                    {domain.status === "pending" && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleVerify(domain.id)}
                        disabled={verifying === domain.id}
                        title="Verify DNS"
                      >
                        <RefreshCw
                          size={14}
                          className={verifying === domain.id ? "animate-spin" : ""}
                        />
                      </Button>
                    )}
                    {domain.status === "active" && !domain.is_primary && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleSetPrimary(domain.id)}
                        title="Set as primary"
                      >
                        <Star size={14} />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(domain.id)}
                      disabled={deleting === domain.id}
                      title="Remove domain"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      {deleting === domain.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Add custom domain form */}
      <Card className="border-border/50 bg-card/50 p-5">
        <h3 className="mb-4 flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[2px] text-foreground/60">
          <Plus size={14} />
          Add Custom Domain
        </h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="hostname" className="text-xs text-muted-foreground">
              Hostname
            </Label>
            <Input
              id="hostname"
              placeholder="tickets.mybrand.com"
              value={newHostname}
              onChange={(e) => {
                setNewHostname(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="mt-1 font-mono"
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground/60">
              Enter your domain without http:// or trailing slashes
            </p>
          </div>
          {error && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle size={12} />
              {error}
            </p>
          )}
          <Button onClick={handleAdd} disabled={adding || !newHostname.trim()} size="sm">
            {adding ? (
              <Loader2 size={14} className="mr-2 animate-spin" />
            ) : (
              <Plus size={14} className="mr-2" />
            )}
            Add Domain
          </Button>
        </div>
      </Card>

      {/* Help section */}
      <Card className="border-border/30 bg-card/30 p-5">
        <h3 className="mb-3 font-mono text-xs font-bold uppercase tracking-[2px] text-foreground/40">
          How It Works
        </h3>
        <ol className="space-y-2 text-xs text-muted-foreground">
          <li className="flex gap-2">
            <span className="font-mono text-foreground/40">1.</span>
            Add your custom domain above
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-foreground/40">2.</span>
            Copy the DNS records shown and add them at your domain registrar (e.g. Cloudflare, Namecheap, GoDaddy)
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-foreground/40">3.</span>
            Wait for DNS propagation (usually 1–10 minutes, can take up to 48 hours)
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-foreground/40">4.</span>
            Click &quot;Verify&quot; to confirm your domain is connected
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-foreground/40">5.</span>
            Set your custom domain as primary to use it for event pages
          </li>
        </ol>
      </Card>
    </div>
  );
}
