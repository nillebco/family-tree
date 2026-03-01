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
  handle: string;
  gender: number; // 0=female, 1=male, 2=unknown
  name: string;
  dates: string;
  place: string;
  isSelected: boolean;
  isPrivate: boolean;
}

export interface SiblingNode {
  info: NodeInfo;
  families: SiblingFamily[];
}

export interface SiblingFamily {
  spouse?: NodeInfo;
  children: SiblingNode[]; // each child is a SiblingNode so it can be expanded further
}

/**
 * Ancestor tree node — each node is ONE person.
 * father/mother branch upward to their respective parents.
 */
export interface AncestorNode {
  info: NodeInfo;
  father?: AncestorNode;
  mother?: AncestorNode;
  siblings: SiblingNode[];
}

/** A family unit in the descendant tree: person + spouse + their children */
export interface DescendantFamily {
  spouse?: NodeInfo;
  children: DescendantNode[];
}

/** Descendant tree node — each node is ONE person with their family units */
export interface DescendantNode {
  info: NodeInfo;
  families: DescendantFamily[];
}

/** Full hourglass data */
export interface HourglassData {
  ancestors: AncestorNode;
  selectedDescendants: DescendantNode;
}

let nextId = 1;

function makePersonInfo(
  handle: string,
  data: GrampsData,
  selectedHandle: string
): NodeInfo {
  const person = data.persons.get(handle)!;
  return {
    id: nextId++,
    handle,
    gender: person.gender,
    name: getPersonName(person),
    dates: formatDates(person, data),
    place: getBirthPlace(person, data),
    isSelected: handle === selectedHandle,
    isPrivate: person.private,
  };
}

/**
 * Build a SiblingNode for a person handle — resolves their families
 * (spouse + children recursively as SiblingNode).
 */
function buildSiblingNode(
  handle: string,
  data: GrampsData,
  selectedHandle: string,
  visited: Set<string> = new Set()
): SiblingNode {
  const info = makePersonInfo(handle, data, selectedHandle);

  if (visited.has(handle)) return { info, families: [] };
  visited.add(handle);

  const person = data.persons.get(handle)!;
  const families: SiblingFamily[] = [];

  for (const familyHandle of person.family_list) {
    const family = data.families.get(familyHandle);
    if (!family) continue;

    const spouseHandle =
      family.father_handle === handle
        ? family.mother_handle
        : family.father_handle;

    let spouse: NodeInfo | undefined;
    if (spouseHandle && data.persons.get(spouseHandle)) {
      spouse = makePersonInfo(spouseHandle, data, selectedHandle);
    }

    const children: SiblingNode[] = [];
    for (const childRef of family.child_ref_list) {
      if (data.persons.get(childRef.ref)) {
        children.push(buildSiblingNode(childRef.ref, data, selectedHandle, visited));
      }
    }

    families.push({ spouse, children });
  }

  return { info, families };
}

/**
 * Build ancestor tree upward from a person.
 * Each node is one person; father and mother are separate branches.
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
    return {
      info: {
        id: nextId++,
        handle: "",
        gender: 2,
        name: "?",
        dates: "",
        place: "",
        isSelected: false,
        isPrivate: false,
      },
      siblings: [],
    };
  }

  const info = makePersonInfo(handle, data, selectedHandle);

  if (depth >= maxUp || !person.parent_family_list.length) {
    return { info, siblings: [] };
  }

  const parentFamily = data.families.get(person.parent_family_list[0]);
  if (!parentFamily) return { info, siblings: [] };

  // Collect siblings: other children of the same parent family, sorted by birth date
  const siblings: SiblingNode[] = [];
  for (const childRef of parentFamily.child_ref_list) {
    if (childRef.ref !== handle && data.persons.get(childRef.ref)) {
      siblings.push(buildSiblingNode(childRef.ref, data, selectedHandle));
    }
  }
  siblings.sort((a, b) => {
    const pa = data.persons.get(a.info.handle);
    const pb = data.persons.get(b.info.handle);
    const ba = pa ? getEventByType(pa, data, EVENT_BIRTH) : null;
    const bb = pb ? getEventByType(pb, data, EVENT_BIRTH) : null;
    return (ba?.year ?? Infinity) - (bb?.year ?? Infinity);
  });

  let father: AncestorNode | undefined;
  let mother: AncestorNode | undefined;

  if (
    parentFamily.father_handle &&
    data.persons.get(parentFamily.father_handle)
  ) {
    father = buildAncestorTree(
      parentFamily.father_handle,
      data,
      selectedHandle,
      maxUp,
      depth + 1
    );
  }

  if (
    parentFamily.mother_handle &&
    data.persons.get(parentFamily.mother_handle)
  ) {
    mother = buildAncestorTree(
      parentFamily.mother_handle,
      data,
      selectedHandle,
      maxUp,
      depth + 1
    );
  }

  return { info, father, mother, siblings };
}

/**
 * Build descendant tree downward from a person.
 * Each node is ONE person. Each family unit includes the spouse and children.
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

  const families: DescendantFamily[] = [];

  for (const familyHandle of person.family_list) {
    const family = data.families.get(familyHandle);
    if (!family) continue;

    const spouseHandle =
      family.father_handle === handle
        ? family.mother_handle
        : family.father_handle;

    let spouseInfo: NodeInfo | undefined;
    if (spouseHandle && data.persons.get(spouseHandle)) {
      visited.add(spouseHandle);
      spouseInfo = makePersonInfo(spouseHandle, data, selectedHandle);
    }

    const children: DescendantNode[] = [];
    for (const childRef of family.child_ref_list) {
      const childNode = buildDescendantTree(
        childRef.ref,
        data,
        selectedHandle,
        visited,
        maxDepth,
        depth + 1
      );
      if (childNode) children.push(childNode);
    }

    families.push({ spouse: spouseInfo, children });
  }

  return {
    info: makePersonInfo(handle, data, selectedHandle),
    families,
  };
}


/**
 * Build hourglass data centered on selected person.
 *
 * The ancestor tree starts from the selected person's father (of their
 * parent family).  The descendant tree starts from that same father,
 * so all siblings (children of the parent family) are visible.
 *
 * If the person has no known parent family we fall back to showing
 * just the selected person as root.
 */
export function buildHourglass(
  selectedHandle: string,
  data: GrampsData,
  maxUp: number = 4
): HourglassData {
  nextId = 1;

  const ancestors = buildAncestorTree(
    selectedHandle,
    data,
    selectedHandle,
    maxUp
  );

  // Selected person's own descendants (children, grandchildren, …).
  const selVisited = new Set<string>();
  const selectedDescendants = buildDescendantTree(
    selectedHandle,
    data,
    selectedHandle,
    selVisited
  ) ?? {
    info: makePersonInfo(selectedHandle, data, selectedHandle),
    families: [],
  };

  return { ancestors, selectedDescendants };
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
