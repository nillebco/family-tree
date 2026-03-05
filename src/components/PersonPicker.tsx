import { useEffect, useMemo, useRef, useState } from "react";
import type { GrampsData } from "../types/gramps";
import { getSortedPersons } from "../utils/treeBuilder";

interface PersonPickerProps {
  data: GrampsData;
  onSelect: (handle: string) => void;
}

export default function PersonPicker({ data, onSelect }: PersonPickerProps) {
  const [filter, setFilter] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const persons = useMemo(() => getSortedPersons(data), [data]);

  const filtered = useMemo(() => {
    if (!filter) return persons;
    const lower = filter.toLowerCase();
    return persons.filter(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        p.dates.toLowerCase().includes(lower)
    );
  }, [persons, filter]);


  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll(".person-item");
      items[activeIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i < filtered.length - 1 ? i + 1 : i));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i > 0 ? i - 1 : i));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      onSelect(filtered[activeIndex].handle);
    }
  };

  return (
    <div className="person-picker">
      <input
        type="text"
        placeholder="Search persons..."
        value={filter}
        onChange={(e) => { setFilter(e.target.value); setActiveIndex(-1); }}
        onKeyDown={handleKeyDown}
        className="person-search"
        autoFocus
      />
      <div className="person-list" ref={listRef}>
        {filtered.map((p, i) => (
          <button
            key={p.handle}
            className={`person-item${i === activeIndex ? " active" : ""}`}
            onClick={() => onSelect(p.handle)}
          >
            <span className="person-name">{p.name}</span>
            {p.dates && <span className="person-dates">{p.dates}</span>}
          </button>
        ))}
      </div>
      <p className="person-count">
        {filtered.length} of {persons.length} persons
      </p>
    </div>
  );
}
