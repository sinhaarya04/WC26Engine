import { useEffect, useRef, useState } from "react";
import { searchCompanies, type CompanyOption } from "../lib/api";

/**
 * Searchable company picker for registration.
 *
 * - Debounced (250ms) calls to GET /companies?q=
 * - User MUST select a suggestion; the `selected` value (id+name) is
 *   what gets submitted. Re-editing the input after a selection clears
 *   the selection so we never silently submit a stale id.
 * - Keyboard: ArrowUp/Down to move, Enter to commit, Esc to close.
 */

const DEBOUNCE_MS = 250;

interface Props {
  selected: CompanyOption | null;
  onSelect: (c: CompanyOption | null) => void;
  inputId?: string;
}

export function CompanyPicker({ selected, onSelect, inputId }: Props) {
  const [query, setQuery] = useState(selected?.name ?? "");
  const [results, setResults] = useState<CompanyOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hover, setHover] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Debounced server fetch. Editing after a commit clears the selection
  // so we never submit a stale companyId.
  useEffect(() => {
    if (selected && query !== selected.name) {
      onSelect(null);
    }
    let cancelled = false;
    setLoading(true);
    const handle = window.setTimeout(async () => {
      try {
        const rows = await searchCompanies(query.trim());
        if (!cancelled) {
          setResults(rows);
          setHover(0);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
    // We intentionally depend only on `query` — re-running on every
    // `selected` change would refetch when the user picks a row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Close on outside click.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  function commit(option: CompanyOption) {
    onSelect(option);
    setQuery(option.name);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHover((h) => Math.min(h + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHover((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      const choice = results[hover];
      if (choice) {
        e.preventDefault();
        commit(choice);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && (loading || results.length > 0);

  return (
    <div className="picker" ref={wrapRef}>
      <input
        id={inputId}
        type="text"
        className={`picker-input${selected ? " picker-input--selected" : ""}`}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Start typing your company…"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls="picker-listbox"
      />
      {showList && (
        <ul id="picker-listbox" role="listbox" className="picker-list">
          {loading && results.length === 0 && (
            <li className="picker-empty">Searching…</li>
          )}
          {results.map((c, i) => {
            const active = i === hover;
            return (
              <li
                key={c.id}
                role="option"
                aria-selected={active}
                className={`picker-row${active ? " picker-row--active" : ""}`}
                onMouseEnter={() => setHover(i)}
                onMouseDown={(e) => {
                  e.preventDefault(); // keep input focus
                  commit(c);
                }}
              >
                {c.name}
              </li>
            );
          })}
        </ul>
      )}
      <div className="picker-hint">
        {selected
          ? `Selected: ${selected.name}`
          : "You must pick your company from the list."}
      </div>
    </div>
  );
}
