"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FunnelStage {
  label: string;
  count: number;
}

function FunnelChart({
  stages,
  title = "Today's Funnel",
}: {
  stages: FunnelStage[];
  title?: string;
}) {
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <Card className="py-0 gap-0">
      <CardHeader className="px-5 pt-5 pb-3">
        <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="space-y-3">
          {stages.map((stage, i) => {
            const pct = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
            const convRate =
              i > 0 && stages[i - 1].count > 0
                ? ((stage.count / stages[i - 1].count) * 100).toFixed(1)
                : null;

            return (
              <div key={stage.label}>
                <div className="mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium text-foreground">
                      {stage.label}
                    </span>
                    {convRate && (
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                        {convRate}%
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">
                    {stage.count.toLocaleString()}
                  </span>
                </div>
                <div className="h-6 w-full overflow-hidden rounded-md bg-secondary">
                  <div
                    className="h-full rounded-md transition-all duration-700 ease-out"
                    style={{
                      width: `${Math.max(pct, 2)}%`,
                      background: `linear-gradient(90deg, rgba(139,92,246,0.6), rgba(139,92,246,0.3))`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Overall conversion rate */}
        {stages.length >= 2 && stages[0].count > 0 && (
          <div className="mt-4 flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2">
            <span className="text-[11px] font-medium text-muted-foreground">
              Overall Conversion
            </span>
            <span className="font-mono text-sm font-bold text-primary">
              {((stages[stages.length - 1].count / stages[0].count) * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { FunnelChart };
