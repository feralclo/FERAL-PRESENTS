import Image from "next/image";

export default function ProfileLoading() {
  return (
    <div className="max-w-md mx-auto px-4 py-6 md:py-8 space-y-6">
      {/* Cat mascot loading */}
      <div className="flex flex-col items-center pt-4 pb-2">
        <div className="relative">
          <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl rep-loading-glow" />
          <Image
            src="/pwa-icon-192.png"
            alt=""
            width={72}
            height={72}
            className="relative rounded-2xl rep-loading-cat"
            priority
          />
        </div>
        <div className="flex gap-1.5 mt-4">
          <span className="w-1.5 h-1.5 rounded-full bg-primary rep-loading-dot-1" />
          <span className="w-1.5 h-1.5 rounded-full bg-primary rep-loading-dot-2" />
          <span className="w-1.5 h-1.5 rounded-full bg-primary rep-loading-dot-3" />
        </div>
      </div>
      {/* Skeleton hints */}
      <div className="space-y-4">
        <div className="h-12 rounded-xl bg-muted/30 animate-pulse" />
        <div className="h-12 rounded-xl bg-muted/30 animate-pulse" />
        <div className="h-12 rounded-xl bg-muted/30 animate-pulse" />
        <div className="h-12 rounded-xl bg-muted/30 animate-pulse" />
      </div>
    </div>
  );
}
