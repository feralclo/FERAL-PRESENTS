"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type KeyboardEvent,
} from "react";
import { Loader2, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * PlaceAutocomplete — typeahead for venue and city inputs.
 *
 * Backed by Google Places API (New). The API key is restricted by HTTP
 * referrer in Google Cloud, so direct browser calls are safe; no server
 * proxy required for v1. Future hardening could add a Next.js route
 * handler for caching, rate-limiting, or vendor-swap flexibility.
 *
 * Graceful fallback: when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is missing,
 * the component renders a plain `<Input>` and the rest of the form keeps
 * working as a free-text field. This keeps local dev and tests usable
 * without provisioning a key.
 *
 * Cost optimisation: each "look at suggestions → pick one" cycle is
 * billed as a single session if we pass the same `sessionToken` to both
 * autocomplete and place-details. Token rotates on every selection.
 */

const PLACES_API_BASE = "https://places.googleapis.com/v1";
const DEBOUNCE_MS = 250;
const MAX_SUGGESTIONS = 5;

export interface PlaceResult {
  /** Display name of the place. For venues this is the business name. */
  name: string;
  /** Full formatted address ("3 Regent Rd, Liverpool L3 7DS, UK"). */
  address: string;
  /** Locality (city). May be empty if the API didn't tag one. */
  city: string;
  /** ISO 3166-1 alpha-2 country code (e.g. "GB"). May be empty. */
  country: string;
  /** Geo coordinates if the place has them. */
  lat?: number;
  lng?: number;
}

interface PlaceAutocompleteProps {
  value: string;
  onChange: (text: string) => void;
  /** Fires when the user picks a suggestion. The text input is also auto-updated. */
  onPlaceSelected?: (place: PlaceResult) => void;
  /** "venue" biases to businesses, "city" biases to localities. Defaults to "venue". */
  mode?: "venue" | "city";
  placeholder?: string;
  id?: string;
  className?: string;
  /** Pass through to the underlying Input (e.g. autoFocus, readOnly). */
  disabled?: boolean;
}

export function PlaceAutocomplete(props: PlaceAutocompleteProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return <FallbackInput {...props} />;
  }
  return <ActualPlaceAutocomplete {...props} apiKey={apiKey} />;
}

/* ──────────────────────────────────────────────────────────────────────
   Fallback — no API key configured. Plain text input, no autocomplete.
   ────────────────────────────────────────────────────────────────────── */

