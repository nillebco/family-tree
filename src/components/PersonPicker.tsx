import { useMemo, useState } from "react";
import type { GrampsData } from "../types/gramps";
import { getSortedPersons } from "../utils/treeBuilder";

interface PersonPickerProps {
  data: GrampsData;
  onSelect: (handle: string) => void;
}

export default function PersonPicker({ data, onSelect }: PersonPickerProps) {
  const [filter, setFilter] = useState("");
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

  return (
    <div className="person-picker">
      <input
        type="text"
        placeholder="Search persons..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="person-search"
      />
      <div className="person-list">
        {filtered.map((p) => (
          <button
            key={p.handle}
            className="person-item"
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
