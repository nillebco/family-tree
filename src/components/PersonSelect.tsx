import { useMemo, useRef, useState, useEffect } from "react";
import type { GrampsData } from "../types/gramps";
import { getSortedPersons, getPersonName } from "../utils/treeBuilder";

interface PersonSelectProps {
  data: GrampsData;
  value: string | null;
  onChange: (handle: string | null) => void;
  excludeHandles?: string[];
  label: string;
}

export default function PersonSelect({
  data,
  value,
  onChange,
  excludeHandles = [],
  label,
}: PersonSelectProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const persons = useMemo(() => getSortedPersons(data), [data]);

  const excludeSet = useMemo(() => new Set(excludeHandles), [excludeHandles]);

  const filtered = useMemo(() => {
    const base = persons.filter((p) => !excludeSet.has(p.handle));
    if (!filter) return base;
    const lower = filter.toLowerCase();
    return base.filter(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        p.dates.toLowerCase().includes(lower)
    );
  }, [persons, filter, excludeSet]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [filtered]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll(".ps-item");
      items[activeIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  const selectedName = useMemo(() => {
    if (!value) return null;
    const person = data.persons.get(value);
    return person ? getPersonName(person) : null;
  }, [value, data]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i < filtered.length - 1 ? i + 1 : i));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i > 0 ? i - 1 : i));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      onChange(filtered[activeIndex].handle);
      setOpen(false);
      setFilter("");
    } else if (e.key === "Escape") {
      setOpen(false);
      setFilter("");
    }
  };

  const handleSelect = (handle: string) => {
    onChange(handle);
    setOpen(false);
    setFilter("");
  };

  const handleClear = () => {
    onChange(null);
    setOpen(false);
    setFilter("");
  };

  return (
    <div className="person-select">
      <span className="ps-label">{label}</span>
      <div className="ps-control">
        {selectedName ? (
          <span className="ps-selected">{selectedName}</span>
        ) : (
          <span className="ps-empty">Not set</span>
        )}
        <div className="ps-buttons">
          {value && (
            <button
              className="ps-btn-clear"
              onClick={handleClear}
              title={`Clear ${label.toLowerCase()}`}
            >
              &times;
            </button>
          )}
          <button
            className="ps-btn-change"
            onClick={() => setOpen(!open)}
          >
            {value ? "Change" : "Set"}
          </button>
        </div>
      </div>
      {open && (
        <div className="ps-dropdown">
          <input
            ref={inputRef}
            type="text"
            className="ps-search"
            placeholder="Search..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="ps-list" ref={listRef}>
            {filtered.slice(0, 100).map((p, i) => (
              <button
                key={p.handle}
                className={`ps-item${i === activeIndex ? " active" : ""}`}
                onClick={() => handleSelect(p.handle)}
              >
                <span className="ps-item-name">{p.name}</span>
                {p.dates && <span className="ps-item-dates">{p.dates}</span>}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="ps-no-results">No matches</div>
            )}
            {filtered.length > 100 && (
              <div className="ps-truncated">
                Showing 100 of {filtered.length} — refine your search
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
