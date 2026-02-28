import type { GrampsData, GrampsPerson } from "../types/gramps";
import { EVENT_BIRTH, EVENT_DEATH } from "../types/gramps";

export function getPersonName(person: GrampsPerson): string {
  const first = person.primary_name.first_name || "";
  const surname =
    person.primary_name.surname_list.find((s) => s.primary)?.surname ||
    person.primary_name.surname_list[0]?.surname ||
    "";
  return `${first} ${surname}`.trim() || person.gramps_id;
}

function getEventByType(
  person: GrampsPerson,
  data: GrampsData,
  eventType: number
): { year: number; placeTitle: string } | null {
  for (const ref of person.event_ref_list) {
    if (ref.role.value !== 1) continue;
    const event = data.events.get(ref.ref);
    if (!event || event.type.value !== eventType) continue;
    const year = event.date?.dateval?.[2] || 0;
    const placeTitle = event.place
      ? data.places.get(event.place)?.title || ""
      : "";
    return { year, placeTitle };
  }
  return null;
}

export function formatDates(person: GrampsPerson, data: GrampsData): string {
  const birth = getEventByType(person, data, EVENT_BIRTH);
  const death = getEventByType(person, data, EVENT_DEATH);
  const bStr = birth?.year ? `b.${birth.year}` : "";
  const dStr = death?.year ? `d.${death.year}` : "";
  if (bStr && dStr) return `${bStr} - ${dStr}`;
  return bStr || dStr || "";
}

export function getBirthPlace(person: GrampsPerson, data: GrampsData): string {
  const birth = getEventByType(person, data, EVENT_BIRTH);
  return birth?.placeTitle || "";
}

/** Info for rendering a single node */
export interface NodeInfo {
  id: number;
  name: string;
  dates: string;
  place: string;
  isSelected: boolean;
}

/** Ancestor tree node — fans out upward (each person has 0-2 parents) */
export interface AncestorNode {
  info: NodeInfo;
  father?: AncestorNode;
  mother?: AncestorNode;
}

/** Descendant tree node — fans out downward */
export interface DescendantNode {
  info: NodeInfo;
  children: DescendantNode[];
}

/** Full hourglass data: ancestors above, descendants below, centered on selected person */
export interface HourglassData {
  ancestors: AncestorNode; // root = selected person, branches up to parents/grandparents
  descendants: DescendantNode; // root = selected person, branches down to children
}

let nextId = 1;

function makeNodeInfo(
  handle: string,
  data: GrampsData,
  selectedHandle: string,
  spouseNames?: string[]
): NodeInfo {
  const person = data.persons.get(handle)!;
  const personName = getPersonName(person);
  const name =
    spouseNames && spouseNames.length > 0
      ? `${personName} & ${spouseNames.join(", ")}`
      : personName;
  return {
    id: nextId++,
    name,
    dates: formatDates(person, data),
    place: getBirthPlace(person, data),
    isSelected: handle === selectedHandle,
  };
}

/**
 * Build ancestor tree upward from a person. Each node has optional father/mother branches.
 * Couples are shown: if person has a spouse via parent family, both names appear.
 */
function buildAncestorTree(
  handle: string,
  data: GrampsData,
  selectedHandle: string,
  maxUp: number,
  depth: number = 0
): AncestorNode {
  const person = data.persons.get(handle);
  if (!person) {
    return { info: { id: nextId++, name: "?", dates: "", place: "", isSelected: false } };
  }

  // For the selected person (depth 0), show with spouse(s)
  // For ancestors (depth > 0), show individual (spouse shown as sibling in same generation)
  let info: NodeInfo;
  if (depth === 0) {
    const spouseNames: string[] = [];
    for (const fh of person.family_list) {
      const fam = data.families.get(fh);
      if (!fam) continue;
      const sh = fam.father_handle === handle ? fam.mother_handle : fam.father_handle;
      const spouse = sh ? data.persons.get(sh) : null;
      if (spouse) spouseNames.push(getPersonName(spouse));
    }
    info = makeNodeInfo(handle, data, selectedHandle, spouseNames);
  } else {
    info = makeNodeInfo(handle, data, selectedHandle);
  }

  if (depth >= maxUp || !person.parent_family_list.length) {
    return { info };
  }

  const parentFamily = data.families.get(person.parent_family_list[0]);
  if (!parentFamily) return { info };

  let father: AncestorNode | undefined;
  let mother: AncestorNode | undefined;

  if (parentFamily.father_handle && data.persons.get(parentFamily.father_handle)) {
    father = buildAncestorTree(
      parentFamily.father_handle,
      data,
      selectedHandle,
      maxUp,
      depth + 1
    );
  }

  if (parentFamily.mother_handle && data.persons.get(parentFamily.mother_handle)) {
    mother = buildAncestorTree(
      parentFamily.mother_handle,
      data,
      selectedHandle,
      maxUp,
      depth + 1
    );
  }

  return { info, father, mother };
}

