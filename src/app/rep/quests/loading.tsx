export default function QuestsLoading() {
  return (
    <div className="max-w-2xl mx-auto px-5 py-6 md:py-8 space-y-6">
      <div className="flex flex-col items-center gap-3 pt-2">
        <div className="h-12 w-12 rounded-2xl bg-secondary animate-pulse" />
        <div className="h-6 w-24 rounded bg-secondary animate-pulse" />
        <div className="h-4 w-48 rounded bg-secondary animate-pulse" />
      </div>
      <div className="h-10 rounded-xl bg-secondary animate-pulse" />
      <div className="space-y-3">
        <div className="h-[160px] rounded-2xl bg-secondary animate-pulse" />
        <div className="h-[160px] rounded-2xl bg-secondary animate-pulse" />
        <div className="h-[160px] rounded-2xl bg-secondary animate-pulse" />
      </div>
    </div>
  );
}
