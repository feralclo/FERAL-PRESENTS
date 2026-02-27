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
import { Switch } from "@/components/ui/switch";
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
import {
  ArrowLeft,
  Loader2,
  Save,
  Trash2,
  Plus,
  GripVertical,
  Crown,
  Calendar,
  MapPin,
  Package,
  Star,
  ExternalLink,
  ImageIcon,
} from "lucide-react";
import { ImageUpload } from "@/components/admin/ImageUpload";
import type { MerchCollection, MerchCollectionItem } from "@/types/merch-store";
import type { Product } from "@/types/products";
import type { Event } from "@/types/events";
import { normalizeMerchImages } from "@/lib/merch-images";
import { fmtMoney } from "@/lib/format";

type CollectionStatus = "draft" | "active" | "archived";

const STATUS_OPTIONS: { value: CollectionStatus; label: string; description: string }[] = [
  { value: "active", label: "Active", description: "Visible to customers on your site" },
  { value: "draft", label: "Draft", description: "Hidden from customers, visible only to you" },
  { value: "archived", label: "Archived", description: "Hidden and no longer active" },
];

const STATUS_VARIANT: Record<string, "success" | "warning" | "secondary"> = {
  active: "success",
  draft: "warning",
  archived: "secondary",
};

interface CollectionItemFormData {
  product_id: string;
  sort_order: number;
  is_featured: boolean;
  is_limited_edition: boolean;
  limited_edition_label: string;
  custom_price: number | null;
  max_per_order: number | null;
  product?: Product;
}

