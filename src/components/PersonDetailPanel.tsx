import { useState } from "react";
import type { GrampsData, GrampsPerson, GrampsName, GrampsFamily } from "../types/gramps";
import { EVENT_BIRTH, EVENT_DEATH } from "../types/gramps";
import { getPersonName } from "../utils/treeBuilder";
import PersonSelect from "./PersonSelect";

/** Gramps EventType numeric values → human-readable labels */
const EVENT_TYPE_LABELS: Record<number, string> = {
  1: "Marriage",
  2: "Marriage Settlement",
  3: "Marriage License",
  4: "Marriage Contract",
  5: "Death",
  6: "Divorce",
  7: "Divorce Filing",
  8: "Annulment",
  9: "Alternate Marriage",
  10: "Engagement",
  11: "Marriage Banns",
  12: "Birth",
  13: "Burial",
  14: "Cremation",
  15: "Baptism",
  16: "Christening",
  17: "Confirmation",
  18: "First Communion",
  19: "Cause Of Death",
  20: "Emigration",
  21: "Immigration",
  22: "Census",
  23: "Ordination",
  24: "Probate",
  25: "Will",
  26: "Graduation",
  27: "Retirement",
  28: "Adoption",
  29: "Naturalization",
  30: "Degree",
  31: "Education",
  32: "Elected",
  33: "Medical Information",
  34: "Military Service",
  35: "Nobility Title",
  36: "Number of Marriages",
  37: "Occupation",
  38: "Property",
  39: "Religion",
  40: "Residence",
  41: "Adult Christening",
  42: "Bar Mitzvah",
  43: "Bat Mitzvah",
  44: "Blessing",
  45: "Stillbirth",
};

/** Gramps NameType values */
const NAME_TYPE_LABELS: Record<number, string> = {
  0: "Unknown",
  1: "Also Known As",
  2: "Birth Name",
  3: "Married Name",
};

const NAME_TYPE_OPTIONS = [
  { value: 2, label: "Birth Name" },
  { value: 3, label: "Married Name" },
  { value: 1, label: "Also Known As" },
  { value: 0, label: "Unknown" },
];

