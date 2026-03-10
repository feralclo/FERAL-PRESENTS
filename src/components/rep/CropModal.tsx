"use client";

import { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import Cropper, { type Area } from "react-easy-crop";
import { Check, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CropModalProps {
  imageSrc: string;
  onConfirm: (croppedDataUrl: string) => void;
  onCancel: () => void;
}

/**
 * Crop the selected area from the source image and return a 400x400 JPEG data URL.
 */
async function getCroppedImage(imageSrc: string, crop: Area): Promise<string> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 400;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.drawImage(
    img,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    400,
    400
  );

  return canvas.toDataURL("image/jpeg", 0.85);
}

export function CropModal({ imageSrc, onConfirm, onCancel }: CropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedArea(croppedPixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedArea) return;
    setProcessing(true);
    try {
      const result = await getCroppedImage(imageSrc, croppedArea);
      onConfirm(result);
    } catch {
      onCancel();
    }
  };

  const content = (
    <div className="fixed inset-0 z-[110] flex flex-col bg-black/95 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),16px)] pb-3">
        <button
          onClick={onCancel}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white"
        >
          <X size={18} />
        </button>
        <span className="text-sm font-semibold text-white">Move & zoom</span>
        <div className="w-9" />
      </div>

      {/* Crop area */}
      <div className="relative flex-1 min-h-0">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          style={{
            containerStyle: { background: "black" },
            cropAreaStyle: {
              border: "2px solid rgba(139, 92, 246, 0.6)",
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.7)",
            },
          }}
        />
      </div>

      {/* Zoom slider */}
      <div className="flex items-center gap-3 px-8 py-4">
        <ZoomOut size={16} className="text-white/50 shrink-0" />
        <input
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="flex-1 h-1 appearance-none bg-white/20 rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(139,92,246,0.5)]"
        />
        <ZoomIn size={16} className="text-white/50 shrink-0" />
      </div>

      {/* Confirm */}
      <div className="px-5 pb-[max(env(safe-area-inset-bottom),16px)]">
        <Button
          size="lg"
          className="w-full rounded-2xl font-semibold"
          onClick={handleConfirm}
          disabled={processing}
        >
          {processing ? "Processing..." : (
            <>
              <Check size={16} />
              Use Photo
            </>
          )}
        </Button>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.getElementById("rep-portal-root") || document.body);
}
