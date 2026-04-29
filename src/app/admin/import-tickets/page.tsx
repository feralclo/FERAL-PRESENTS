"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/components/admin/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  XCircle,
  Ticket,
  History,
} from "lucide-react";
import { parseCSV, autoDetectMapping, applyMapping } from "@/lib/import-csv";
import type {
  ColumnMapping,
  ImportTicketRow,
  ImportResult,
  TicketTypeMapping,
} from "@/types/import-tickets";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EventOption {
  id: string;
  name: string;
  date_start?: string;
}

interface ImportHistoryEntry {
  id: string;
  order_number: string;
  created_at: string;
  metadata: {
    import_source?: string;
    import_ticket_count?: number;
  };
  event?: { name: string };
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

const STEPS = ["Upload", "Map & Configure", "Import"] as const;

function StepIndicator({
  current,
  completed,
}: {
  current: number;
  completed: number;
}) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((label, i) => {
        const isCompleted = i < completed;
        const isCurrent = i === current;
        return (
          <div key={label} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={`h-px w-8 sm:w-12 ${
                  i <= completed ? "bg-primary" : "bg-border"
                }`}
              />
            )}
            <div className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                  isCompleted
                    ? "bg-primary text-primary-foreground"
                    : isCurrent
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border text-muted-foreground"
                }`}
              >
                {isCompleted ? <Check size={14} /> : i + 1}
              </div>
              <span
                className={`hidden sm:block text-xs font-medium ${
                  isCurrent
                    ? "text-foreground"
                    : isCompleted
                      ? "text-primary"
                      : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ImportTicketsPage() {
  // Wizard state
  const [step, setStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(0);

  // Step 1: Upload
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [sourcePlatform, setSourcePlatform] = useState("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2: Mapping
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    barcode: null,
    first_name: null,
    last_name: null,
    full_name: null,
    email: null,
    ticket_type: null,
  });
  const [ticketTypeMappings, setTicketTypeMappings] = useState<
    TicketTypeMapping[]
  >([]);

  // Step 3: Import
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Import history
  const [history, setHistory] = useState<ImportHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // ── Load events ──
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/events");
        const json = await res.json();
        if (json.data) setEvents(json.data);
      } catch {
        // silent
      }
      setLoadingEvents(false);
    }
    load();
  }, []);

  // ── Load import history ──
  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch("/api/admin/import-tickets");
        const json = await res.json();
        if (json.data) setHistory(json.data);
      } catch {
        // silent
      }
    }
    loadHistory();
  }, [importResult]);

  // ── File handling ──
  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".csv")) return;
      setFileName(file.name);

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const { headers, rows } = parseCSV(text);
        setCsvHeaders(headers);
        setCsvRows(rows);

        // Auto-detect column mapping
        const detected = autoDetectMapping(headers);
        setColumnMapping(detected);

        // Auto-detect source from filename
        if (!sourcePlatform) {
          const lower = file.name.toLowerCase();
          if (lower.includes("skiddle")) setSourcePlatform("Skiddle");
          else if (lower.includes("eventbrite"))
            setSourcePlatform("Eventbrite");
          else if (lower.includes("ra") || lower.includes("resident"))
            setSourcePlatform("Resident Advisor");
          else if (lower.includes("dice")) setSourcePlatform("DICE");
          else if (lower.includes("fatsoma")) setSourcePlatform("Fatsoma");
        }
      };
      reader.readAsText(file);
    },
    [sourcePlatform]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  // ── Build mapped tickets for preview + import (memoized) ──
  const mappedTickets = useMemo(
    () =>
      csvRows
        .map((row) => applyMapping(row, csvHeaders, columnMapping))
        .filter((t): t is ImportTicketRow => t !== null),
    [csvRows, csvHeaders, columnMapping]
  );

  // ── Detect unique ticket types when mapping changes ──
  useEffect(() => {
    if (mappedTickets.length === 0) return;
    const typeCounts = new Map<string, number>();

    for (const t of mappedTickets) {
      typeCounts.set(t.ticket_type, (typeCounts.get(t.ticket_type) || 0) + 1);
    }

    setTicketTypeMappings(
      [...typeCounts.entries()].map(([name, count]) => {
        // Preserve existing display name if type was already mapped
        const existing = ticketTypeMappings.find(
          (m) => m.externalName === name
        );
        return {
          externalName: name,
          displayName:
            existing?.displayName ||
            `${name}${sourcePlatform ? ` (${sourcePlatform})` : ""}`,
          count,
        };
      })
    );
    // Only re-run when mapped tickets or source platform changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mappedTickets, sourcePlatform]);

  // ── Navigation ──
  const canProceedStep0 =
    selectedEventId && csvRows.length > 0 && sourcePlatform.trim();

  const canProceedStep1 = columnMapping.barcode !== null;

  const goToStep = useCallback(
    (target: number) => {
      setStep(target);
      if (target > completedSteps) setCompletedSteps(target);
    },
    [completedSteps]
  );

  // ── Import ──
  const handleImport = useCallback(async () => {
    setImporting(true);
    setImportResult(null);

    const tickets = mappedTickets;

    try {
      const res = await fetch("/api/admin/import-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: selectedEventId,
          source_platform: sourcePlatform,
          ticket_type_mappings: ticketTypeMappings,
          tickets,
        }),
      });

      const json = await res.json();
      if (json.error) {
        setImportResult({
          imported: 0,
          skipped: tickets.length,
          errors: [{ row: 0, barcode: "", reason: json.error }],
          batch_id: "",
        });
      } else {
        setImportResult(json.data);
      }
    } catch {
      setImportResult({
        imported: 0,
        skipped: tickets.length,
        errors: [{ row: 0, barcode: "", reason: "Network error" }],
        batch_id: "",
      });
    }

    setImporting(false);
  }, [
    mappedTickets,
    selectedEventId,
    sourcePlatform,
    ticketTypeMappings,
  ]);

  // ── Reset for new import ──
  const resetWizard = useCallback(() => {
    setStep(0);
    setCompletedSteps(0);
    setSelectedEventId("");
    setSourcePlatform("");
    setCsvHeaders([]);
    setCsvRows([]);
    setFileName("");
    setColumnMapping({
      barcode: null,
      first_name: null,
      last_name: null,
      full_name: null,
      email: null,
      ticket_type: null,
    });
    setTicketTypeMappings([]);
    setImportResult(null);
  }, []);

  // ── Mapped preview data ──
  const previewTickets = mappedTickets.slice(0, 8);
  const totalMapped = mappedTickets.length;

  // ── Render ──
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <AdminPageHeader
          title="Import External Tickets"
          subtitle="Import tickets from Skiddle, Eventbrite, RA, or any external platform so they can be scanned with the Entry scanner."
        />
      </div>

      {/* Step Indicator */}
      <StepIndicator current={step} completed={completedSteps} />

      {/* ── Step 0: Upload ──────────────────────────────────────────── */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload Ticket Data</CardTitle>
            <CardDescription>
              Select the event, choose the source platform, and upload a CSV
              export.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Event + Source Row */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Event</Label>
                {loadingEvents ? (
                  <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3">
                    <Loader2 size={14} className="animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Loading events...
                    </span>
                  </div>
                ) : (
                  <Select
                    value={selectedEventId}
                    onValueChange={setSelectedEventId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select event..." />
                    </SelectTrigger>
                    <SelectContent>
                      {events.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name}
                          {e.date_start && (
                            <span className="ml-2 text-muted-foreground">
                              {new Date(e.date_start).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                              })}
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-2">
                <Label>Source Platform</Label>
                <Input
                  placeholder="e.g. Skiddle, Eventbrite, RA..."
                  value={sourcePlatform}
                  onChange={(e) => setSourcePlatform(e.target.value)}
                />
              </div>
            </div>

            {/* File Upload Zone */}
            <div className="space-y-2">
              <Label>CSV File</Label>
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
                  csvRows.length > 0
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:border-primary/40 hover:bg-primary/5"
                } px-6 py-10`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
                {csvRows.length > 0 ? (
                  <>
                    <FileSpreadsheet
                      size={32}
                      className="mb-3 text-primary"
                    />
                    <p className="text-sm font-medium text-foreground">
                      {fileName}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {csvRows.length} rows &middot; {csvHeaders.length}{" "}
                      columns detected
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Click or drag to replace
                    </p>
                  </>
                ) : (
                  <>
                    <Upload size={32} className="mb-3 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-muted-foreground">
                      Drag and drop your CSV file here
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      or click to browse
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Continue */}
            <div className="flex justify-end">
              <Button
                disabled={!canProceedStep0}
                onClick={() => goToStep(1)}
              >
                Continue
                <ArrowRight size={14} className="ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 1: Map & Configure ─────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Column Mapping */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Column Mapping</CardTitle>
              <CardDescription>
                Map CSV columns to ticket fields. We auto-detected what we
                could.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {(
                  [
                    { key: "barcode", label: "Barcode / Ticket Code", required: true },
                    { key: "first_name", label: "First Name", required: false },
                    { key: "last_name", label: "Last Name", required: false },
                    { key: "full_name", label: "Full Name", required: false },
                    { key: "email", label: "Email", required: false },
                    { key: "ticket_type", label: "Ticket Type", required: false },
                  ] as const
                ).map(({ key, label, required }) => (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-xs">
                      {label}
                      {required && (
                        <span className="ml-1 text-destructive">*</span>
                      )}
                    </Label>
                    <Select
                      value={columnMapping[key] || "__none__"}
                      onValueChange={(v) =>
                        setColumnMapping((prev) => ({
                          ...prev,
                          [key]: v === "__none__" ? null : v,
                        }))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Not mapped" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">
                          <span className="text-muted-foreground">
                            Not mapped
                          </span>
                        </SelectItem>
                        {csvHeaders.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              {!columnMapping.barcode && (
                <Alert variant="destructive" className="mt-4">
                  <AlertTriangle size={14} />
                  <AlertDescription>
                    Barcode column is required — this is the value encoded in
                    each ticket&apos;s QR code.
                  </AlertDescription>
                </Alert>
              )}

              {!columnMapping.first_name &&
                !columnMapping.last_name &&
                !columnMapping.full_name && (
                  <Alert variant="warning" className="mt-4">
                    <AlertTriangle size={14} />
                    <AlertDescription>
                      No name column mapped — ticket holder names will be empty
                      in scan results.
                    </AlertDescription>
                  </Alert>
                )}
            </CardContent>
          </Card>

          {/* Ticket Type Mapping */}
          {ticketTypeMappings.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ticket Types</CardTitle>
                <CardDescription>
                  These are the ticket types found in your CSV. Customize how
                  they&apos;ll appear to door staff when scanned.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {ticketTypeMappings.map((mapping, idx) => (
                    <div
                      key={mapping.externalName}
                      className="flex items-center gap-3"
                    >
                      <Badge variant="secondary" className="min-w-[80px] justify-center shrink-0">
                        {mapping.count}
                      </Badge>
                      <span className="shrink-0 text-xs text-muted-foreground font-mono">
                        {mapping.externalName}
                      </span>
                      <ArrowRight
                        size={14}
                        className="shrink-0 text-muted-foreground"
                      />
                      <Input
                        value={mapping.displayName}
                        onChange={(e) => {
                          const updated = [...ticketTypeMappings];
                          updated[idx] = {
                            ...mapping,
                            displayName: e.target.value,
                          };
                          setTicketTypeMappings(updated);
                        }}
                        className="h-8 text-xs"
                        placeholder="Display name for scanner..."
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Preview */}
          {previewTickets.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Preview
                  <Badge variant="outline" className="ml-2">
                    {totalMapped} tickets
                  </Badge>
                </CardTitle>
                <CardDescription>
                  First {Math.min(previewTickets.length, 8)} rows after column
                  mapping.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Barcode</TableHead>
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs">Email</TableHead>
                        <TableHead className="text-xs">Type</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewTickets.map((t, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">
                            {t.barcode}
                          </TableCell>
                          <TableCell className="text-xs">
                            {[t.first_name, t.last_name]
                              .filter(Boolean)
                              .join(" ") || (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {t.email || (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {t.ticket_type}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Navigation */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => goToStep(0)}>
              <ArrowLeft size={14} className="mr-2" />
              Back
            </Button>
            <Button
              disabled={!canProceedStep1}
              onClick={() => goToStep(2)}
            >
              Continue
              <ArrowRight size={14} className="ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Import ──────────────────────────────────────────── */}
      {step === 2 && !importResult && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ready to Import</CardTitle>
              <CardDescription>
                Review the summary below and confirm the import.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Summary Grid */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-card/50 p-4">
                  <p className="text-xs text-muted-foreground mb-1">Event</p>
                  <p className="text-sm font-medium">
                    {events.find((e) => e.id === selectedEventId)?.name}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card/50 p-4">
                  <p className="text-xs text-muted-foreground mb-1">Source</p>
                  <p className="text-sm font-medium">{sourcePlatform}</p>
                </div>
                <div className="rounded-lg border border-border bg-card/50 p-4">
                  <p className="text-xs text-muted-foreground mb-1">
                    Tickets to Import
                  </p>
                  <p className="text-sm font-medium">{totalMapped}</p>
                </div>
                <div className="rounded-lg border border-border bg-card/50 p-4">
                  <p className="text-xs text-muted-foreground mb-1">
                    Ticket Types
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {ticketTypeMappings.map((m) => (
                      <Badge key={m.externalName} variant="outline" className="text-xs">
                        {m.displayName} ({m.count})
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              <Alert>
                <Ticket size={14} />
                <AlertDescription>
                  Imported tickets will use the barcode from your CSV as the
                  scannable QR code value. Customers keep their existing
                  tickets — nothing is sent to them.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => goToStep(1)}>
              <ArrowLeft size={14} className="mr-2" />
              Back
            </Button>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? (
                <>
                  <Loader2 size={14} className="mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  Import {totalMapped} Tickets
                  <Check size={14} className="ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── Import Results ──────────────────────────────────────────── */}
      {step === 2 && importResult && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                {importResult.imported > 0 ? (
                  <>
                    <CheckCircle2 size={18} className="text-success" />
                    Import Complete
                  </>
                ) : (
                  <>
                    <XCircle size={18} className="text-destructive" />
                    Import Failed
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Stats */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-success/20 bg-success/5 p-4 text-center">
                  <p className="text-2xl font-bold text-success">
                    {importResult.imported}
                  </p>
                  <p className="text-xs text-muted-foreground">Imported</p>
                </div>
                <div className="rounded-lg border border-warning/20 bg-warning/5 p-4 text-center">
                  <p className="text-2xl font-bold text-warning">
                    {importResult.skipped}
                  </p>
                  <p className="text-xs text-muted-foreground">Skipped</p>
                </div>
                <div className="rounded-lg border border-border bg-card/50 p-4 text-center">
                  <p className="text-2xl font-bold text-foreground">
                    {importResult.order_number || "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Batch Order
                  </p>
                </div>
              </div>

              {/* Errors */}
              {importResult.errors.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Errors ({importResult.errors.length})
                  </p>
                  <div className="max-h-48 overflow-y-auto rounded-md border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Row</TableHead>
                          <TableHead className="text-xs">Barcode</TableHead>
                          <TableHead className="text-xs">Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importResult.errors.map((err, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">
                              {err.row || "—"}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {err.barcode || "—"}
                            </TableCell>
                            <TableCell className="text-xs text-destructive">
                              {err.reason}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {importResult.imported > 0 && (
                <Alert variant="success">
                  <CheckCircle2 size={14} />
                  <AlertDescription>
                    {importResult.imported} tickets are now scannable with the
                    Entry scanner. Door staff will see the correct ticket type
                    and holder name for each ticket.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={resetWizard}>
              Import Another Batch
            </Button>
          </div>
        </div>
      )}

      {/* ── Import History ──────────────────────────────────────────── */}
      {history.length > 0 && step === 0 && !importResult && (
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <History size={14} />
            Past Imports ({history.length})
          </button>

          {showHistory && (
            <div className="mt-3 overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Event</TableHead>
                    <TableHead className="text-xs">Source</TableHead>
                    <TableHead className="text-xs">Tickets</TableHead>
                    <TableHead className="text-xs">Batch</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-xs">
                        {new Date(h.created_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-xs">
                        {h.event?.name || "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {h.metadata?.import_source || "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {h.metadata?.import_ticket_count || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {h.order_number}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
