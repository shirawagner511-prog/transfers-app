import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { searchItems } from '@/lib/search';

export interface SearchOption {
  id: string;
  name: string;
  /** Extra searchable text (supplier, category…) */
  keywords?: string;
  meta?: ReactNode;
  price?: ReactNode;
  badge?: ReactNode;
}

interface Props {
  options: SearchOption[];
  onSelect: (option: SearchOption) => void;
  placeholder?: string;
  /** ids already chosen — shown as "נוסף" */
  selectedIds?: Set<string>;
  autoFocus?: boolean;
  label?: string;
}

/**
 * Type-to-search picker. Shows only the best matches in a short scrollable
 * list instead of a long <select>, and clears itself after a pick so the
 * next item can be typed right away.
 */
export function ItemSearch({ options, onSelect, placeholder = 'הקלד לחיפוש…', selectedIds, autoFocus, label }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(
    () => searchItems(options, query, o => `${o.name} ${o.keywords ?? ''}`, 40),
    [options, query],
  );

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function pick(o: SearchOption) {
    onSelect(o);
    setQuery('');
    setActive(0);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (open && results[active]) pick(results[active]); }
    else if (e.key === 'Escape') { if (open) { e.stopPropagation(); setOpen(false); } }
  }

  const showList = open && (query.trim() !== '' || options.length > 0);

  return (
    <div ref={boxRef} className="relative">
      {label && <p className="text-sm font-medium text-gray-700 mb-1">{label}</p>}
      <div className="relative flex items-center">
        <Search className="absolute end-3 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          autoFocus={autoFocus}
          onChange={e => { setQuery(e.target.value); setActive(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          enterKeyHint="search"
          autoComplete="off"
          className="w-full rounded-lg border border-teal-300 bg-white px-3 py-2.5 pe-10 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); inputRef.current?.focus(); }}
            className="absolute start-2 p-1 text-gray-400 hover:text-gray-600"
            aria-label="נקה חיפוש"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {showList && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-gray-500 text-center">לא נמצאו תוצאות ל"{query}"</p>
          ) : (
            <ul ref={listRef} className="max-h-64 overflow-y-auto py-1" role="listbox">
              {results.map((o, idx) => {
                const chosen = selectedIds?.has(o.id);
                return (
                  <li
                    key={o.id}
                    data-idx={idx}
                    role="option"
                    aria-selected={idx === active}
                    onMouseDown={e => { e.preventDefault(); pick(o); }}
                    onMouseEnter={() => setActive(idx)}
                    className={`flex items-center justify-between gap-3 px-3 py-2 cursor-pointer ${idx === active ? 'bg-teal-50' : ''}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {o.badge}
                        <span className="text-sm text-gray-900 truncate">{o.name}</span>
                        {chosen && <span className="text-[11px] text-teal-600 flex-shrink-0">✓ נוסף</span>}
                      </div>
                      {o.meta && <div className="text-xs text-gray-500 truncate">{o.meta}</div>}
                    </div>
                    {o.price && <div className="text-sm font-semibold text-gray-800 flex-shrink-0">{o.price}</div>}
                  </li>
                );
              })}
            </ul>
          )}
          {results.length === 40 && (
            <p className="px-3 py-1.5 text-[11px] text-gray-400 border-t border-gray-100">מוצגות 40 התוצאות הראשונות — הקלד עוד כדי לצמצם</p>
          )}
        </div>
      )}
    </div>
  );
}
