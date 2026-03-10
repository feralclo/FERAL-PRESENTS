export default function SalesLoading() {
  return (
    <div className="max-w-2xl mx-auto px-5 py-6 md:py-8 space-y-6">
      <div>
        <div className="h-6 w-24 rounded bg-secondary animate-pulse mb-2" />
        <div className="h-4 w-48 rounded bg-secondary animate-pulse" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="h-[88px] rounded-2xl bg-secondary animate-pulse" />
        <div className="h-[88px] rounded-2xl bg-secondary animate-pulse" />
        <div className="h-[88px] rounded-2xl bg-secondary animate-pulse" />
      </div>
      <div className="space-y-3">
        <div className="h-4 w-20 rounded bg-secondary animate-pulse" />
        <div className="h-[68px] rounded-xl bg-secondary animate-pulse" />
        <div className="h-[68px] rounded-xl bg-secondary animate-pulse" />
        <div className="h-[68px] rounded-xl bg-secondary animate-pulse" />
        <div className="h-[68px] rounded-xl bg-secondary animate-pulse" />
      </div>
    </div>
  );
}