interface PersonDetailPanelProps {
  handle: string;
  data: GrampsData;
  includePrivate: boolean;
  onClose: () => void;
  onNavigate: (handle: string) => void;
  onDataChanged: (data: GrampsData) => void;
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

/** Parse a date string (DD-MM-YYYY, MM-YYYY, or YYYY) into a dateval tuple */
function parseDateString(str: string): [number, number, number, boolean] {
  const trimmed = str.trim();
  if (!trimmed) return [0, 0, 0, false];
  const parts = trimmed.split("-").map(Number);
  if (parts.length === 3) return [parts[0], parts[1], parts[2], false]; // DD-MM-YYYY
  if (parts.length === 2) return [0, parts[0], parts[1], false]; // MM-YYYY
  if (parts.length === 1) return [0, 0, parts[0], false]; // YYYY
  return [0, 0, 0, false];
}

function genderIcon(gender: number): string {
  if (gender === 0) return "\u2640"; // female
  if (gender === 1) return "\u2642"; // male
  return "?";
}

/** Format a GrampsName for display */
function formatGrampsName(name: GrampsName): string {
  const first = name.first_name || "";
  const primarySurname = name.surname_list.find((s) => s.primary) || name.surname_list[0];
  const prefix = primarySurname?.prefix || "";
  const surname = primarySurname?.surname || "";
  const fullSurname = prefix ? `${prefix} ${surname}` : surname;
  return `${first} ${fullSurname}`.trim();
}

/** Get a human-readable label for a name type */
function nameTypeLabel(name: GrampsName): string {
  if (name.type) {
    return name.type.string || NAME_TYPE_LABELS[name.type.value] || "Unknown";
  }
  return "Unknown";
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
  const seen = new Set<string>();
  for (const ref of person.event_ref_list) {
    const event = data.events.get(ref.ref);
    if (!event) continue;
    seen.add(ref.ref);
    const place = event.place ? data.places.get(event.place)?.title || "" : "";
    events.push({
      typeString: event.type.string || EVENT_TYPE_LABELS[event.type.value] || `Event #${event.type.value}`,
      typeValue: event.type.value,
      date: formatDate(event.date),
      place,
      description: event.description,
    });
  }
  // Also include events from families (e.g. marriage events)
  for (const familyHandle of person.family_list) {
    const family = data.families.get(familyHandle);
    if (!family) continue;
    for (const ref of family.event_ref_list) {
      if (seen.has(ref.ref)) continue;
      const event = data.events.get(ref.ref);
      if (!event) continue;
      seen.add(ref.ref);
      const place = event.place ? data.places.get(event.place)?.title || "" : "";
      events.push({
        typeString: event.type.string || EVENT_TYPE_LABELS[event.type.value] || `Event #${event.type.value}`,
        typeValue: event.type.value,
        date: formatDate(event.date),
        place,
        description: event.description,
      });
    }
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

interface AltNameEdit {
  firstName: string;
  surname: string;
  surnamePrefix: string;
  suffix: string;
  typeValue: number;
}

interface EditFormState {
  firstName: string;
  surname: string;
  surnamePrefix: string;
  suffix: string;
  title: string;
  gender: number;
  grampsId: string;
  isPrivate: boolean;
  alternateNames: AltNameEdit[];
  birthDate: string;
  birthPlace: string;
  deathDate: string;
  deathPlace: string;
  fatherHandle: string | null;
  motherHandle: string | null;
}

function altNameFromGramps(name: GrampsName): AltNameEdit {
  const primarySurname = name.surname_list.find((s) => s.primary) || name.surname_list[0];
  return {
    firstName: name.first_name || "",
    surname: primarySurname?.surname || "",
    surnamePrefix: primarySurname?.prefix || "",
    suffix: name.suffix || "",
    typeValue: name.type?.value ?? 0,
  };
}

function altNameToGramps(alt: AltNameEdit): GrampsName {
  return {
    first_name: alt.firstName,
    surname_list: [{ surname: alt.surname, prefix: alt.surnamePrefix, primary: true }],
    suffix: alt.suffix,
    title: "",
    type: { value: alt.typeValue, string: NAME_TYPE_LABELS[alt.typeValue] || "" },
  };
}

function buildEditState(person: GrampsPerson, data: GrampsData): EditFormState {
  const primarySurname = person.primary_name.surname_list[0];
  const allEvents = resolveEvents(person, data);
  const birthEvent = allEvents.find((e) => e.typeValue === EVENT_BIRTH);
  const deathEvent = allEvents.find((e) => e.typeValue === EVENT_DEATH);

  // Resolve parents from parent_family_list
  let editFatherHandle: string | null = null;
  let editMotherHandle: string | null = null;
  if (person.parent_family_list.length > 0) {
    const parentFamily = data.families.get(person.parent_family_list[0]);
    if (parentFamily) {
      editFatherHandle = parentFamily.father_handle || null;
      editMotherHandle = parentFamily.mother_handle || null;
    }
  }

  return {
    firstName: person.primary_name.first_name,
    surname: primarySurname?.surname || "",
    surnamePrefix: primarySurname?.prefix || "",
    suffix: person.primary_name.suffix || "",
    title: person.primary_name.title || "",
    gender: person.gender,
    grampsId: person.gramps_id,
    isPrivate: person.private,
    alternateNames: (person.alternate_names || []).map(altNameFromGramps),
    birthDate: birthEvent?.date || "",
    birthPlace: birthEvent?.place || "",
    deathDate: deathEvent?.date || "",
    deathPlace: deathEvent?.place || "",
    fatherHandle: editFatherHandle,
    motherHandle: editMotherHandle,
  };
}

/** Find the event handle for a person's birth or death event */
function findEventHandle(person: GrampsPerson, data: GrampsData, eventType: number): string | null {
  for (const ref of person.event_ref_list) {
    const event = data.events.get(ref.ref);
    if (event && event.type.value === eventType) return ref.ref;
  }
  return null;
}

/** Find a place handle by title, or return null */
function findPlaceByTitle(data: GrampsData, title: string): string | null {
  for (const [, place] of data.places) {
    if (place.title === title) return place.handle;
  }
  return null;
}

/** Generate a unique handle */
function generateHandle(): string {
  return "_" + Math.random().toString(36).slice(2, 14);
}

export default function PersonDetailPanel({
  handle,
  data,
  includePrivate,
  onClose,
  onNavigate,
  onDataChanged,
}: PersonDetailPanelProps) {
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);

  if (!isVisible(handle, data, includePrivate)) return null;
  const person = data.persons.get(handle)!;

  const name = getPersonName(person);
  const alternateNames = person.alternate_names || [];
  const allEvents = resolveEvents(person, data);
  const birthEvent = allEvents.find((e) => e.typeValue === EVENT_BIRTH);
  const deathEvent = allEvents.find((e) => e.typeValue === EVENT_DEATH);
  const otherEvents = allEvents.filter(
    (e) => e.typeValue !== EVENT_BIRTH && e.typeValue !== EVENT_DEATH
  );

  const startEditing = () => {
    setEditForm(buildEditState(person, data));
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditForm(null);
  };

  const saveEdits = () => {
    if (!editForm) return;

    // Update person
    const updatedPerson: GrampsPerson = {
      ...person,
      gramps_id: editForm.grampsId,
      gender: editForm.gender,
      private: editForm.isPrivate,
      primary_name: {
        ...person.primary_name,
        first_name: editForm.firstName,
        suffix: editForm.suffix,
        title: editForm.title,
        surname_list: [
          {
            ...(person.primary_name.surname_list[0] || { primary: true }),
            surname: editForm.surname,
            prefix: editForm.surnamePrefix,
          },
          ...person.primary_name.surname_list.slice(1),
        ],
      },
      alternate_names: editForm.alternateNames
        .filter((a) => a.firstName.trim() || a.surname.trim())
        .map(altNameToGramps),
    };

    const newPersons = new Map(data.persons);
    newPersons.set(handle, updatedPerson);

    const newEvents = new Map(data.events);
    const newPlaces = new Map(data.places);
    let updatedEventRefs = [...person.event_ref_list];

    // Helper: resolve or create a place
    const resolvePlace = (title: string): string => {
      if (!title.trim()) return "";
      const existing = findPlaceByTitle(data, title);
      if (existing) return existing;
      // Check if we already created it in this save
      for (const [, p] of newPlaces) {
        if (p.title === title) return p.handle;
      }
      const placeHandle = generateHandle();
      newPlaces.set(placeHandle, {
        _class: "Place",
        handle: placeHandle,
        gramps_id: "",
        title,
        name: { value: title },
      });
      return placeHandle;
    };

    // Helper: update or create a vital event
    const updateVitalEvent = (eventType: number, dateStr: string, placeStr: string) => {
      const existingHandle = findEventHandle(person, data, eventType);
      const hasData = dateStr.trim() || placeStr.trim();

      if (existingHandle) {
        const existing = data.events.get(existingHandle)!;
        const dateval = parseDateString(dateStr);
        const sortval = dateval[2] * 10000 + dateval[1] * 100 + dateval[0];
        const placeHandle = placeStr.trim() ? resolvePlace(placeStr) : "";
        newEvents.set(existingHandle, {
          ...existing,
          date: { dateval, text: "", sortval },
          place: placeHandle,
        });
      } else if (hasData) {
        // Create new event
        const eventHandle = generateHandle();
        const dateval = parseDateString(dateStr);
        const sortval = dateval[2] * 10000 + dateval[1] * 100 + dateval[0];
        const placeHandle = placeStr.trim() ? resolvePlace(placeStr) : "";
        newEvents.set(eventHandle, {
          _class: "Event",
          handle: eventHandle,
          gramps_id: "",
          type: { value: eventType, string: eventType === EVENT_BIRTH ? "Birth" : "Death" },
          date: { dateval, text: "", sortval },
          place: placeHandle,
          description: "",
        });
        updatedEventRefs = [...updatedEventRefs, { ref: eventHandle, role: { value: 0 } }];
      }
    };

    updateVitalEvent(EVENT_BIRTH, editForm.birthDate, editForm.birthPlace);
    updateVitalEvent(EVENT_DEATH, editForm.deathDate, editForm.deathPlace);

    // Update event refs if new events were created
    if (updatedEventRefs.length !== person.event_ref_list.length) {
      const personWithRefs = { ...newPersons.get(handle)!, event_ref_list: updatedEventRefs };
      newPersons.set(handle, personWithRefs);
    }

    // ── Parent / family mutations ──
    const newFamilies = new Map(data.families);
    const originalParentFamilyHandle = person.parent_family_list.length > 0 ? person.parent_family_list[0] : null;
    const originalFamily = originalParentFamilyHandle ? data.families.get(originalParentFamilyHandle) : null;

    const origFather = originalFamily?.father_handle || null;
    const origMother = originalFamily?.mother_handle || null;
    const newFather = editForm.fatherHandle;
    const newMother = editForm.motherHandle;
    const parentsChanged = origFather !== newFather || origMother !== newMother;

    if (parentsChanged) {
      if (originalFamily) {
        // Update existing family
        const updatedFamily: GrampsFamily = {
          ...originalFamily,
          father_handle: newFather || "",
          mother_handle: newMother || "",
        };
        newFamilies.set(originalFamily.handle, updatedFamily);

        // Update family_list on old parents that were removed
        if (origFather && origFather !== newFather) {
          const oldFather = newPersons.get(origFather);
          if (oldFather) {
            newPersons.set(origFather, {
              ...oldFather,
              family_list: oldFather.family_list.filter((h) => h !== originalFamily.handle),
            });
          }
        }
        if (origMother && origMother !== newMother) {
          const oldMother = newPersons.get(origMother);
          if (oldMother) {
            newPersons.set(origMother, {
              ...oldMother,
              family_list: oldMother.family_list.filter((h) => h !== originalFamily.handle),
            });
          }
        }

        // Add family to new parents' family_list
        if (newFather && newFather !== origFather) {
          const father = newPersons.get(newFather);
          if (father && !father.family_list.includes(originalFamily.handle)) {
            newPersons.set(newFather, {
              ...father,
              family_list: [...father.family_list, originalFamily.handle],
            });
          }
        }
        if (newMother && newMother !== origMother) {
          const mother = newPersons.get(newMother);
          if (mother && !mother.family_list.includes(originalFamily.handle)) {
            newPersons.set(newMother, {
              ...mother,
              family_list: [...mother.family_list, originalFamily.handle],
            });
          }
        }
      } else if (newFather || newMother) {
        // Create a new family
        const familyHandle = generateHandle();
        const newFamily: GrampsFamily = {
          _class: "Family",
          handle: familyHandle,
          gramps_id: "",
          father_handle: newFather || "",
          mother_handle: newMother || "",
          child_ref_list: [{ ref: handle }],
          event_ref_list: [],
        };
        newFamilies.set(familyHandle, newFamily);

        // Add family to person's parent_family_list
        const currentPerson = newPersons.get(handle)!;
        newPersons.set(handle, {
          ...currentPerson,
          parent_family_list: [...currentPerson.parent_family_list, familyHandle],
        });

        // Add family to parents' family_list
        if (newFather) {
          const father = newPersons.get(newFather);
          if (father) {
            newPersons.set(newFather, {
              ...father,
              family_list: [...father.family_list, familyHandle],
            });
          }
        }
        if (newMother) {
          const mother = newPersons.get(newMother);
          if (mother) {
            newPersons.set(newMother, {
              ...mother,
              family_list: [...mother.family_list, familyHandle],
            });
          }
        }
      }
    }

    onDataChanged({
      ...data,
      persons: newPersons,
      families: newFamilies,
      events: newEvents,
      places: newPlaces,
    });

    setEditing(false);
    setEditForm(null);
  };

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

  // ── Edit mode ──
  if (editing && editForm) {
    const updateField = (field: keyof EditFormState, value: string | number | boolean) => {
      setEditForm((prev) => prev ? { ...prev, [field]: value } : prev);
    };

    const updateAltName = (index: number, field: keyof AltNameEdit, value: string | number) => {
      setEditForm((prev) => {
        if (!prev) return prev;
        const updated = [...prev.alternateNames];
        updated[index] = { ...updated[index], [field]: value };
        return { ...prev, alternateNames: updated };
      });
    };

    const addAltName = () => {
      setEditForm((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          alternateNames: [
            ...prev.alternateNames,
            { firstName: "", surname: "", surnamePrefix: "", suffix: "", typeValue: 3 }, // default to Married Name
          ],
        };
      });
    };

    const removeAltName = (index: number) => {
      setEditForm((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          alternateNames: prev.alternateNames.filter((_, i) => i !== index),
        };
      });
    };

    return (
      <div className="person-detail-panel">
        <div className="pdp-header">
          <button className="pdp-close" onClick={cancelEditing} title="Cancel">
            &times;
          </button>
          <div className="pdp-name">Edit Person</div>
        </div>

        <div className="pdp-edit-form">
          <div className="pdp-edit-section">
            <h3>Identity</h3>
            <label className="pdp-edit-field">
              <span>First name</span>
              <input
                type="text"
                value={editForm.firstName}
                onChange={(e) => updateField("firstName", e.target.value)}
              />
            </label>
            <label className="pdp-edit-field">
              <span>Surname prefix</span>
              <input
                type="text"
                value={editForm.surnamePrefix}
                onChange={(e) => updateField("surnamePrefix", e.target.value)}
                placeholder="e.g. von, de"
              />
            </label>
            <label className="pdp-edit-field">
              <span>Surname</span>
              <input
                type="text"
                value={editForm.surname}
                onChange={(e) => updateField("surname", e.target.value)}
              />
            </label>
            <label className="pdp-edit-field">
              <span>Suffix</span>
              <input
                type="text"
                value={editForm.suffix}
                onChange={(e) => updateField("suffix", e.target.value)}
                placeholder="e.g. Jr., III"
              />
            </label>
            <label className="pdp-edit-field">
              <span>Title</span>
              <input
                type="text"
                value={editForm.title}
                onChange={(e) => updateField("title", e.target.value)}
                placeholder="e.g. Dr., Rev."
              />
            </label>
            <label className="pdp-edit-field">
              <span>Gender</span>
              <select
                value={editForm.gender}
                onChange={(e) => updateField("gender", Number(e.target.value))}
              >
                <option value={0}>Female</option>
                <option value={1}>Male</option>
                <option value={2}>Unknown</option>
              </select>
            </label>
            <label className="pdp-edit-field">
              <span>Gramps ID</span>
              <input
                type="text"
                value={editForm.grampsId}
                onChange={(e) => updateField("grampsId", e.target.value)}
              />
            </label>
            <label className="pdp-edit-checkbox">
              <input
                type="checkbox"
                checked={editForm.isPrivate}
                onChange={(e) => updateField("isPrivate", e.target.checked)}
              />
              <span>Private</span>
            </label>
          </div>

          <div className="pdp-edit-section">
            <h3>Alternate Names</h3>
            {editForm.alternateNames.map((alt, i) => (
              <div key={i} className="pdp-alt-name-edit">
                <div className="pdp-alt-name-header">
                  <select
                    value={alt.typeValue}
                    onChange={(e) => updateAltName(i, "typeValue", Number(e.target.value))}
                    className="pdp-alt-name-type"
                  >
                    {NAME_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <button
                    className="pdp-alt-name-remove"
                    onClick={() => removeAltName(i)}
                    title="Remove this name"
                  >
                    &times;
                  </button>
                </div>
                <label className="pdp-edit-field">
                  <span>First name</span>
                  <input
                    type="text"
                    value={alt.firstName}
                    onChange={(e) => updateAltName(i, "firstName", e.target.value)}
                  />
                </label>
                <label className="pdp-edit-field">
                  <span>Surname prefix</span>
                  <input
                    type="text"
                    value={alt.surnamePrefix}
                    onChange={(e) => updateAltName(i, "surnamePrefix", e.target.value)}
                    placeholder="e.g. von, de"
                  />
                </label>
                <label className="pdp-edit-field">
                  <span>Surname</span>
                  <input
                    type="text"
                    value={alt.surname}
                    onChange={(e) => updateAltName(i, "surname", e.target.value)}
                  />
                </label>
                <label className="pdp-edit-field">
                  <span>Suffix</span>
                  <input
                    type="text"
                    value={alt.suffix}
                    onChange={(e) => updateAltName(i, "suffix", e.target.value)}
                  />
                </label>
              </div>
            ))}
            <button className="pdp-btn-add-alt" onClick={addAltName}>
              + Add alternate name
            </button>
          </div>

          <div className="pdp-edit-section">
            <h3>Birth</h3>
            <label className="pdp-edit-field">
              <span>Date</span>
              <input
                type="text"
                value={editForm.birthDate}
                onChange={(e) => updateField("birthDate", e.target.value)}
                placeholder="DD-MM-YYYY"
              />
            </label>
            <label className="pdp-edit-field">
              <span>Place</span>
              <input
                type="text"
                value={editForm.birthPlace}
                onChange={(e) => updateField("birthPlace", e.target.value)}
              />
            </label>
          </div>

          <div className="pdp-edit-section">
            <h3>Death</h3>
            <label className="pdp-edit-field">
              <span>Date</span>
              <input
                type="text"
                value={editForm.deathDate}
                onChange={(e) => updateField("deathDate", e.target.value)}
                placeholder="DD-MM-YYYY"
              />
            </label>
            <label className="pdp-edit-field">
              <span>Place</span>
              <input
                type="text"
                value={editForm.deathPlace}
                onChange={(e) => updateField("deathPlace", e.target.value)}
              />
            </label>
          </div>

          <div className="pdp-edit-section">
            <h3>Parents</h3>
            <PersonSelect
              data={data}
              value={editForm.fatherHandle}
              onChange={(h) => setEditForm((prev) => prev ? { ...prev, fatherHandle: h } : prev)}
              excludeHandles={[handle, ...(editForm.motherHandle ? [editForm.motherHandle] : [])]}
              label="Father"
            />
            <PersonSelect
              data={data}
              value={editForm.motherHandle}
              onChange={(h) => setEditForm((prev) => prev ? { ...prev, motherHandle: h } : prev)}
              excludeHandles={[handle, ...(editForm.fatherHandle ? [editForm.fatherHandle] : [])]}
              label="Mother"
            />
          </div>

          <div className="pdp-edit-actions">
            <button className="pdp-btn-save" onClick={saveEdits}>
              Save
            </button>
            <button className="pdp-btn-cancel" onClick={cancelEditing}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── View mode ──
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
        <div className="pdp-header-actions">
          <span
            className={`pdp-lock-icon ${person.private ? "pdp-lock-closed" : "pdp-lock-open"}`}
            title={person.private ? "Private" : "Public"}
          >
            {person.private ? "\uD83D\uDD12" : "\uD83D\uDD13"}
          </span>
          <button className="pdp-edit-btn" onClick={startEditing} title="Edit person">
            &#x270E;
          </button>
        </div>
      </div>

      {/* Alternate names */}
      {alternateNames.length > 0 && (
        <div className="pdp-section">
          <h3>Also Known As</h3>
          {alternateNames.map((altName, i) => (
            <div key={i} className="pdp-alt-name">
              <span className="pdp-alt-name-label">{nameTypeLabel(altName)}</span>
              {formatGrampsName(altName)}
            </div>
          ))}
        </div>
      )}

      {/* Vital events */}
      <div className="pdp-section">
        <h3>Vital Events</h3>
        {birthEvent ? (
          <div className="pdp-event">
            <strong>Birth</strong>
            {birthEvent.date && <span> &mdash; {birthEvent.date}</span>}
            {birthEvent.place && <div className="pdp-place">{birthEvent.place}</div>}
          </div>
        ) : (
          <div className="pdp-event pdp-muted">No birth record</div>
        )}
        {deathEvent ? (
          <div className="pdp-event">
            <strong>Death</strong>
            {deathEvent.date && <span> &mdash; {deathEvent.date}</span>}
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
              {e.date && <span> &mdash; {e.date}</span>}
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
