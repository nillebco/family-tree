import type { GrampsData, GrampsPerson } from "../types/gramps";
import { EVENT_BIRTH, EVENT_DEATH } from "../types/gramps";
import { getPersonName } from "../utils/treeBuilder";

interface PersonDetailPanelProps {
  handle: string;
  data: GrampsData;
  includePrivate: boolean;
  onClose: () => void;
  onNavigate: (handle: string) => void;
}

function formatDate(date: { dateval: [number, number, number, boolean]; text: string } | undefined): string {
  if (!date) return "";
  if (date.text) return date.text;
  const [day, month, year] = date.dateval;
  const parts: string[] = [];
  if (year) parts.push(String(year));
  if (month) parts.unshift(String(month).padStart(2, "0"));
  if (day) parts.unshift(String(day).padStart(2, "0"));
  return parts.join("-");
}

function genderIcon(gender: number): string {
  if (gender === 0) return "\u2640"; // female
  if (gender === 1) return "\u2642"; // male
  return "?";
}

interface ResolvedEvent {
  typeString: string;
  typeValue: number;
  date: string;
  place: string;
  description: string;
}

function resolveEvents(person: GrampsPerson, data: GrampsData): ResolvedEvent[] {
  const events: ResolvedEvent[] = [];
  for (const ref of person.event_ref_list) {
    const event = data.events.get(ref.ref);
    if (!event) continue;
    const place = event.place ? data.places.get(event.place)?.title || "" : "";
    events.push({
      typeString: event.type.string,
      typeValue: event.type.value,
      date: formatDate(event.date),
      place,
      description: event.description,
    });
  }
  return events;
}

/** Returns true if the person exists and is allowed to be shown */
function isVisible(
  handle: string,
  data: GrampsData,
  includePrivate: boolean
): boolean {
  const person = data.persons.get(handle);
  if (!person) return false;
  if (!includePrivate && person.private) return false;
  return true;
}

function PersonLink({
  handle,
  data,
  includePrivate,
  onNavigate,
}: {
  handle: string;
  data: GrampsData;
  includePrivate: boolean;
  onNavigate: (handle: string) => void;
}) {
  if (!isVisible(handle, data, includePrivate)) return null;
  const person = data.persons.get(handle)!;
  return (
    <button className="person-link" onClick={() => onNavigate(handle)}>
      {getPersonName(person)}
    </button>
  );
}

