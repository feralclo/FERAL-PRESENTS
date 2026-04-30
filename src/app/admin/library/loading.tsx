/**
 * Loading skeleton for /admin/library — matches the populated shell shape
 * (rail + canvas) so first paint feels instant rather than empty.
 */
export default function LibraryLoading() {
  return (
    <div className="px-4 py-6 lg:px-8 lg:py-8">
      <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-8">
        <div className="hidden lg:block">
          <div className="rounded-xl border border-border/40 bg-card p-3 space-y-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-12 rounded-md bg-foreground/[0.04] animate-pulse"
              />
            ))}
          </div>
        </div>
        <div className="space-y-6">
          <div className="h-9 w-40 rounded-md bg-foreground/[0.04] animate-pulse" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-lg bg-foreground/[0.04] animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
