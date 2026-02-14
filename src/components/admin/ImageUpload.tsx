"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { processImageFile } from "@/lib/image-utils";
import { cn } from "@/lib/utils";

interface ImageUploadProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Optional upload key for API-based upload. Without it, stores base64 directly. */
  uploadKey?: string;
  /** Optional blur preview in pixels */
  blurPx?: number;
  className?: string;
}

export function ImageUpload({
  label,
  value,
  onChange,
  uploadKey,
  blurPx,
  className,
}: ImageUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) return;
      setProcessing(true);
      setUploadError("");

      const compressed = await processImageFile(file);
      if (!compressed) {
        setProcessing(false);
        return;
      }

      if (uploadKey) {
        try {
          const res = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageData: compressed, key: uploadKey }),
          });
          const json = await res.json();
          if (res.ok && json.url) {
            onChange(json.url);
          } else {
            setUploadError(json.error || "Upload failed");
            onChange(compressed);
          }
        } catch {
          setUploadError("Network error during upload");
          onChange(compressed);
        }
      } else {
        onChange(compressed);
      }
      setProcessing(false);
    },
    [onChange, uploadKey]
  );

  return (
    <div className={cn("space-y-2", className)}>
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </span>

      {value && (
        <div className="relative group">
          <div className="rounded-md border border-border bg-[#0e0e0e] p-2 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt={label}
              className="max-w-full max-h-[150px] object-contain mx-auto block"
              style={{
                filter: blurPx != null ? `blur(${blurPx}px)` : undefined,
              }}
            />
          </div>
          {blurPx != null && (
            <span className="absolute top-3 right-3 text-[9px] text-muted-foreground/60 bg-black/70 px-1.5 py-0.5 rounded">
              Preview with blur
            </span>
          )}
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onChange("")}
              className="bg-white/10 backdrop-blur-sm text-white/70 hover:text-destructive hover:bg-white/20"
            >
              <Trash2 size={12} />
            </Button>
          </div>
        </div>
      )}

      {uploadError && (
        <p className="text-xs text-destructive">{uploadError}</p>
      )}

      <div
        className={cn(
          "rounded-md border-2 border-dashed px-4 py-5 text-center cursor-pointer transition-colors duration-150",
          dragging
            ? "border-primary/60 bg-primary/5"
            : "border-border hover:border-primary/30"
        )}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
      >
        {processing ? (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            Uploading...
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <Upload size={16} className="text-muted-foreground/50" />
            <span className="text-xs text-muted-foreground">
              Drag & drop or click to select
            </span>
          </div>
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

      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Or enter image URL"
        className="text-xs"
      />
    </div>
  );
}
