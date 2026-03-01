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

/**
 * Ancestor tree node — each node is ONE person.
 * father/mother branch upward to their respective parents.
 */
export interface AncestorNode {
  info: NodeInfo;
  father?: AncestorNode;
  mother?: AncestorNode;
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
  descendants: DescendantNode;
  directLine: Set<string>;
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
    };
  }

  const info = makePersonInfo(handle, data, selectedHandle);

  if (depth >= maxUp || !person.parent_family_list.length) {
    return { info };
  }

  const parentFamily = data.families.get(person.parent_family_list[0]);
  if (!parentFamily) return { info };

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

  return { info, father, mother };
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
 * Find the direct-line path from rootHandle down to selectedHandle
 * via DFS through family_list → child_ref_list.
 * Returns a Set of all person handles on this path.
 */
export function findDirectLinePath(
  rootHandle: string,
  selectedHandle: string,
  data: GrampsData
): Set<string> {
  const path = new Set<string>();
  if (rootHandle === selectedHandle) {
    path.add(rootHandle);
    return path;
  }

  function dfs(handle: string, visited: Set<string>): boolean {
    if (handle === selectedHandle) return true;
    if (visited.has(handle)) return false;
    visited.add(handle);

    const person = data.persons.get(handle);
    if (!person) return false;

    for (const familyHandle of person.family_list) {
      const family = data.families.get(familyHandle);
      if (!family) continue;
      for (const childRef of family.child_ref_list) {
        if (dfs(childRef.ref, visited)) {
          path.add(childRef.ref);
          return true;
        }
      }
    }
    return false;
  }

  const visited = new Set<string>();
  if (dfs(rootHandle, visited)) {
    path.add(rootHandle);
  }
  return path;
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

  // Walk upward from selected person as far as possible (up to maxUp levels)
  // so that siblings at every generation on the path are available in the
  // descendant tree.
  let rootHandle = selectedHandle;
  let stepsUp = 0;
  {
    let currentHandle = selectedHandle;
    while (stepsUp < maxUp) {
      const person = data.persons.get(currentHandle);
      if (!person || !person.parent_family_list.length) break;
      const parentFam = data.families.get(person.parent_family_list[0]);
      if (!parentFam) break;
      const parentHandle =
        parentFam.father_handle || parentFam.mother_handle;
      if (!parentHandle || !data.persons.get(parentHandle)) break;
      currentHandle = parentHandle;
      stepsUp++;
    }
    rootHandle = currentHandle;
  }

  // Ancestor tree from the SELECTED person (full binary tree showing both
  // paternal and maternal lines).  The descendant tree starts from the root
  // found above so that siblings along the direct line are visible.
  const ancestors = buildAncestorTree(
    selectedHandle,
    data,
    selectedHandle,
    maxUp
  );

  // Collect ancestor handles so descendants don't duplicate them
  const visited = new Set<string>();
  collectAncestorHandles(selectedHandle, data, maxUp, visited);
  visited.delete(rootHandle);

  const descendants = buildDescendantTree(
    rootHandle,
    data,
    selectedHandle,
    visited
  ) ?? {
    info: ancestors.info,
    families: [],
  };

  const directLine = findDirectLinePath(rootHandle, selectedHandle, data);

  return { ancestors, descendants, directLine };
}

/** Collect all person handles in the ancestor tree */
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
