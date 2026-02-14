"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Package,
  Plus,
  Loader2,
  Sparkles,
  ShoppingBag,
} from "lucide-react";
import type { Product, ProductStatus, ProductType } from "@/types/products";

const STATUS_VARIANT: Record<ProductStatus, "success" | "warning" | "secondary"> = {
  active: "success",
  draft: "warning",
  archived: "secondary",
};

const PRODUCT_TYPES: ProductType[] = [
  "T-Shirt",
  "Hoodie",
  "Poster",
  "Hat",
  "Vinyl",
  "Other",
];

const DEFAULT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

type FilterTab = "all" | ProductStatus;

export default function MerchPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  // Create form state
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<ProductType>("T-Shirt");
  const [newSizes, setNewSizes] = useState<string[]>([...DEFAULT_SIZES]);
  const [newPrice, setNewPrice] = useState("");

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/merch");
      const json = await res.json();
      if (json.data) setProducts(json.data);
    } catch {
      // Network error
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/merch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          type: newType,
          sizes: newSizes,
          price: newPrice ? Number(newPrice) : 0,
        }),
      });
      const json = await res.json();
      if (res.ok && json.data) {
        setShowCreate(false);
        setNewName("");
        setNewType("T-Shirt");
        setNewSizes([...DEFAULT_SIZES]);
        setNewPrice("");
        router.push(`/admin/merch/${json.data.id}/`);
      }
    } catch {
      // Network error
    }
    setCreating(false);
  };

  const filtered =
    filter === "all"
      ? products
      : products.filter((p) => p.status === filter);

  const counts = {
    all: products.length,
    active: products.filter((p) => p.status === "active").length,
    draft: products.filter((p) => p.status === "draft").length,
    archived: products.filter((p) => p.status === "archived").length,
  };

  const toggleSize = (size: string) => {
    setNewSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    );
  };

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-mono text-lg font-bold tracking-tight text-foreground">
            Merch
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage merchandise for your events
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={14} />
          Create Merch
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 rounded-lg bg-muted p-1 w-fit">
        {(["all", "active", "draft", "archived"] as FilterTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === tab
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            <span className="ml-1.5 text-[10px] tabular-nums text-muted-foreground/60">
              {counts[tab]}
            </span>
          </button>
        ))}
      </div>

      {/* Products Table */}
      {loading ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-primary/60" />
            <span className="ml-3 text-sm text-muted-foreground">
              Loading merch...
            </span>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="py-0 gap-0">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/8 ring-1 ring-primary/10">
              <Package size={20} className="text-primary/60" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">
              {filter === "all"
                ? "No merch yet"
                : `No ${filter} merch`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {filter === "all"
                ? "Create your first merch item to start selling merchandise"
                : "Merch with this status will appear here"}
            </p>
            {filter === "all" && (
              <Button
                size="sm"
                className="mt-4"
                onClick={() => setShowCreate(true)}
              >
                <Plus size={14} />
                Create Merch
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0 gap-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Sizes</TableHead>
                <TableHead className="text-right">Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((product) => (
                <TableRow
                  key={product.id}
                  className="cursor-pointer"
                  onClick={() =>
                    router.push(`/admin/merch/${product.id}/`)
                  }
                >
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[product.status]}>
                      {product.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {product.type}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {product.sizes.slice(0, 4).map((size) => (
                        <Badge
                          key={size}
                          variant="outline"
                          className="text-[10px] px-1.5 py-0"
                        >
                          {size}
                        </Badge>
                      ))}
                      {product.sizes.length > 4 && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0"
                        >
                          +{product.sizes.length - 4}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {product.price > 0
                      ? `£${Number(product.price).toFixed(2)}`
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Coming Soon — Standalone Merch Store */}
      <Card className="py-0 gap-0 border-primary/10">
        <CardHeader className="px-6 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/15">
              <ShoppingBag size={16} className="text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm">
                  Standalone Merch Store
                </CardTitle>
                <Badge variant="default" className="gap-1 text-[10px]">
                  <Sparkles size={9} />
                  Coming Soon
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Sell merchandise independently, not just bundled with event
                tickets. Set up your own branded merch store with direct
                shipping.
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Merch</DialogTitle>
            <DialogDescription>
              Add a new merchandise item. You can configure details after
              creation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Summer Drop Tee"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={newType} onValueChange={(v) => setNewType(v as ProductType)}>
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
                <Label>Price (£)</Label>
                <Input
                  type="number"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Sizes</Label>
              <div className="flex flex-wrap gap-1.5">
                {DEFAULT_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => toggleSize(size)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-all ${
                      newSizes.includes(size)
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/20"
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating && <Loader2 size={14} className="animate-spin" />}
              {creating ? "Creating..." : "Create Merch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
