"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface TopEventRow {
  eventName: string;
  eventSlug: string;
  views: number;
  sales: number;
  revenue: number;
}

function TopEventsTable({
  events,
  currencySymbol = "£",
}: {
  events: TopEventRow[];
  currencySymbol?: string;
}) {
  if (events.length === 0) {
    return (
      <Card className="py-0 gap-0">
        <CardHeader className="px-5 pt-5 pb-3">
          <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
            Top Events Today
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="flex h-20 items-center justify-center">
            <p className="text-sm text-muted-foreground">No event activity today</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="py-0 gap-0">
      <CardHeader className="px-5 pt-5 pb-3">
        <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[2px] text-muted-foreground">
          Top Events Today
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50">
              <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Event
              </TableHead>
              <TableHead className="text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Views
              </TableHead>
              <TableHead className="text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Orders
              </TableHead>
              <TableHead className="text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Revenue
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((ev) => (
              <TableRow key={ev.eventSlug} className="border-border/30">
                <TableCell className="max-w-[140px] truncate text-[13px] font-medium text-foreground">
                  {ev.eventName}
                </TableCell>
                <TableCell className="text-right font-mono text-[13px] tabular-nums text-muted-foreground">
                  {ev.views.toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-mono text-[13px] tabular-nums text-muted-foreground">
                  {ev.sales.toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-mono text-[13px] tabular-nums text-foreground">
                  {currencySymbol}{ev.revenue.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export { TopEventsTable };