export default function PersonDetailPanel({
  handle,
  data,
  includePrivate,
  onClose,
  onNavigate,
}: PersonDetailPanelProps) {
  if (!isVisible(handle, data, includePrivate)) return null;
  const person = data.persons.get(handle)!;

  const name = getPersonName(person);
  const allEvents = resolveEvents(person, data);
  const birthEvent = allEvents.find((e) => e.typeValue === EVENT_BIRTH);
  const deathEvent = allEvents.find((e) => e.typeValue === EVENT_DEATH);
  const otherEvents = allEvents.filter(
    (e) => e.typeValue !== EVENT_BIRTH && e.typeValue !== EVENT_DEATH
  );

  // Parents
  let fatherHandle: string | null = null;
  let motherHandle: string | null = null;
  let siblingHandles: string[] = [];

  if (person.parent_family_list.length > 0) {
    const parentFamily = data.families.get(person.parent_family_list[0]);
    if (parentFamily) {
      if (parentFamily.father_handle && isVisible(parentFamily.father_handle, data, includePrivate)) {
        fatherHandle = parentFamily.father_handle;
      }
      if (parentFamily.mother_handle && isVisible(parentFamily.mother_handle, data, includePrivate)) {
        motherHandle = parentFamily.mother_handle;
      }
      siblingHandles = parentFamily.child_ref_list
        .map((c) => c.ref)
        .filter((h) => h !== handle && isVisible(h, data, includePrivate));
    }
  }

  // Spouses & Children
  const familyUnits: Array<{
    spouseHandle: string | null;
    childHandles: string[];
  }> = [];

  for (const familyHandle of person.family_list) {
    const family = data.families.get(familyHandle);
    if (!family) continue;
    const spouseHandle =
      family.father_handle === handle
        ? family.mother_handle
        : family.father_handle;
    const validSpouse = spouseHandle && isVisible(spouseHandle, data, includePrivate) ? spouseHandle : null;
    const childHandles = family.child_ref_list
      .map((c) => c.ref)
      .filter((h) => isVisible(h, data, includePrivate));
    familyUnits.push({ spouseHandle: validSpouse, childHandles });
  }

  return (
    <div className="person-detail-panel">
      <div className="pdp-header">
        <button className="pdp-close" onClick={onClose} title="Close">
          &times;
        </button>
        <div className="pdp-name">
          <span className="pdp-gender">{genderIcon(person.gender)}</span>
          {name}
        </div>
        <div className="pdp-gramps-id">{person.gramps_id}</div>
        {person.private && (
          <span className="pdp-private-badge">Private</span>
        )}
      </div>

      {/* Vital events */}
      <div className="pdp-section">
        <h3>Vital Events</h3>
        {birthEvent ? (
          <div className="pdp-event">
            <strong>Birth</strong>
            {birthEvent.date && <span> — {birthEvent.date}</span>}
            {birthEvent.place && <div className="pdp-place">{birthEvent.place}</div>}
          </div>
        ) : (
          <div className="pdp-event pdp-muted">No birth record</div>
        )}
        {deathEvent ? (
          <div className="pdp-event">
            <strong>Death</strong>
            {deathEvent.date && <span> — {deathEvent.date}</span>}
            {deathEvent.place && <div className="pdp-place">{deathEvent.place}</div>}
          </div>
        ) : (
          <div className="pdp-event pdp-muted">No death record</div>
        )}
      </div>

      {/* Other events */}
      {otherEvents.length > 0 && (
        <div className="pdp-section">
          <h3>Other Events</h3>
          {otherEvents.map((e, i) => (
            <div key={i} className="pdp-event">
              <strong>{e.typeString}</strong>
              {e.date && <span> — {e.date}</span>}
              {e.place && <div className="pdp-place">{e.place}</div>}
              {e.description && <div className="pdp-desc">{e.description}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Parents */}
      {(fatherHandle || motherHandle) && (
        <div className="pdp-section">
          <h3>Parents</h3>
          {fatherHandle && (
            <div>
              Father:{" "}
              <PersonLink handle={fatherHandle} data={data} includePrivate={includePrivate} onNavigate={onNavigate} />
            </div>
          )}
          {motherHandle && (
            <div>
              Mother:{" "}
              <PersonLink handle={motherHandle} data={data} includePrivate={includePrivate} onNavigate={onNavigate} />
            </div>
          )}
        </div>
      )}

      {/* Siblings */}
      {siblingHandles.length > 0 && (
        <div className="pdp-section">
          <h3>Siblings</h3>
          {siblingHandles.map((h) => (
            <div key={h}>
              <PersonLink handle={h} data={data} includePrivate={includePrivate} onNavigate={onNavigate} />
            </div>
          ))}
        </div>
      )}

      {/* Spouses & Children */}
      {familyUnits.length > 0 && (
        <div className="pdp-section">
          <h3>Spouses &amp; Children</h3>
          {familyUnits.map((fam, i) => (
            <div key={i} className="pdp-family-unit">
              {fam.spouseHandle && (
                <div>
                  Spouse:{" "}
                  <PersonLink handle={fam.spouseHandle} data={data} includePrivate={includePrivate} onNavigate={onNavigate} />
                </div>
              )}
              {fam.childHandles.length > 0 && (
                <div className="pdp-children">
                  Children:
                  {fam.childHandles.map((h) => (
                    <div key={h} className="pdp-child">
                      <PersonLink handle={h} data={data} includePrivate={includePrivate} onNavigate={onNavigate} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