export default function CollectionEditorPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  // Collection state
  const [collection, setCollection] = useState<MerchCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [notFound, setNotFound] = useState(false);

  // Items state
  const [items, setItems] = useState<CollectionItemFormData[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);

  // Dialogs
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const loadCollection = useCallback(async () => {
    try {
      const [collectionRes, productsRes] = await Promise.all([
        fetch(`/api/merch-store/collections/${slug}?admin=true`),
        fetch("/api/merch?status=active"),
      ]);

      if (!collectionRes.ok) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const [collectionJson, productsJson] = await Promise.all([
        collectionRes.json(),
        productsRes.json(),
      ]);

      if (collectionJson.data) {
        setCollection(collectionJson.data);
        // Transform items for form state
        const formItems: CollectionItemFormData[] = (collectionJson.data.items || []).map(
          (item: MerchCollectionItem) => ({
            product_id: item.product_id,
            sort_order: item.sort_order,
            is_featured: item.is_featured,
            is_limited_edition: item.is_limited_edition,
            limited_edition_label: item.limited_edition_label || "",
            custom_price: item.custom_price,
            max_per_order: item.max_per_order,
            product: item.product,
          })
        );
        setItems(formItems);
      } else {
        setNotFound(true);
      }

      if (productsJson.data) {
        setAllProducts(productsJson.data);
      }
    } catch {
      setNotFound(true);
    }
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    loadCollection();
  }, [loadCollection]);

  const updateField = useCallback(
    (field: keyof MerchCollection, value: unknown) => {
      setCollection((prev) => (prev ? { ...prev, [field]: value } : prev));
    },
    []
  );

  const handleSave = async () => {
    if (!collection) return;
    setSaving(true);
    setSaveMsg("");

    try {
      const res = await fetch(`/api/merch-store/collections/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: collection.title,
          description: collection.description,
          status: collection.status,
          is_limited_edition: collection.is_limited_edition,
          limited_edition_label: collection.limited_edition_label,
          hero_image: collection.hero_image,
          tile_image: collection.tile_image,
          custom_cta_text: collection.custom_cta_text,
          pickup_instructions: collection.pickup_instructions,
          items: items.map((item, index) => ({
            product_id: item.product_id,
            sort_order: index,
            is_featured: item.is_featured,
            is_limited_edition: item.is_limited_edition,
            limited_edition_label: item.limited_edition_label || null,
            custom_price: item.custom_price,
            max_per_order: item.max_per_order,
          })),
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setCollection(json.data);
        setSaveMsg("Saved successfully");
        // If slug changed, redirect
        if (json.data.slug !== slug) {
          router.replace(`/admin/merch-store/${json.data.slug}/`);
        }
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
    try {
      const res = await fetch(`/api/merch-store/collections/${slug}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/admin/merch-store/");
      }
    } catch {
      // Network error
    }
    setDeleting(false);
  };

  // Product management
  const addProduct = (productId: string) => {
    const product = allProducts.find((p) => p.id === productId);
    if (!product) return;
    setItems((prev) => [
      ...prev,
      {
        product_id: productId,
        sort_order: prev.length,
        is_featured: false,
        is_limited_edition: collection?.is_limited_edition ?? false,
        limited_edition_label: "",
        custom_price: product.price > 0 ? product.price : null,
        max_per_order: null,
        product,
      },
    ]);
    setShowAddProduct(false);
  };

  const removeProduct = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof CollectionItemFormData, value: unknown) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  // Drag & drop reordering
  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    setItems((prev) => {
      const newItems = [...prev];
      const [dragged] = newItems.splice(dragIndex, 1);
      newItems.splice(index, 0, dragged);
      return newItems;
    });
    setDragIndex(index);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  // Products not yet in collection
  const usedProductIds = new Set(items.map((i) => i.product_id));
  const availableProducts = allProducts.filter((p) => !usedProductIds.has(p.id));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin text-primary/60" />
        <span className="ml-3 text-sm text-muted-foreground">Loading collection...</span>
      </div>
    );
  }

  if (notFound || !collection) {
    return (
      <div className="p-6 lg:p-8">
        <Link
          href="/admin/merch-store/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Back to Event Pre-orders
        </Link>
        <Card className="py-0 gap-0">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-medium text-foreground">Collection not found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              This collection may have been deleted
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const event = collection.event as Event | undefined;

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/admin/merch-store/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft size={14} />
            Event Pre-orders
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">
              {collection.title || "Untitled Collection"}
            </h1>
            <Badge variant={STATUS_VARIANT[collection.status] || "secondary"}>
              {collection.status}
            </Badge>
            {collection.is_limited_edition && (
              <Badge className="gap-1 border-amber-500/30 bg-amber-500/15 text-amber-400 text-[10px]">
                <Crown size={9} />
                {collection.limited_edition_label || "Limited Edition"}
              </Badge>
            )}
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
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Save message */}
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
        {/* ── Left column: Details + Products ── */}
        <div className="space-y-6 lg:col-span-2">
          {/* Collection Details */}
          <Card className="py-0 gap-0">
            <CardHeader className="px-6 pt-5 pb-4">
              <CardTitle className="text-sm">Collection Details</CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 space-y-4">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input
                  value={collection.title}
                  onChange={(e) => updateField("title", e.target.value)}
                  placeholder="e.g. Summer Festival Merch"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={collection.description || ""}
                  onChange={(e) => updateField("description", e.target.value)}
                  placeholder="Describe the collection... This appears on the public store page."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>CTA Button Text</Label>
                <Input
                  value={collection.custom_cta_text || ""}
                  onChange={(e) => updateField("custom_cta_text", e.target.value)}
                  placeholder="Pre-order Now"
                />
              </div>

              {/* Image uploads */}
              <div className="grid grid-cols-2 gap-4">
                <ImageUpload
                  label="Hero / Banner Image"
                  value={collection.hero_image || ""}
                  onChange={(v) => updateField("hero_image", v || null)}
                  uploadKey={`merch_collection_hero_${collection.id}`}
                />
                <ImageUpload
                  label="Tile Image (Shop Grid)"
                  value={collection.tile_image || ""}
                  onChange={(v) => updateField("tile_image", v || null)}
                  uploadKey={`merch_collection_tile_${collection.id}`}
                />
              </div>
              <p className="text-[10px] text-muted-foreground/60">
                Hero image appears at the top of the collection page. Tile image appears on the shop grid. Both default to the event cover if left empty.
              </p>
              <div className="space-y-2">
                <Label>Pickup Instructions</Label>
                <Textarea
                  value={collection.pickup_instructions || ""}
                  onChange={(e) => updateField("pickup_instructions", e.target.value)}
                  placeholder="e.g. Collect at the merch stand when you arrive at the event"
                  rows={2}
                />
                <p className="text-[10px] text-muted-foreground/60">
                  Shown to customers after purchase so they know how to collect their merch.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Limited Edition */}
          <Card className="py-0 gap-0">
            <CardHeader className="px-6 pt-5 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Crown size={14} className="text-amber-400" />
                  Limited Edition
                </CardTitle>
                <Switch
                  checked={collection.is_limited_edition}
                  onCheckedChange={(v) => updateField("is_limited_edition", v)}
                />
              </div>
            </CardHeader>
            {collection.is_limited_edition && (
              <CardContent className="px-6 pb-6 space-y-4">
                <div className="space-y-2">
                  <Label>Label</Label>
                  <Input
                    value={collection.limited_edition_label || ""}
                    onChange={(e) => updateField("limited_edition_label", e.target.value || null)}
                    placeholder="Limited Edition"
                  />
                  <p className="text-[10px] text-muted-foreground/60">
                    Customize the badge text. Examples: &quot;Limited Edition&quot;, &quot;Collector&apos;s Piece&quot;, &quot;Event Exclusive&quot;
                  </p>
                </div>
                <div className="rounded-lg border border-amber-500/10 bg-amber-500/5 px-4 py-3">
                  <p className="text-xs text-amber-200/70">
                    Limited edition items are displayed with exclusive styling and urgency cues on
                    the public store page — helping drive pre-orders for one-of-a-kind event merch.
                  </p>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Products in Collection */}
          <Card className="py-0 gap-0">
            <CardHeader className="px-6 pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">Products</CardTitle>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {items.length} {items.length === 1 ? "product" : "products"} in this collection.
                    Drag to reorder.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddProduct(true)}
                  disabled={availableProducts.length === 0}
                >
                  <Plus size={14} />
                  Add Product
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted ring-1 ring-border/50">
                    <Package size={16} className="text-muted-foreground/50" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">No products yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Add products from your merch catalog to this collection
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => setShowAddProduct(true)}
                    disabled={availableProducts.length === 0}
                  >
                    <Plus size={14} />
                    Add Product
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item, index) => {
                    const product = item.product;
                    const images = product ? normalizeMerchImages(product.images) : [];
                    const primaryImage = images[0];

                    return (
                      <div
                        key={item.product_id}
                        draggable
                        onDragStart={() => handleDragStart(index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                        className={`group rounded-lg border transition-all ${
                          dragIndex === index
                            ? "border-primary/40 bg-primary/5 shadow-lg"
                            : "border-border hover:border-border/80"
                        }`}
                      >
                        {/* Product header */}
                        <div className="flex items-center gap-3 px-4 py-3">
                          <div className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground/70">
                            <GripVertical size={14} />
                          </div>

                          {/* Image thumbnail */}
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border/50 bg-muted">
                            {primaryImage ? (
                              <img
                                src={primaryImage}
                                alt={product?.name || ""}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <ImageIcon size={14} className="text-muted-foreground/30" />
                              </div>
                            )}
                          </div>

                          {/* Product info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground truncate">
                                {product?.name || "Unknown Product"}
                              </p>
                              {item.is_featured && (
                                <Star size={11} className="shrink-0 fill-amber-400 text-amber-400" />
                              )}
                              {item.is_limited_edition && (
                                <Crown size={11} className="shrink-0 text-amber-400" />
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[11px] text-muted-foreground">
                                {product?.type}
                              </span>
                              {product?.sizes && product.sizes.length > 0 && (
                                <>
                                  <span className="text-[11px] text-muted-foreground/40">&middot;</span>
                                  <span className="text-[11px] text-muted-foreground">
                                    {product.sizes.join(", ")}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Price */}
                          <div className="shrink-0 text-right">
                            <Input
                              type="number"
                              value={item.custom_price ?? ""}
                              onChange={(e) =>
                                updateItem(
                                  index,
                                  "custom_price",
                                  e.target.value ? Number(e.target.value) : null
                                )
                              }
                              className="w-20 text-right text-xs h-8"
                              placeholder="Price"
                              min="0"
                              step="0.01"
                            />
                          </div>

                          {/* Remove button */}
                          <button
                            onClick={() => removeProduct(index)}
                            className="shrink-0 rounded-md p-1.5 text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        {/* Item options (collapsible feel) */}
                        <div className="border-t border-border/50 px-4 py-2.5 flex items-center gap-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <Switch
                              checked={item.is_featured}
                              onCheckedChange={(v) => updateItem(index, "is_featured", v)}
                              className="scale-75"
                            />
                            <span className="text-[11px] text-muted-foreground">Featured</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <Switch
                              checked={item.is_limited_edition}
                              onCheckedChange={(v) => updateItem(index, "is_limited_edition", v)}
                              className="scale-75"
                            />
                            <span className="text-[11px] text-muted-foreground">Limited Edition</span>
                          </label>
                          <div className="flex items-center gap-1.5 ml-auto">
                            <span className="text-[11px] text-muted-foreground">Max per order:</span>
                            <Input
                              type="number"
                              value={item.max_per_order ?? ""}
                              onChange={(e) =>
                                updateItem(
                                  index,
                                  "max_per_order",
                                  e.target.value ? Number(e.target.value) : null
                                )
                              }
                              className="w-16 text-center text-xs h-7"
                              placeholder="∞"
                              min="1"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Right column: Status, Event, Preview ── */}
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
                    onClick={() => updateField("status", opt.value)}
                    className={`rounded-md border px-3 py-2 text-left transition-all ${
                      collection.status === opt.value
                        ? "border-primary/40 bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground hover:border-primary/20"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={STATUS_VARIANT[opt.value] || "secondary"}
                        className="text-[10px]"
                      >
                        {opt.label}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground/60">
                      {opt.description}
                    </p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Linked Event */}
          {event && (
            <Card className="py-0 gap-0">
              <CardHeader className="px-6 pt-5 pb-4">
                <CardTitle className="text-sm">Linked Event</CardTitle>
              </CardHeader>
              <CardContent className="px-6 pb-6">
                <div className="rounded-lg border border-border/50 overflow-hidden">
                  {(event.cover_image || event.hero_image) && (
                    <div className="h-20 overflow-hidden">
                      <img
                        src={event.cover_image || event.hero_image}
                        alt={event.name}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                  <div className="px-3 py-2.5">
                    <p className="text-xs font-medium text-foreground truncate">{event.name}</p>
                    <div className="mt-1.5 flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Calendar size={10} />
                        {new Date(event.date_start).toLocaleDateString("en-GB", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </div>
                      {event.venue_name && (
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <MapPin size={10} />
                          {event.venue_name}
                        </div>
                      )}
                    </div>
                    <Link
                      href={`/admin/events/${event.slug}/`}
                      className="mt-2 flex items-center gap-1 text-[10px] font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      View event
                      <ExternalLink size={9} />
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* URL */}
          <Card className="py-0 gap-0">
            <CardHeader className="px-6 pt-5 pb-4">
              <CardTitle className="text-sm">Public URL</CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
                <p className="text-[11px] text-muted-foreground font-mono break-all">
                  /shop/{collection.slug}
                </p>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground/60">
                {collection.status === "active"
                  ? "This page is live and visible to customers."
                  : "This page is hidden. Set status to Active to make it public."}
              </p>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card className="py-0 gap-0">
            <CardHeader className="px-6 pt-5 pb-4">
              <CardTitle className="text-sm">Summary</CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Products</span>
                  <span className="font-medium text-foreground">{items.length}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Featured</span>
                  <span className="font-medium text-foreground">
                    {items.filter((i) => i.is_featured).length}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Limited Edition</span>
                  <span className="font-medium text-foreground">
                    {items.filter((i) => i.is_limited_edition).length}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Price Range</span>
                  <span className="font-medium font-mono text-foreground">
                    {items.length > 0
                      ? (() => {
                          const prices = items
                            .map((i) => i.custom_price ?? i.product?.price ?? 0)
                            .filter((p) => p > 0);
                          if (prices.length === 0) return "—";
                          const min = Math.min(...prices);
                          const max = Math.max(...prices);
                          return min === max
                            ? fmtMoney(min)
                            : `${fmtMoney(min)} – ${fmtMoney(max)}`;
                        })()
                      : "—"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Product Dialog */}
      <Dialog open={showAddProduct} onOpenChange={setShowAddProduct}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Product</DialogTitle>
            <DialogDescription>
              Select a product from your merch catalog to add to this collection.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto py-2">
            {availableProducts.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <Package size={20} className="text-muted-foreground/40" />
                <p className="mt-2 text-sm text-muted-foreground">
                  All your active products are already in this collection
                </p>
                <Link
                  href="/admin/merch/"
                  className="mt-2 text-xs font-medium text-primary hover:text-primary/80"
                >
                  Create more products
                </Link>
              </div>
            ) : (
              <div className="space-y-1.5">
                {availableProducts.map((product) => {
                  const images = normalizeMerchImages(product.images);
                  const primaryImage = images[0];
                  return (
                    <button
                      key={product.id}
                      onClick={() => addProduct(product.id)}
                      className="flex w-full items-center gap-3 rounded-lg border border-border/50 px-3 py-2.5 text-left transition-all hover:border-primary/30 hover:bg-primary/5"
                    >
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border/50 bg-muted">
                        {primaryImage ? (
                          <img
                            src={primaryImage}
                            alt={product.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <ImageIcon size={12} className="text-muted-foreground/30" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {product.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {product.type}
                          {product.sizes.length > 0 && ` · ${product.sizes.join(", ")}`}
                        </p>
                      </div>
                      {product.price > 0 && (
                        <span className="shrink-0 text-xs font-mono text-muted-foreground">
                          {fmtMoney(product.price)}
                        </span>
                      )}
                      <Plus size={14} className="shrink-0 text-primary/60" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddProduct(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Collection</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{collection.title}&rdquo;? This will remove
              the collection and all its product associations. The products themselves will not be
              deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 size={14} className="animate-spin" />}
              {deleting ? "Deleting..." : "Delete Collection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
