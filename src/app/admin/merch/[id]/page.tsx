"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { MerchImageGallery } from "@/components/admin/MerchImageGallery";
import {
  ArrowLeft,
  Loader2,
  Save,
  Ticket,
  Trash2,
  X,
} from "lucide-react";
import type { Product, ProductType, ProductStatus } from "@/types/products";

interface LinkedTicketType {
  id: string;
  name: string;
  event_name: string;
  event_slug: string;
  price: number;
}

const PRODUCT_TYPES: ProductType[] = [
  "T-Shirt",
  "Hoodie",
  "Poster",
  "Hat",
  "Vinyl",
  "Other",
];

const ALL_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

const STATUS_OPTIONS: { value: ProductStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
];

const STATUS_VARIANT: Record<ProductStatus, "success" | "warning" | "secondary"> = {
  active: "success",
  draft: "warning",
  archived: "secondary",
};

export default function MerchEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [customSize, setCustomSize] = useState("");
  const [linkedTickets, setLinkedTickets] = useState<LinkedTicketType[]>([]);

  const loadProduct = useCallback(async () => {
    try {
      const res = await fetch(`/api/merch/${id}`);
      if (!res.ok) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const json = await res.json();
      if (json.data) {
        setProduct(json.data);
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadProduct();
    // Load ticket types linked to this product
    (async () => {
      try {
        const res = await fetch(`/api/merch/${id}/linked-tickets`);
        if (res.ok) {
          const json = await res.json();
          if (json.data) setLinkedTickets(json.data);
        }
      } catch {
        // ignore — non-critical
      }
    })();
  }, [loadProduct, id]);

  const update = useCallback((field: keyof Product, value: unknown) => {
    setProduct((prev) => (prev ? { ...prev, [field]: value } : prev));
  }, []);

  const handleSave = async () => {
    if (!product) return;
    setSaving(true);
    setSaveMsg("");

    try {
      const res = await fetch(`/api/merch/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: product.name,
          description: product.description || null,
          type: product.type,
          sizes: product.sizes,
          price: Number(product.price),
          images: product.images,
          status: product.status,
          sku: product.sku || null,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setProduct(json.data);
        setSaveMsg("Saved successfully");
      } else {
        setSaveMsg(`Error: ${json.error}`);
      }
    } catch {
      setSaveMsg("Network error");
    }

    setSaving(false);
    setTimeout(() => setSaveMsg(""), 4000);
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/merch/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/admin/merch/");
      } else {
        const json = await res.json();
        setDeleteError(json.error || "Delete failed");
      }
    } catch {
      setDeleteError("Network error");
    }
    setDeleting(false);
  };

  const toggleSize = (size: string) => {
    if (!product) return;
    const sizes = product.sizes.includes(size)
      ? product.sizes.filter((s) => s !== size)
      : [...product.sizes, size];
    update("sizes", sizes);
  };

  const addCustomSize = () => {
    if (!product || !customSize.trim()) return;
    const trimmed = customSize.trim().toUpperCase();
    if (!product.sizes.includes(trimmed)) {
      update("sizes", [...product.sizes, trimmed]);
    }
    setCustomSize("");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin text-primary/60" />
        <span className="ml-3 text-sm text-muted-foreground">Loading merch...</span>
      </div>
    );
  }

  if (notFound || !product) {
    return (
      <div className="p-6 lg:p-8">
        <Link
          href="/admin/merch/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Back to Merch
        </Link>
        <Card className="py-0 gap-0">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-medium text-foreground">Merch not found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              This item may have been deleted
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/admin/merch/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft size={14} />
            Merch
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">
              {product.name || "Untitled Merch"}
            </h1>
            <Badge variant={STATUS_VARIANT[product.status]}>
              {product.status}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDelete(true)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 size={14} />
            Delete
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Save Message */}
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column — Main details */}
        <div className="space-y-6 lg:col-span-2">
          {/* Details */}
          <Card className="py-0 gap-0">
            <CardHeader className="px-6 pt-5 pb-4">
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 space-y-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={product.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="e.g. Summer Drop Tee"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={product.description || ""}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder="Describe the product..."
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={product.type} onValueChange={(v) => update("type", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>SKU</Label>
                  <Input
                    value={product.sku || ""}
                    onChange={(e) => update("sku", e.target.value)}
                    placeholder="e.g. TEE-SUM-2026"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sizing */}
          <Card className="py-0 gap-0">
            <CardHeader className="px-6 pt-5 pb-4">
              <CardTitle className="text-sm">Sizing</CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {ALL_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => toggleSize(size)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-all ${
                      product.sizes.includes(size)
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/20"
                    }`}
                  >
                    {size}
                  </button>
                ))}
                {product.sizes
                  .filter((s) => !ALL_SIZES.includes(s))
                  .map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => toggleSize(size)}
                      className="rounded-md border border-primary/40 bg-primary/10 text-primary px-3 py-1.5 text-xs font-medium transition-all flex items-center gap-1"
                    >
                      {size}
                      <X size={10} />
                    </button>
                  ))}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={customSize}
                  onChange={(e) => setCustomSize(e.target.value)}
                  placeholder="Custom size..."
                  className="max-w-[140px] text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomSize();
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="xs"
                  onClick={addCustomSize}
                  disabled={!customSize.trim()}
                >
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Images */}
          <Card className="py-0 gap-0">
            <CardHeader className="px-6 pt-5 pb-4">
              <CardTitle className="text-sm">Images</CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <MerchImageGallery
                images={product.images}
                onChange={(imgs) => update("images", imgs)}
                uploadKeyPrefix={`product_${id}`}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right column — Status & Pricing */}
        <div className="space-y-6">
          {/* Status */}
          <Card className="py-0 gap-0">
            <CardHeader className="px-6 pt-5 pb-4">
              <CardTitle className="text-sm">Status</CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <div className="flex flex-col gap-1.5">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => update("status", opt.value)}
                    className={`rounded-md border px-3 py-2 text-left text-sm transition-all ${
                      product.status === opt.value
                        ? "border-primary/40 bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground hover:border-primary/20"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={STATUS_VARIANT[opt.value]}
                        className="text-[10px]"
                      >
                        {opt.label}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card className="py-0 gap-0">
            <CardHeader className="px-6 pt-5 pb-4">
              <CardTitle className="text-sm">Pricing</CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 space-y-2">
              <Label>Price (£)</Label>
              <Input
                type="number"
                value={product.price}
                onChange={(e) => update("price", Number(e.target.value))}
                min="0"
                step="0.01"
              />
              <p className="text-[10px] text-muted-foreground/60">
                For future standalone sales. Ticket-bundled products use the
                ticket price.
              </p>
            </CardContent>
          </Card>

          {/* Linked Events */}
          <Card className="py-0 gap-0">
            <CardHeader className="px-6 pt-5 pb-4">
              <CardTitle className="text-sm">Linked Events</CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              {linkedTickets.length > 0 ? (
                <div className="space-y-2">
                  {linkedTickets.map((lt) => (
                    <Link
                      key={lt.id}
                      href={`/admin/events/${lt.event_slug}/`}
                      className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2 text-sm hover:border-primary/20 transition-colors"
                    >
                      <Ticket size={13} className="text-muted-foreground/50 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {lt.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {lt.event_name} &middot; £{Number(lt.price).toFixed(2)}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/60 text-center py-2">
                  Not linked to any ticket types yet
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Dialog */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Merch</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{product.name}&rdquo;? This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p className="text-sm text-destructive">{deleteError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 size={14} className="animate-spin" />}
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
