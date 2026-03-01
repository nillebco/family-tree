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

export interface GrampsName {
  first_name: string;
  surname_list: GrampsSurname[];
  suffix: string;
  title: string;
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
}

// Gramps EventType values
export const EVENT_BIRTH = 12;
export const EVENT_DEATH = 5;
export const EVENT_MARRIAGE = 1;
