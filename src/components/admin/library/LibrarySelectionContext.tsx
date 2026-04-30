"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface LibrarySelectionState {
  selectedIds: Set<string>;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  add: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
  count: number;
}

const Ctx = createContext<LibrarySelectionState | null>(null);

/**
 * Selection state shared between every library surface (the All-assets
 * grid, the campaign canvas grid, the campaign hero cards) so the same
 * floating action bar can collect from anywhere.
 *
 * Using a Set means O(1) toggle / lookup — important when reps with
 * thousands of assets shift-select across pages.
 */
export function LibrarySelectionProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds]
  );

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const add = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  const value = useMemo<LibrarySelectionState>(
    () => ({
      selectedIds,
      isSelected,
      toggle,
      add,
      remove,
      clear,
      count: selectedIds.size,
    }),
    [selectedIds, isSelected, toggle, add, remove, clear]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLibrarySelection(): LibrarySelectionState {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useLibrarySelection must be used inside a LibrarySelectionProvider"
    );
  }
  return ctx;
}
