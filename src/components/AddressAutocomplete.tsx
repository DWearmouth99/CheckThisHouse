import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, MapPinned } from 'lucide-react';

type Suggestion = { id: string; suggestion: string; formatted?: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  onResolved?: (formatted: string) => void;
  disabled?: boolean;
  placeholder?: string;
  hintId?: string;
  invalid?: boolean;
};

type MenuPos = { top: number; left: number; width: number; maxHeight: number };

const FULL_POSTCODE_RE =
  /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;

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
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [autocompleteAvailable, setAutocompleteAvailable] = useState(true);
  const [completeList, setCompleteList] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [didYouMean, setDidYouMean] = useState<string[]>([]);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipSuggestRef = useRef(false);
  const disabledRef = useRef(Boolean(disabled));
  disabledRef.current = Boolean(disabled);

  const updateMenuPos = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 6;
    const spaceBelow = window.innerHeight - rect.bottom - gap - 12;
    const spaceAbove = rect.top - gap - 12;
    const preferBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(140, Math.min(320, preferBelow ? spaceBelow : spaceAbove));
    setMenuPos({
      top: preferBelow ? rect.bottom + gap : Math.max(8, rect.top - gap - maxHeight),
      left: rect.left,
      width: rect.width,
      maxHeight,
    });
  }, []);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      setCompleteList(false);
      setNotice(null);
      setDidYouMean([]);
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
        setCompleteList(false);
        setNotice(null);
        setDidYouMean([]);
        return;
      }
      if (!res.ok) {
        throw new Error(data.error || 'Address lookup failed.');
      }
      const next: Suggestion[] = Array.isArray(data.suggestions) ? data.suggestions : [];
      // Ignore late responses if the field was disabled while the request was in flight
      if (disabledRef.current) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      setSuggestions(next);
      setCompleteList(Boolean(data.completeList));
      setNotice(typeof data.notice === 'string' ? data.notice : null);
      setDidYouMean(Array.isArray(data.didYouMean) ? data.didYouMean.map(String) : []);
      setOpen(next.length > 0);
      setActiveIndex(next.length ? 0 : -1);
    } catch (err) {
      setSuggestions([]);
      setOpen(false);
      setCompleteList(false);
      setNotice(null);
      setDidYouMean([]);
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

  // Close the portal list whenever the field is disabled (modals / generating / success)
  useEffect(() => {
    if (!disabled) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setOpen(false);
    setSuggestions([]);
    setMenuPos(null);
    setNotice(null);
    setDidYouMean([]);
    setActiveIndex(-1);
    inputRef.current?.blur();
  }, [disabled]);

  useLayoutEffect(() => {
    if (!open || suggestions.length === 0) {
      setMenuPos(null);
      return;
    }
    updateMenuPos();
  }, [open, suggestions.length, updateMenuPos]);

  useEffect(() => {
    if (!open) return;
    const onReposition = () => updateMenuPos();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, updateMenuPos]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const applyResolved = (formatted: string) => {
    skipSuggestRef.current = true;
    onChange(formatted);
    onResolved?.(formatted);
  };

  const pickSuggestion = async (item: Suggestion) => {
    setOpen(false);
    setSuggestions([]);
    setLookupError(null);

    // Postcode lookup already returned the full address — no second paid call
    if (item.formatted) {
      applyResolved(item.formatted);
      return;
    }

    setResolving(true);
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
      applyResolved(formatted);
    } catch (err) {
      applyResolved(item.suggestion);
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

  const hasFullPostcode = FULL_POSTCODE_RE.test(value);
  const tip =
    notice ||
    (completeList && suggestions.length > 0
      ? `All ${suggestions.length} Royal Mail addresses for this postcode. Can’t see yours? Odd and even sides of a street often use different postcodes — try your house number and street name instead.`
      : !completeList && value.trim().length >= 3 && !hasFullPostcode
        ? 'Tip: enter the full postcode (e.g. EH22 2RB) to list every property there, or type your house number and street.'
        : null);

  const applyDidYouMean = (pc: string) => {
    onChange(pc);
  };

  const listbox =
    open && suggestions.length > 0 && menuPos
      ? createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              maxHeight: menuPos.maxHeight,
              zIndex: 70,
            }}
            className="overflow-y-auto overscroll-contain rounded-xl border border-brand-line bg-white shadow-[0_16px_40px_rgba(11,31,58,0.22)] py-1"
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
          </ul>,
          document.body
        )
      : null;

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
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

      {listbox}

      {tip && !lookupError && (
        <p className="text-[11px] text-brand-muted mt-1.5 leading-relaxed">{tip}</p>
      )}
      {didYouMean.length > 0 && !lookupError && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {didYouMean.map((pc) => (
            <button
              key={pc}
              type="button"
              onClick={() => applyDidYouMean(pc)}
              className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-brand-line bg-white text-brand-navy hover:border-brand-green hover:bg-brand-green/5 transition"
            >
              {pc}
            </button>
          ))}
        </div>
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
