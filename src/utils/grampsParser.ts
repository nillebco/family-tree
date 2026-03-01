import type {
  GrampsData,
  GrampsEvent,
  GrampsFamily,
  GrampsPerson,
  GrampsPlace,
} from "../types/gramps";

export function parseGrampsNdjson(
  text: string,
  includePrivate: boolean = false
): GrampsData {
  const persons = new Map<string, GrampsPerson>();
  const families = new Map<string, GrampsFamily>();
  const events = new Map<string, GrampsEvent>();
  const places = new Map<string, GrampsPlace>();

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const obj = JSON.parse(trimmed);
      if (!includePrivate && obj.private) continue;
      switch (obj._class) {
        case "Person":
          persons.set(obj.handle, obj);
          break;
        case "Family":
          families.set(obj.handle, obj);
          break;
        case "Event":
          events.set(obj.handle, obj);
          break;
        case "Place":
          places.set(obj.handle, obj);
          break;
      }
    } catch {
      // skip unparseable lines
    }
  }

  return { persons, families, events, places };
}
