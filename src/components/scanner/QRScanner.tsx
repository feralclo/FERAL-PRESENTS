"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, CameraOff, Flashlight, FlashlightOff } from "lucide-react";

interface QRScannerProps {
  onScan: (code: string) => void;
  active: boolean;
}

/**
 * QR Scanner component using BarcodeDetector API (native, fast) with
 * html5-qrcode as fallback for older browsers.
 *
 * Uses a ref for the onScan callback to avoid stale closures in the
 * requestAnimationFrame loop — ensures mode switches take effect immediately.
 */
export function QRScanner({ onScan, active }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const lastScannedRef = useRef<string>("");
  const lastScannedTimeRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const html5ScannerRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useNative, setUseNative] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  // Keep a ref to the latest onScan so the RAF loop always calls the current version
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  // Debounce: ignore same code within 3 seconds
  const handleDetection = useCallback((code: string) => {
    const now = Date.now();
    if (code === lastScannedRef.current && now - lastScannedTimeRef.current < 3000) {
      return;
    }
    lastScannedRef.current = code;
    lastScannedTimeRef.current = now;
    onScanRef.current(code);
  }, []);

  // Start scanner when active
  useEffect(() => {
    if (!active) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasBarcodeDetector = "BarcodeDetector" in window;
    setUseNative(hasBarcodeDetector);

    if (hasBarcodeDetector) {
      startNativeScanner();
    } else {
      startFallbackScanner();
    }

    return () => {
      stopScanning();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const startNativeScanner = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Apply advanced camera constraints for faster QR recognition
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const capabilities = videoTrack.getCapabilities() as any;
          const advanced: Record<string, unknown>[] = [];

          if (capabilities?.focusMode?.includes("continuous")) {
            advanced.push({ focusMode: "continuous" });
          }
          if (capabilities?.exposureMode?.includes("continuous")) {
            advanced.push({ exposureMode: "continuous" });
          }
          if (capabilities?.torch) {
            setTorchAvailable(true);
          }

          if (advanced.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await videoTrack.applyConstraints({ advanced: advanced as any });
          }
        } catch {
          // Advanced constraints not supported — continue with defaults
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
      scanningRef.current = true;

      const scan = async () => {
        if (!scanningRef.current || !videoRef.current) return;

        try {
          const barcodes = await detector.detect(videoRef.current);
          for (const barcode of barcodes) {
            if (barcode.rawValue) {
              handleDetection(barcode.rawValue);
              break;
            }
          }
        } catch {
          // Detection failed this frame — continue
        }

        animFrameRef.current = requestAnimationFrame(scan);
      };

      animFrameRef.current = requestAnimationFrame(scan);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Camera access denied";
      if (message.includes("Permission") || message.includes("NotAllowed")) {
        setError("Camera access denied. Please allow camera permission in your browser settings.");
      } else {
        setError(`Camera error: ${message}`);
      }
    }
  };

  const startFallbackScanner = async () => {
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("scanner-fallback-region");

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 30,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.8);
            return { width: size, height: size };
          },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          handleDetection(decodedText);
        },
        () => {
          // Ignore scan failures
        }
      );

      html5ScannerRef.current = scanner;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Scanner failed to start";
      setError(message);
    }
  };

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await track.applyConstraints({ advanced: [{ torch: next } as any] });
      setTorchOn(next);
    } catch {
      // Torch toggle failed — device may not support it
    }
  }, [torchOn]);

  const stopScanning = () => {
    scanningRef.current = false;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (html5ScannerRef.current) {
      html5ScannerRef.current.stop().catch(() => {});
      html5ScannerRef.current = null;
    }
    setTorchOn(false);
    setTorchAvailable(false);
  };

  // Allow clearing scan lock for next scan
  const clearLastScan = useCallback(() => {
    lastScannedRef.current = "";
    lastScannedTimeRef.current = 0;
  }, []);

  // Expose clearLastScan globally (used after result dismiss + mode switch)
  useEffect(() => {
    (window as { __scannerClearLast?: () => void }).__scannerClearLast = clearLastScan;
    return () => {
      delete (window as { __scannerClearLast?: () => void }).__scannerClearLast;
    };
  }, [clearLastScan]);

  if (error) {
    return (
      <div className="scanner-viewfinder aspect-square flex flex-col items-center justify-center gap-4 bg-card border border-border/60 rounded-2xl p-8">
        <CameraOff size={48} className="text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground text-center">{error}</p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            if (useNative) startNativeScanner();
            else startFallbackScanner();
          }}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!useNative) {
    return (
      <div className="scanner-viewfinder aspect-square rounded-2xl overflow-hidden bg-black relative">
        <div id="scanner-fallback-region" className="h-full w-full" />
        <div className="scanner-corners" />
        <div className="scanner-corners-bottom" />
        <div className="scanner-line" />
      </div>
    );
  }

  return (
    <div className="scanner-viewfinder aspect-square rounded-2xl overflow-hidden bg-black relative">
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        playsInline
        muted
        autoPlay
      />
      <canvas ref={canvasRef} className="hidden" />
      <div className="scanner-corners" />
      <div className="scanner-corners-bottom" />
      {active && <div className="scanner-line" />}
      {torchAvailable && active && (
        <button
          type="button"
          onClick={toggleTorch}
          className="scanner-torch-button"
          aria-label={torchOn ? "Turn off flashlight" : "Turn on flashlight"}
        >
          {torchOn ? <FlashlightOff size={18} /> : <Flashlight size={18} />}
        </button>
      )}
      {!active && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <Camera size={32} className="text-white/50" />
        </div>
      )}
    </div>
  );
}