function FallbackInput({
  value,
  onChange,
  placeholder,
  id,
  className,
  disabled,
}: PlaceAutocompleteProps) {
  return (
    <Input
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      autoComplete="off"
    />
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Real autocomplete — only mounted when an API key is present, so the
   useEffects always run in the same order.
   ────────────────────────────────────────────────────────────────────── */

interface PlacePrediction {
  placeId: string;
  mainText: string;
  secondaryText: string;
}

function ActualPlaceAutocomplete({
  value,
  onChange,
  onPlaceSelected,
  placeholder,
  mode = "venue",
  id,
  className,
  disabled,
  apiKey,
}: PlaceAutocompleteProps & { apiKey: string }) {
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Session token bundles autocomplete + details into one billable session.
  // Rotated after every successful selection so the next lookup is a fresh
  // session — that's how Google charges the cheaper combined rate.
  const sessionTokenRef = useRef<string>(generateSessionToken());
  // Track the latest input the user typed so a slow autocomplete response
  // can be discarded if it arrives after a newer keystroke.
  const latestQueryRef = useRef<string>(value);
  // Suppress the next autocomplete fetch — set right after a selection so
  // updating `value` to the chosen place name doesn't re-open the dropdown.
  const suppressNextFetchRef = useRef(false);
  // Only fetch suggestions once the user has actually typed in this input.
  // Without this, a pre-populated value (event editor loading existing data,
  // parent state hydration) would trigger a fetch on mount and pop the
  // dropdown open before the user has even clicked the field.
  const userHasTypedRef = useRef(false);

  /* Debounced autocomplete fetch */
  useEffect(() => {
    if (!userHasTypedRef.current) return;
    if (suppressNextFetchRef.current) {
      suppressNextFetchRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const query = value.trim();
    latestQueryRef.current = query;

    if (query.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const body: Record<string, unknown> = {
          input: query,
          sessionToken: sessionTokenRef.current,
        };
        // Bias by Google's structured place types. "locality" + "sublocality"
        // catches city-style picks; "establishment" catches venue/business
        // results. Leaving this off entirely (when mode is unknown) returns
        // mixed results — fine for free exploration but noisy for a typed
        // input that needs a city specifically.
        if (mode === "city") {
          body.includedPrimaryTypes = ["locality", "sublocality"];
        } else {
          body.includedPrimaryTypes = ["establishment"];
        }

        const res = await fetch(`${PLACES_API_BASE}/places:autocomplete`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask":
              "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text",
          },
          body: JSON.stringify(body),
        });

        // Drop stale responses if the user has typed since this request was sent.
        if (latestQueryRef.current !== query) return;

        if (!res.ok) {
          setSuggestions([]);
          setOpen(false);
          return;
        }

        const json = (await res.json()) as {
          suggestions?: Array<{
            placePrediction?: {
              placeId?: string;
              structuredFormat?: {
                mainText?: { text?: string };
                secondaryText?: { text?: string };
              };
            };
          }>;
        };
        const preds: PlacePrediction[] = (json.suggestions || [])
          .map((s) => s.placePrediction)
          .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
          .slice(0, MAX_SUGGESTIONS)
          .map((p) => ({
            placeId: p.placeId!,
            mainText: p.structuredFormat?.mainText?.text || "",
            secondaryText: p.structuredFormat?.secondaryText?.text || "",
          }));

        setSuggestions(preds);
        setOpen(preds.length > 0);
        setActiveIdx(-1);
      } catch {
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, mode, apiKey]);

  /* Click-outside dismiss */
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selectPlace = useCallback(
    async (placeId: string) => {
      setOpen(false);
      setLoading(true);
      try {
        const url = new URL(`${PLACES_API_BASE}/places/${placeId}`);
        url.searchParams.set("sessionToken", sessionTokenRef.current);
        const res = await fetch(url.toString(), {
          headers: {
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask":
              "id,displayName,formattedAddress,addressComponents,location",
          },
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          displayName?: { text?: string };
          formattedAddress?: string;
          addressComponents?: Array<{
            longText?: string;
            shortText?: string;
            types?: string[];
          }>;
          location?: { latitude?: number; longitude?: number };
        };

        const components = json.addressComponents || [];
        const findLong = (type: string) =>
          components.find((c) => c.types?.includes(type))?.longText || "";
        const findShort = (type: string) =>
          components.find((c) => c.types?.includes(type))?.shortText || "";

        // Different countries tag the city under different component types.
        // postal_town is the UK convention; locality covers most of the
        // rest; administrative_area_level_2 catches edge cases.
        const city =
          findLong("locality") ||
          findLong("postal_town") ||
          findLong("administrative_area_level_2") ||
          "";
        const country = findShort("country") || "";

        const place: PlaceResult = {
          name: json.displayName?.text || "",
          address: json.formattedAddress || "",
          city,
          country,
          lat: json.location?.latitude,
          lng: json.location?.longitude,
        };

        onPlaceSelected?.(place);

        // Suppress the autocomplete that would otherwise fire from the
        // value-change below; the user has already chosen, we don't want
        // the dropdown to reopen.
        suppressNextFetchRef.current = true;
        onChange(mode === "city" ? city || place.name : place.name || value);
      } catch {
        /* silent — keep the typed text */
      } finally {
        setLoading(false);
        // Rotate the session token so the next look-up bills as a fresh
        // session.
        sessionTokenRef.current = generateSessionToken();
      }
    },
    [apiKey, mode, onChange, onPlaceSelected, value]
  );

  /* Keyboard navigation */
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      void selectPlace(suggestions[activeIdx].placeId);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => {
          // Mark interaction so the autocomplete useEffect starts firing.
          // Programmatic value changes (initial mount, parent re-renders,
          // suppressed selection updates) never flip this flag, so they
          // don't pop the dropdown open.
          userHasTypedRef.current = true;
          onChange(e.target.value);
        }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? `${id || "place"}-suggestions` : undefined}
        aria-autocomplete="list"
      />

      {loading && (
        <Loader2
          size={14}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-hidden
        />
      )}

      {open && suggestions.length > 0 && (
        <div
          id={`${id || "place"}-suggestions`}
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-card shadow-[0_18px_40px_-16px_rgba(0,0,0,0.5)]"
        >
          <ul role="listbox" className="max-h-72 overflow-y-auto">
            {suggestions.map((s, i) => (
              <li key={s.placeId} role="option" aria-selected={i === activeIdx}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    // Prevent the input losing focus before we read the click.
                    e.preventDefault();
                    void selectPlace(s.placeId);
                  }}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={cn(
                    "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors focus-visible:outline-none",
                    i === activeIdx
                      ? "bg-primary/[0.06] text-foreground"
                      : "text-foreground/85 hover:bg-foreground/[0.03]"
                  )}
                >
                  <MapPin
                    size={14}
                    className="mt-0.5 shrink-0 text-muted-foreground/60"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {s.mainText}
                    </div>
                    {s.secondaryText && (
                      <div className="truncate text-[11px] text-muted-foreground">
                        {s.secondaryText}
                      </div>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {/* Required by Google's Places API TOS when displaying suggestions
              outside a Google Map. Calmly tucked under the list. */}
          <div className="border-t border-border/40 px-3 py-1.5 text-right">
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/60">
              Powered by Google
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Generate a 32-character session token. Uses crypto.randomUUID where
 * available (modern browsers + Node 19+) and falls back to a simple
 * Math.random construction for legacy contexts. Google accepts any
 * unique string per session; uniqueness across sessions is what matters
 * for correct billing, not cryptographic strength.
 */
function generateSessionToken(): string {
  if (
    typeof globalThis !== "undefined" &&
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return (
    Math.random().toString(36).slice(2, 14) +
    Math.random().toString(36).slice(2, 14) +
    Date.now().toString(36)
  );
}
