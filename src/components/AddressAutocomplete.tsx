import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Loader2, MapPinned } from 'lucide-react';

type Suggestion = { id: string; suggestion: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  onResolved?: (formatted: string) => void;
  disabled?: boolean;
  placeholder?: string;
  hintId?: string;
  invalid?: boolean;
};

export function AddressAutocomplete({
  value,
  onChange,
  onResolved,
  disabled,
  placeholder = 'Start typing a postcode or address…',
  hintId,
  invalid,
}: Props) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [autocompleteAvailable, setAutocompleteAvailable] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipSuggestRef = useRef(false);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    setLookupError(null);
    try {
      const res = await fetch(`/api/address/suggest?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      if (res.status === 503) {
        setAutocompleteAvailable(false);
        setSuggestions([]);
        setOpen(false);
        return;
      }
      if (!res.ok) {
        throw new Error(data.error || 'Address lookup failed.');
      }
      const next: Suggestion[] = Array.isArray(data.suggestions) ? data.suggestions : [];
      setSuggestions(next);
      setOpen(next.length > 0);
      setActiveIndex(next.length ? 0 : -1);
    } catch (err) {
      setSuggestions([]);
      setOpen(false);
      setLookupError(err instanceof Error ? err.message : 'Address lookup failed.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (skipSuggestRef.current) {
      skipSuggestRef.current = false;
      return;
    }
    if (disabled || !autocompleteAvailable) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchSuggestions(value);
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, disabled, autocompleteAvailable, fetchSuggestions]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pickSuggestion = async (item: Suggestion) => {
    setOpen(false);
    setSuggestions([]);
    setResolving(true);
    setLookupError(null);
    try {
      const res = await fetch('/api/address/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not resolve address.');
      const formatted = String(data.address || '').trim();
      if (!formatted) throw new Error('Could not resolve address.');
      skipSuggestRef.current = true;
      onChange(formatted);
      onResolved?.(formatted);
    } catch (err) {
      // Fall back to the suggestion text so they can still continue
      skipSuggestRef.current = true;
      onChange(item.suggestion);
      setLookupError(err instanceof Error ? err.message : 'Could not resolve address.');
    } finally {
      setResolving(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      void pickSuggestion(suggestions[activeIndex]!);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          type="text"
          autoComplete="street-address"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={invalid}
          aria-describedby={hintId}
          placeholder={placeholder}
          value={value}
          disabled={disabled || resolving}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className="brand-input text-base md:text-sm py-3.5 pr-10"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted">
          {loading || resolving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <MapPinned className="w-4 h-4" />
          )}
        </span>
      </div>

      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1.5 w-full max-h-64 overflow-y-auto rounded-xl border border-brand-line bg-white shadow-lg py-1"
        >
          {suggestions.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                className={`w-full text-left px-3 py-2.5 text-sm leading-snug transition ${
                  i === activeIndex
                    ? 'bg-brand-green/10 text-brand-navy'
                    : 'text-brand-navy hover:bg-brand-paper'
                }`}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => void pickSuggestion(s)}
              >
                {s.suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}

      {lookupError && (
        <p className="text-xs text-amber-800 mt-1.5 leading-relaxed">{lookupError}</p>
      )}
      {!autocompleteAvailable && (
        <p className="text-xs text-brand-muted mt-1.5 leading-relaxed">
          Typeahead unavailable — enter the full address including postcode.
        </p>
      )}
    </div>
  );
}
