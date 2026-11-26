"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Search } from "lucide-react";
import type { GeoPoint } from "@kaafila/shared";
import { api, errorMessage } from "@/lib/api";
import { Input } from "@/components/ui/field";

export interface Place {
  name: string;
  displayName: string;
  position: GeoPoint;
  countryCode?: string;
}

/** Debounced place search through the API geocoder (rate limited and cached server-side). */
export function PlaceSearch({ label, value, onChange, useMyLocation }: { label: string; value: Place | null; onChange: (p: Place | null) => void; useMyLocation?: boolean }) {
  const [q, setQ] = useState(value?.name ?? "");
  const [results, setResults] = useState<Place[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (!open || q.trim().length < 3 || q === value?.name) return;
    timer.current = window.setTimeout(async () => {
      try {
        setResults(await api.get<Place[]>(`/maps/geocode?q=${encodeURIComponent(q.trim())}`));
        setError(null);
      } catch (err) {
        setError(errorMessage(err));
      }
    }, 450);
    return () => window.clearTimeout(timer.current);
  }, [q, open, value?.name]);

  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const p = { name: "My location", displayName: "Current location", position: { lat: pos.coords.latitude, lng: pos.coords.longitude } };
        onChange(p);
        setQ(p.name);
        setOpen(false);
      },
      () => setError("Location permission denied")
    );

  return (
    <div className="relative grid gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
              if (value) onChange(null);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search a city, landmark or address"
            className="pl-9"
            aria-autocomplete="list"
          />
        </div>
        {useMyLocation ? (
          <button type="button" onClick={locate} className="rounded-lg border border-white/10 px-3 text-xs hover:bg-white/10" title="Use my location">
            <MapPin className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {error ? <span className="text-xs text-rose-300">{error}</span> : null}
      {open && results.length > 0 && !value ? (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-white/10 bg-[#0f141c] p-1 shadow-xl" role="listbox">
          {results.map((r, i) => (
            <li key={`${r.displayName}-${i}`}>
              <button
                type="button"
                className="w-full rounded-md px-3 py-2 text-left hover:bg-white/10"
                onClick={() => {
                  onChange(r);
                  setQ(r.name);
                  setOpen(false);
                }}
              >
                <span className="block text-sm font-medium">{r.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{r.displayName}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
