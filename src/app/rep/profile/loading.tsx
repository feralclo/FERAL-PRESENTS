export default function ProfileLoading() {
  return (
    <div className="max-w-md mx-auto px-4 py-6 md:py-8 space-y-6">
      <div className="flex flex-col items-center">
        <div className="h-24 w-24 rounded-full bg-muted/50 animate-pulse mb-4" />
        <div className="h-5 w-40 rounded bg-muted/50 animate-pulse mb-2" />
        <div className="h-4 w-28 rounded bg-muted/50 animate-pulse" />
      </div>
      <div className="space-y-4">
        <div className="h-12 rounded-xl bg-muted/50 animate-pulse" />
        <div className="h-12 rounded-xl bg-muted/50 animate-pulse" />
        <div className="h-12 rounded-xl bg-muted/50 animate-pulse" />
        <div className="h-12 rounded-xl bg-muted/50 animate-pulse" />
      </div>
    </div>
  );
}
