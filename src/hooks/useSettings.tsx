"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { saveSettings } from "@/lib/settings";
import { TABLES } from "@/lib/constants";
import type { EventSettings } from "@/types/settings";

interface SettingsContextValue {
  settings: EventSettings | null;
  settingsKey: string;
  save: (data: EventSettings) => Promise<{ error: Error | null }>;
  isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: null,
  settingsKey: "",
  save: async () => ({ error: null }),
  isLoading: false,
});

interface SettingsProviderProps {
  children: ReactNode;
  settingsKey: string;
  /** Initial settings fetched server-side — prevents FOUC */
  initialSettings: EventSettings | null;
}

/**
 * Provides event settings to all child components.
 *
 * Architecture:
 * 1. Server Component fetches settings and passes as initialSettings (no FOUC)
 * 2. Provider hydrates with that data — available on first render
 * 3. Supabase realtime subscription listens for admin changes
 * 4. Settings auto-update when admin saves (within seconds)
 */
export function SettingsProvider({
  children,
  settingsKey,
  initialSettings,
}: SettingsProviderProps) {
  const [settings, setSettings] = useState<EventSettings | null>(
    initialSettings
  );
  const [isLoading] = useState(false);

  // Cache initial settings to localStorage for offline/fast access
  useEffect(() => {
    if (initialSettings && settingsKey) {
      try {
        localStorage.setItem(settingsKey, JSON.stringify(initialSettings));
      } catch {
        // localStorage may be unavailable
      }
    }
  }, [initialSettings, settingsKey]);

  // Subscribe to realtime changes from admin dashboard
  useEffect(() => {
    if (!settingsKey) return;

    const supabase = getSupabaseClient();
    if (!supabase) return; // Env vars not configured — skip realtime

    const channel = supabase
      .channel(`settings:${settingsKey}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: TABLES.SITE_SETTINGS,
          filter: `key=eq.${settingsKey}`,
        },
        (payload) => {
          if (payload.new && "data" in payload.new) {
            const newSettings = payload.new.data as EventSettings;
            setSettings(newSettings);
            try {
              localStorage.setItem(settingsKey, JSON.stringify(newSettings));
            } catch {
              // ignore
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [settingsKey]);

  const save = useCallback(
    async (data: EventSettings) => {
      setSettings(data);
      return saveSettings(settingsKey, data);
    },
    [settingsKey]
  );

  const value = useMemo(
    () => ({ settings, settingsKey, save, isLoading }),
    [settings, settingsKey, save, isLoading]
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

/**
 * Hook to access event settings from any client component.
 * Settings are available immediately (no loading state) because they're fetched server-side.
 */
export function useSettings() {
  return useContext(SettingsContext);
}
