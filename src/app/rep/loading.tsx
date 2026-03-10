export default function DashboardLoading() {
  return (
    <div className="max-w-2xl mx-auto px-5 py-6 md:py-8 space-y-6">
      {/* Welcome skeleton */}
      <div className="flex flex-col items-center">
        <div className="h-24 w-24 rounded-full bg-secondary animate-pulse mb-3" />
        <div className="h-5 w-40 rounded bg-secondary animate-pulse mb-2" />
        <div className="h-6 w-32 rounded-full bg-secondary animate-pulse" />
        <div className="h-2.5 w-48 mt-3 rounded-full bg-secondary animate-pulse" />
      </div>
      {/* Discount code skeleton */}
      <div className="h-[130px] rounded-2xl bg-secondary animate-pulse" />
      {/* Stats skeleton */}
      <div className="grid grid-cols-3 gap-3">
        <div className="h-[160px] rounded-2xl bg-secondary animate-pulse" />
        <div className="h-[160px] rounded-2xl bg-secondary animate-pulse" />
        <div className="h-[160px] rounded-2xl bg-secondary animate-pulse" />
      </div>
      {/* Quick links skeleton */}
      <div className="grid grid-cols-2 gap-3">
        <div className="h-[88px] rounded-2xl bg-secondary animate-pulse" />
        <div className="h-[88px] rounded-2xl bg-secondary animate-pulse" />
      </div>
    </div>
  );
}
