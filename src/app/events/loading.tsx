export default function EventsLoading() {
  return (
    <div className="min-h-screen bg-[var(--bg-dark,#0e0e0e)]">
      {/* Page header skeleton */}
      <div className="pt-32 pb-10 px-6">
        <div className="max-w-[1200px] mx-auto">
          <div className="h-3 w-24 bg-white/5 rounded mb-4 animate-pulse" />
          <div className="h-12 w-48 bg-white/5 rounded mb-4 animate-pulse" />
          <div className="h-0.5 w-[60px] bg-white/5 rounded animate-pulse" />
        </div>
      </div>

      {/* Grid skeleton */}
      <div className="px-6 pb-20">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.03] overflow-hidden"
            >
              {/* Image skeleton */}
              <div className="aspect-video bg-white/[0.04] animate-pulse" />
              {/* Content skeleton */}
              <div className="p-6 space-y-3">
                <div className="h-2.5 w-20 bg-white/5 rounded animate-pulse" />
                <div className="h-6 w-3/4 bg-white/5 rounded animate-pulse" />
                <div className="h-3 w-1/2 bg-white/5 rounded animate-pulse" />
                <div className="h-3 w-1/3 bg-white/5 rounded animate-pulse" />
                <div className="pt-4 border-t border-white/[0.06]">
                  <div className="h-10 w-full bg-white/[0.04] rounded-lg animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
