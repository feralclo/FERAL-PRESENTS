export default function RewardsLoading() {
  return (
    <div className="max-w-2xl mx-auto px-5 py-6 md:py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-6 w-28 rounded bg-secondary animate-pulse mb-2" />
          <div className="h-4 w-36 rounded bg-secondary animate-pulse" />
        </div>
        <div className="h-16 w-24 rounded-xl bg-secondary animate-pulse" />
      </div>
      <div className="h-10 rounded-xl bg-secondary animate-pulse" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-[200px] rounded-2xl bg-secondary animate-pulse" />
        <div className="h-[200px] rounded-2xl bg-secondary animate-pulse" />
        <div className="h-[200px] rounded-2xl bg-secondary animate-pulse" />
        <div className="h-[200px] rounded-2xl bg-secondary animate-pulse" />
      </div>
    </div>
  );
}
