export interface GrampsDate {
  dateval: [number, number, number, boolean];
  text: string;
  sortval: number;
}

export interface GrampsSurname {
  surname: string;
  prefix: string;
  primary: boolean;
}

export interface GrampsNameType {
  value: number; // 0=Unknown, 1=Birth Name (default), 2=Married Name, 3=Also Known As
  string: string;
}

export interface GrampsName {
  first_name: string;
  surname_list: GrampsSurname[];
  suffix: string;
  title: string;
  type?: GrampsNameType;
}

export interface GrampsEventRef {
  ref: string;
  role: { value: number };
}

export interface GrampsPerson {
  _class: "Person";
  handle: string;
  gramps_id: string;
  private: boolean;
  gender: number; // 0=female, 1=male, 2=unknown
  primary_name: GrampsName;
  alternate_names?: GrampsName[];
  event_ref_list: GrampsEventRef[];
  family_list: string[];
  parent_family_list: string[];
}

export interface GrampsChildRef {
  ref: string;
}

export interface GrampsFamily {
  _class: "Family";
  handle: string;
  gramps_id: string;
  father_handle: string;
  mother_handle: string;
  child_ref_list: GrampsChildRef[];
  event_ref_list: GrampsEventRef[];
}

export interface GrampsEvent {
  _class: "Event";
  handle: string;
  gramps_id: string;
  type: { value: number; string: string };
  date: GrampsDate;
  place: string;
  description: string;
}

export interface GrampsPlace {
  _class: "Place";
  handle: string;
  gramps_id: string;
  title: string;
  name: { value: string };
}

export interface GrampsData {
  persons: Map<string, GrampsPerson>;
  families: Map<string, GrampsFamily>;
  events: Map<string, GrampsEvent>;
  places: Map<string, GrampsPlace>;
  /** Raw NDJSON lines for objects we don't parse (kept for faithful re-export) */
  rawOtherLines: string[];
}

// Gramps EventType values
export const EVENT_BIRTH = 12;
export const EVENT_DEATH = 5;
export const EVENT_MARRIAGE = 1;