/**
 * Build descendant tree downward from a person.
 * Processes ALL families (handles multiple marriages). Shows couples.
 */
function buildDescendantTree(
  handle: string,
  data: GrampsData,
  selectedHandle: string,
  visited: Set<string>,
  maxDepth: number = 20,
  depth: number = 0
): DescendantNode | null {
  if (depth > maxDepth || visited.has(handle)) return null;
  visited.add(handle);

  const person = data.persons.get(handle);
  if (!person) return null;

  const allChildren: DescendantNode[] = [];
  const spouseNames: string[] = [];
  let isSelected = handle === selectedHandle;

  for (const familyHandle of person.family_list) {
    const family = data.families.get(familyHandle);
    if (!family) continue;

    const spouseHandle =
      family.father_handle === handle
        ? family.mother_handle
        : family.father_handle;
    const spouse = spouseHandle ? data.persons.get(spouseHandle) : null;

    if (spouse) {
      visited.add(spouseHandle!);
      spouseNames.push(getPersonName(spouse));
      if (spouseHandle === selectedHandle) isSelected = true;
    }

    for (const childRef of family.child_ref_list) {
      const childNode = buildDescendantTree(
        childRef.ref,
        data,
        selectedHandle,
        visited,
        maxDepth,
        depth + 1
      );
      if (childNode) allChildren.push(childNode);
    }
  }

  const personName = getPersonName(person);
  const name =
    spouseNames.length > 0
      ? `${personName} & ${spouseNames.join(", ")}`
      : personName;

  return {
    info: {
      id: nextId++,
      name,
      dates: formatDates(person, data),
      place: getBirthPlace(person, data),
      isSelected,
    },
    children: allChildren,
  };
}

/**
 * Build hourglass data centered on selected person.
 */
export function buildHourglass(
  selectedHandle: string,
  data: GrampsData,
  maxUp: number = 4
): HourglassData {
  nextId = 1;

  const ancestors = buildAncestorTree(selectedHandle, data, selectedHandle, maxUp);

  // For descendants, skip the selected person's ancestors (they're shown above)
  const visited = new Set<string>();
  // Mark ancestor handles as visited so they don't appear in descendant tree
  collectAncestorHandles(selectedHandle, data, maxUp, visited);
  // But remove the selected person so we can build their descendants
  visited.delete(selectedHandle);

  const descendants = buildDescendantTree(
    selectedHandle,
    data,
    selectedHandle,
    visited
  ) ?? {
    info: ancestors.info,
    children: [],
  };

  return { ancestors, descendants };
}

/** Collect all person handles in the ancestor tree so descendants don't duplicate them */
function collectAncestorHandles(
  handle: string,
  data: GrampsData,
  maxUp: number,
  out: Set<string>,
  depth: number = 0
): void {
  out.add(handle);
  if (depth >= maxUp) return;
  const person = data.persons.get(handle);
  if (!person || !person.parent_family_list.length) return;
  const fam = data.families.get(person.parent_family_list[0]);
  if (!fam) return;
  if (fam.father_handle && data.persons.get(fam.father_handle)) {
    collectAncestorHandles(fam.father_handle, data, maxUp, out, depth + 1);
  }
  if (fam.mother_handle && data.persons.get(fam.mother_handle)) {
    collectAncestorHandles(fam.mother_handle, data, maxUp, out, depth + 1);
  }
}

/**
 * Get a sorted list of all persons for the picker.
 */
export function getSortedPersons(
  data: GrampsData
): Array<{ handle: string; name: string; dates: string }> {
  const list: Array<{ handle: string; name: string; dates: string }> = [];
  for (const [handle, person] of data.persons) {
    list.push({
      handle,
      name: getPersonName(person),
      dates: formatDates(person, data),
    });
  }
  list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}
