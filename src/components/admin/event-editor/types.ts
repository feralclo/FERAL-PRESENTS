import type { Event, TicketTypeRow } from "@/types/events";
import type { EventSettings } from "@/types/settings";

/** Callback to update a single field on the event */
export type UpdateEventFn = (field: string, value: unknown) => void;

/** Callback to update a single field on settings */
export type UpdateSettingFn = (field: string, value: unknown) => void;

/** Callback to update a single field on a ticket type by index */
export type UpdateTicketTypeFn = (
  index: number,
  field: string,
  value: unknown
) => void;

/** Currency symbol lookup */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: "\u00a3",
  EUR: "\u20ac",
  USD: "$",
};

/** Shared props for all tab components */
export interface TabProps {
  event: Event;
  updateEvent: UpdateEventFn;
}

/** Props for tabs that also need settings */
export interface TabWithSettingsProps extends TabProps {
  settings: EventSettings;
  updateSetting: UpdateSettingFn;
}

/** Props for the tickets tab */
export interface TicketsTabProps extends TabWithSettingsProps {
  ticketTypes: TicketTypeRow[];
  setTicketTypes: React.Dispatch<React.SetStateAction<TicketTypeRow[]>>;
  deletedTypeIds: string[];
  setDeletedTypeIds: React.Dispatch<React.SetStateAction<string[]>>;
}
