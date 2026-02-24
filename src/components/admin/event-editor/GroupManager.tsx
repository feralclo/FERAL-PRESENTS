"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Info, Plus } from "lucide-react";
import type { UpdateSettingFn } from "./types";
import type { EventSettings } from "@/types/settings";

const RELEASE_MODES = [
  { value: "all", label: "All at once" },
  { value: "sequential", label: "Sequential release" },
] as const;

interface GroupManagerProps {
  settings: EventSettings;
  updateSetting: UpdateSettingFn;
}

export function GroupManager({ settings, updateSetting }: GroupManagerProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState("");

  const groups = (settings.ticket_groups as string[]) || [];
  const groupMap =
    (settings.ticket_group_map as Record<string, string | null>) || {};

  const handleCreate = () => {
    const trimmed = groupName.trim();
    if (!trimmed || groups.includes(trimmed)) return;
    updateSetting("ticket_groups", [...groups, trimmed]);
    setGroupName("");
    setShowCreate(false);
  };

  const handleRename = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || groups.includes(trimmed)) return;
    updateSetting(
      "ticket_groups",
      groups.map((g) => (g === oldName ? trimmed : g))
    );
    const updatedMap = { ...groupMap };
    for (const k of Object.keys(updatedMap)) {
      if (updatedMap[k] === oldName) updatedMap[k] = trimmed;
    }
    updateSetting("ticket_group_map", updatedMap);
  };

  const handleDelete = (name: string) => {
    updateSetting(
      "ticket_groups",
      groups.filter((g) => g !== name)
    );
    const updatedMap = { ...groupMap };
    for (const k of Object.keys(updatedMap)) {
      if (updatedMap[k] === name) updatedMap[k] = null;
    }
    updateSetting("ticket_group_map", updatedMap);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowCreate(true)}
      >
        <Plus size={14} />
        Create Group
      </Button>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Ticket Group</DialogTitle>
            <DialogDescription>
              Groups organize tickets into sections on your event page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Group Name</Label>
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. VIP Experiences"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreate();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!groupName.trim()}>
              Create Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Inline group editor for each group header */
export function GroupHeader({
  name,
  ticketCount,
  index,
  total,
  settings,
  updateSetting,
  onMoveUp,
  onMoveDown,
}: {
  name: string;
  ticketCount: number;
  index: number;
  total: number;
  settings: EventSettings;
  updateSetting: UpdateSettingFn;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const groups = (settings.ticket_groups as string[]) || [];
  const groupMap =
    (settings.ticket_group_map as Record<string, string | null>) || {};
  const releaseMode =
    (settings.ticket_group_release_mode as Record<string, "all" | "sequential">) || {};
  const currentMode = releaseMode[name] || "all";

  const handleRename = () => {
    const trimmed = editName.trim();
    if (!trimmed || (trimmed !== name && groups.includes(trimmed))) return;
    if (trimmed !== name) {
      updateSetting(
        "ticket_groups",
        groups.map((g) => (g === name ? trimmed : g))
      );
      const updatedMap = { ...groupMap };
      for (const k of Object.keys(updatedMap)) {
        if (updatedMap[k] === name) updatedMap[k] = trimmed;
      }
      updateSetting("ticket_group_map", updatedMap);
      // Migrate release mode key
      if (releaseMode[name]) {
        const { [name]: oldMode, ...rest } = releaseMode;
        updateSetting("ticket_group_release_mode", { ...rest, [trimmed]: oldMode });
      }
    }
    setEditing(false);
  };

  const handleDelete = () => {
    updateSetting(
      "ticket_groups",
      groups.filter((g) => g !== name)
    );
    const updatedMap = { ...groupMap };
    for (const k of Object.keys(updatedMap)) {
      if (updatedMap[k] === name) updatedMap[k] = null;
    }
    updateSetting("ticket_group_map", updatedMap);
    // Clean up release mode
    const { [name]: _, ...restRelease } = releaseMode;
    updateSetting("ticket_group_release_mode", restRelease);
    setShowDeleteConfirm(false);
  };

  const handleReleaseModeChange = (mode: "all" | "sequential") => {
    if (mode === "all") {
      const { [name]: _, ...rest } = releaseMode;
      updateSetting("ticket_group_release_mode", rest);
    } else {
      updateSetting("ticket_group_release_mode", { ...releaseMode, [name]: mode });
    }
  };

  return (
    <div className="rounded-t-md bg-muted/40 border-b border-border px-4 py-2.5">
    <div className="flex items-center gap-3">
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={index === 0}
          className="text-[10px] text-muted-foreground/60 hover:text-foreground disabled:opacity-30 transition-colors"
        >
          ▲
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={index === total - 1}
          className="text-[10px] text-muted-foreground/60 hover:text-foreground disabled:opacity-30 transition-colors"
        >
          ▼
        </button>
      </div>

      {editing ? (
        <div className="flex items-center gap-2 flex-1">
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="h-7 text-xs max-w-[200px]"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <Button variant="outline" size="xs" onClick={handleRename}>
            Save
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <>
          <span className="flex-1 font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
            {name}
          </span>
          <span className="text-[10px] text-muted-foreground/60 font-mono">
            {ticketCount} ticket{ticketCount !== 1 ? "s" : ""}
          </span>
          <select
            value={currentMode}
            onChange={(e) => handleReleaseModeChange(e.target.value as "all" | "sequential")}
            className="h-6 text-[10px] font-mono bg-transparent border border-border rounded px-1.5 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
          >
            {RELEASE_MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              setEditName(name);
              setEditing(true);
            }}
            className="text-muted-foreground"
          >
            Edit
          </Button>
          {showDeleteConfirm ? (
            <div className="flex items-center gap-1">
              <Button
                variant="destructive"
                size="xs"
                onClick={handleDelete}
              >
                Yes
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setShowDeleteConfirm(false)}
              >
                No
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setShowDeleteConfirm(true)}
              className="text-muted-foreground hover:text-destructive"
            >
              Remove
            </Button>
          )}
        </>
      )}
    </div>
    {currentMode === "sequential" && (
      <div className="flex items-center gap-1.5 mt-1.5 ml-7">
        <Info size={11} className="text-primary/60 shrink-0" />
        <span className="text-[10px] text-muted-foreground/70">
          Tickets reveal one at a time as each sells out. Drag to set the release order.
        </span>
      </div>
    )}
    </div>
  );
}
