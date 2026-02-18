"use client";

import { useCallback, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Upload, Trash2, Loader2, GripVertical } from "lucide-react";
import { processImageFile } from "@/lib/image-utils";
import { normalizeMerchImages } from "@/lib/merch-images";
import { cn } from "@/lib/utils";

interface MerchImageGalleryProps {
  /** Images in either legacy {front, back} or new string[] format */
  images: string[] | { front?: string; back?: string } | null | undefined;
  /** Called with the new ordered string[] on any change */
  onChange: (images: string[]) => void;
  /** Prefix for upload API keys (e.g. "product_abc123") */
  uploadKeyPrefix: string;
  /** Maximum number of images allowed (default 8) */
  maxImages?: number;
}

export function MerchImageGallery({
  images,
  onChange,
  uploadKeyPrefix,
  maxImages = 8,
}: MerchImageGalleryProps) {
  const normalized = normalizeMerchImages(images);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) return;
      if (normalized.length >= maxImages) return;

      setUploading(true);
      setUploadError("");

      const compressed = await processImageFile(file);
      if (!compressed) {
        setUploading(false);
        return;
      }

      const key = `${uploadKeyPrefix}_${Date.now()}`;
      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageData: compressed, key }),
        });
        const json = await res.json();
        if (res.ok && json.url) {
          onChange([...normalized, json.url]);
        } else {
          setUploadError(json.error || "Upload failed");
          onChange([...normalized, compressed]);
        }
      } catch {
        setUploadError("Network error during upload");
        onChange([...normalized, compressed]);
      }

      setUploading(false);
    },
    [normalized, onChange, uploadKeyPrefix, maxImages]
  );

  const handleRemove = useCallback(
    (index: number) => {
      onChange(normalized.filter((_, i) => i !== index));
    },
    [normalized, onChange]
  );

  // Drag-and-drop reorder (HTML5 drag — same pattern as TicketsTab)
  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (dragIndex === null || dragIndex === index) return;
      setDragOverIndex(index);
    },
    [dragIndex]
  );

  const handleDragEnd = useCallback(() => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      const reordered = [...normalized];
      const [moved] = reordered.splice(dragIndex, 1);
      reordered.splice(dragOverIndex, 0, moved);
      onChange(reordered);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, dragOverIndex, normalized, onChange]);

  const imgSrc = (src: string) =>
    src.startsWith("data:") || src.startsWith("http") || src.startsWith("/")
      ? src
      : `/api/media/${src}`;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 max-[480px]:grid-cols-2 gap-3">
        {normalized.map((src, i) => (
          <div
            key={`${src}-${i}`}
            draggable
            onDragStart={() => handleDragStart(i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDragEnd={handleDragEnd}
            className={cn(
              "group relative aspect-square rounded-lg border bg-[#0e0e0e] overflow-hidden transition-all",
              dragIndex === i && "opacity-40",
              dragOverIndex === i && dragIndex !== i && "border-primary/60 ring-1 ring-primary/30",
              dragIndex === null && "border-border hover:border-primary/20"
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgSrc(src)}
              alt={`Image ${i + 1}`}
              className="h-full w-full object-contain p-1.5 cursor-grab active:cursor-grabbing"
            />

            {/* Primary badge */}
            {i === 0 && (
              <Badge className="absolute top-1.5 left-1.5 text-[9px] px-1.5 py-0.5 bg-primary/90 text-white pointer-events-none">
                Primary
              </Badge>
            )}

            {/* Drag handle hint */}
            <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <GripVertical size={12} className="text-muted-foreground/50" />
            </div>

            {/* Remove button */}
            <div className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => handleRemove(i)}
                className="bg-black/60 backdrop-blur-sm text-white/70 hover:text-destructive hover:bg-black/80"
              >
                <Trash2 size={11} />
              </Button>
            </div>
          </div>
        ))}

        {/* Add image cell */}
        {normalized.length < maxImages && (
          <div
            className={cn(
              "aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors",
              "border-border hover:border-primary/30 hover:bg-primary/5"
            )}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const file = e.dataTransfer.files[0];
              if (file) handleFile(file);
            }}
          >
            {uploading ? (
              <Loader2 size={16} className="animate-spin text-muted-foreground/50" />
            ) : (
              <>
                <Upload size={16} className="text-muted-foreground/40" />
                <span className="text-[10px] text-muted-foreground/50">Add image</span>
              </>
            )}
          </div>
        )}
      </div>

      {uploadError && (
        <p className="text-xs text-destructive">{uploadError}</p>
      )}

      {normalized.length > 1 && (
        <p className="text-[10px] text-muted-foreground/50">
          Drag to reorder. First image is the primary.
        </p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
