"use client";

import { X, Download, Share, Smartphone } from "lucide-react";

interface ScannerInstallPromptProps {
  platform: "ios" | "android" | "desktop" | "unknown";
  iosBrowser: "safari" | "chrome" | "other" | null;
  onInstall: () => Promise<boolean>;
  onDismiss: () => void;
}

export function ScannerInstallPrompt({
  platform,
  iosBrowser,
  onInstall,
  onDismiss,
}: ScannerInstallPromptProps) {
  const isIOS = platform === "ios";
  const isSafari = iosBrowser === "safari";

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
      <div className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-6 shadow-2xl shadow-black/40 scanner-result-enter">
        {/* Close button */}
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <X size={18} />
        </button>

        <div className="text-center mb-5">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 mb-3">
            <Smartphone size={24} className="text-primary" />
          </div>
          <h3 className="text-lg font-bold text-foreground">Install Scanner</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Add to your home screen for full-screen scanning
          </p>
        </div>

        {isIOS ? (
          <div className="space-y-3 mb-5">
            {!isSafari ? (
              <div className="rounded-lg bg-warning/10 border border-warning/20 p-3 text-center">
                <p className="text-xs font-medium text-warning">
                  Open this page in Safari to install
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">1</span>
                  <span>Tap <Share size={14} className="inline text-primary mx-0.5" /> Share in the toolbar</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">2</span>
                  <span>Scroll down and tap &quot;Add to Home Screen&quot;</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">3</span>
                  <span>Tap &quot;Add&quot; to confirm</span>
                </div>
              </>
            )}
          </div>
        ) : (
          <button
            onClick={async () => {
              await onInstall();
              onDismiss();
            }}
            className="w-full mb-4 flex items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-white transition-all hover:bg-primary/85"
          >
            <Download size={16} />
            Add to Home Screen
          </button>
        )}

        <button
          onClick={onDismiss}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
