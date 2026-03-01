import { describe, it, expect } from "vitest";
import { buildHourglass } from "./treeBuilder";
import { layoutHourglass, NODE_W, H_GAP } from "./hourglassLayout";
import type {
  GrampsData,
  GrampsPerson,
  GrampsFamily,
  GrampsEvent,
} from "../types/gramps";
import { EVENT_BIRTH } from "../types/gramps";

/**
 * Build minimal mock GrampsData for testing.
 *
 * Family tree used in tests:
 *
 *   Father (male) + Mother (female)
 *     ├── Brother (male)      — sibling
 *     ├── Remo (male)         — SELECTED
 *     └── Sister (female)     — sibling
 *
 *   Remo + Spouse (female)
 *     └── Darlene (female, private)
 */
function makeMockData(): { data: GrampsData; handles: Record<string, string> } {
  const handles = {
    father: "h_father",
    mother: "h_mother",
    brother: "h_brother",
    remo: "h_remo",
    sister: "h_sister",
    spouse: "h_spouse",
    darlene: "h_darlene",
  };

  function makePerson(
    handle: string,
    firstName: string,
    surname: string,
    gender: number,
    familyList: string[],
    parentFamilyList: string[],
    isPrivate: boolean = false
  ): GrampsPerson {
    return {
      _class: "Person",
      handle,
      gramps_id: handle,
      private: isPrivate,
      gender,
      primary_name: {
        first_name: firstName,
        surname_list: [{ surname, prefix: "", primary: true }],
        suffix: "",
        title: "",
      },
      event_ref_list: [],
      family_list: familyList,
      parent_family_list: parentFamilyList,
    };
  }

  const parentFamily: GrampsFamily = {
    _class: "Family",
    handle: "fam_parents",
    gramps_id: "fam_parents",
    father_handle: handles.father,
    mother_handle: handles.mother,
    child_ref_list: [
      { ref: handles.brother },
      { ref: handles.remo },
      { ref: handles.sister },
    ],
    event_ref_list: [],
  };

  const remoFamily: GrampsFamily = {
    _class: "Family",
    handle: "fam_remo",
    gramps_id: "fam_remo",
    father_handle: handles.remo,
    mother_handle: handles.spouse,
    child_ref_list: [{ ref: handles.darlene }],
    event_ref_list: [],
  };

  const persons = new Map<string, GrampsPerson>();
  persons.set(
    handles.father,
    makePerson(handles.father, "Father", "Test", 1, ["fam_parents"], [])
  );
  persons.set(
    handles.mother,
    makePerson(handles.mother, "Mother", "Test", 0, ["fam_parents"], [])
  );
  persons.set(
    handles.brother,
    makePerson(handles.brother, "Brother", "Test", 1, [], ["fam_parents"])
  );
  persons.set(
    handles.remo,
    makePerson(handles.remo, "Remo", "Test", 1, ["fam_remo"], ["fam_parents"])
  );
  persons.set(
    handles.sister,
    makePerson(handles.sister, "Sister", "Test", 0, [], ["fam_parents"])
  );
  persons.set(
    handles.spouse,
    makePerson(handles.spouse, "Spouse", "Test", 0, ["fam_remo"], [])
  );
  persons.set(
    handles.darlene,
    makePerson(handles.darlene, "Darlene", "Test", 0, [], ["fam_remo"], true)
  );

  const families = new Map<string, GrampsFamily>();
  families.set("fam_parents", parentFamily);
  families.set("fam_remo", remoFamily);

  const data: GrampsData = {
    persons,
    families,
    events: new Map(),
    places: new Map(),
  };

  return { data, handles };
}

describe("buildHourglass", () => {
  it("selected person's children appear in selectedDescendants", () => {
    const { data, handles } = makeMockData();
    const result = buildHourglass(handles.remo, data, 4);

    // selectedDescendants should have families (Remo's family with Darlene)
    expect(result.selectedDescendants.families.length).toBeGreaterThan(0);

    // Find Darlene among descendant children
    const allChildren = result.selectedDescendants.families.flatMap(
      (f) => f.children
    );
    const darlene = allChildren.find(
      (c) => c.info.handle === handles.darlene
    );
    expect(darlene).toBeDefined();
    expect(darlene!.info.name).toBe("Darlene Test");
    expect(darlene!.info.isPrivate).toBe(true);
  });

  it("selected person's spouse appears in selectedDescendants", () => {
    const { data, handles } = makeMockData();
    const result = buildHourglass(handles.remo, data, 4);

    // The first family should have the spouse
    const firstFamily = result.selectedDescendants.families[0];
    expect(firstFamily).toBeDefined();
    expect(firstFamily.spouse).toBeDefined();
    expect(firstFamily.spouse!.handle).toBe(handles.spouse);
    expect(firstFamily.spouse!.name).toBe("Spouse Test");
  });

  it("ancestors have siblings populated", () => {
    const { data, handles } = makeMockData();
    const result = buildHourglass(handles.remo, data, 4);

    // The root ancestor node IS Remo (selected). Remo has siblings (Brother, Sister).
    const remoNode = result.ancestors;
    expect(remoNode.info.handle).toBe(handles.remo);
    expect(remoNode.siblings.length).toBe(2);

    const siblingHandles = remoNode.siblings.map((s) => s.handle);
    expect(siblingHandles).toContain(handles.brother);
    expect(siblingHandles).toContain(handles.sister);
  });

  it("ancestors include father and mother", () => {
    const { data, handles } = makeMockData();
    const result = buildHourglass(handles.remo, data, 4);

    expect(result.ancestors.father).toBeDefined();
    expect(result.ancestors.father!.info.handle).toBe(handles.father);

    expect(result.ancestors.mother).toBeDefined();
    expect(result.ancestors.mother!.info.handle).toBe(handles.mother);
  });

  it("siblings are sorted by birth date (oldest first)", () => {
    const { data, handles } = makeMockData();

    // Add birth events: Sister born 1980, Brother born 1985
    // So Sister should come before Brother in the sorted order
    function addBirthEvent(
      personHandle: string,
      eventHandle: string,
      year: number
    ) {
      const event: GrampsEvent = {
        _class: "Event",
        handle: eventHandle,
        gramps_id: eventHandle,
        type: { value: EVENT_BIRTH, string: "Birth" },
        date: {
          dateval: [1, 1, year, false],
          text: "",
          sortval: year * 10000 + 101,
        },
        place: "",
        description: "",
      };
      data.events.set(eventHandle, event);
      data.persons.get(personHandle)!.event_ref_list.push({
        ref: eventHandle,
        role: { value: 1 },
      });
    }

    addBirthEvent(handles.sister, "evt_sister_birth", 1980);
    addBirthEvent(handles.brother, "evt_brother_birth", 1985);

    const result = buildHourglass(handles.remo, data, 4);
    const siblings = result.ancestors.siblings;
    expect(siblings.length).toBe(2);

    // Sister (1980) should come before Brother (1985)
    expect(siblings[0].handle).toBe(handles.sister);
    expect(siblings[1].handle).toBe(handles.brother);
  });
});

describe("layoutHourglass — sibling placement by gender", () => {
  const nodeSpan = NODE_W + H_GAP;

  it("male ancestor: expanded siblings appear to the LEFT", () => {
    const { data, handles } = makeMockData();
    const hourglass = buildHourglass(handles.remo, data, 4);

    // Remo is male (gender=1) — expand his siblings
    const expanded = new Set([handles.remo]);
    const layout = layoutHourglass(
      hourglass.ancestors,
      hourglass.selectedDescendants,
      expanded
    );

    const remoNode = layout.nodes.find((n) => n.info.handle === handles.remo)!;
    expect(remoNode).toBeDefined();

    // All siblings should be to the LEFT of Remo (lower x)
    for (const sibling of hourglass.ancestors.siblings) {
      const sibNode = layout.nodes.find(
        (n) => n.info.handle === sibling.handle
      )!;
      expect(sibNode).toBeDefined();
      expect(sibNode.x).toBeLessThan(remoNode.x);
    }
  });

  it("female ancestor: expanded siblings appear to the RIGHT", () => {
    // Build hourglass for Mother (female, gender=0)
    // Mother has no parent_family_list, so she has no siblings in this mock.
    // Let's create a scenario where a female has siblings.
    const { data, handles } = makeMockData();

    // Add grandparents so Mother gets siblings
    const grandpa: GrampsPerson = {
      _class: "Person",
      handle: "h_grandpa",
      gramps_id: "h_grandpa",
      private: false,
      gender: 1,
      primary_name: {
        first_name: "Grandpa",
        surname_list: [{ surname: "Test", prefix: "", primary: true }],
        suffix: "",
        title: "",
      },
      event_ref_list: [],
      family_list: ["fam_grandparents"],
      parent_family_list: [],
    };
    const grandma: GrampsPerson = {
      _class: "Person",
      handle: "h_grandma",
      gramps_id: "h_grandma",
      private: false,
      gender: 0,
      primary_name: {
        first_name: "Grandma",
        surname_list: [{ surname: "Test", prefix: "", primary: true }],
        suffix: "",
        title: "",
      },
      event_ref_list: [],
      family_list: ["fam_grandparents"],
      parent_family_list: [],
    };
    const aunt: GrampsPerson = {
      _class: "Person",
      handle: "h_aunt",
      gramps_id: "h_aunt",
      private: false,
      gender: 0,
      primary_name: {
        first_name: "Aunt",
        surname_list: [{ surname: "Test", prefix: "", primary: true }],
        suffix: "",
        title: "",
      },
      event_ref_list: [],
      family_list: [],
      parent_family_list: ["fam_grandparents"],
    };
    const grandparentFamily: GrampsFamily = {
      _class: "Family",
      handle: "fam_grandparents",
      gramps_id: "fam_grandparents",
      father_handle: "h_grandpa",
      mother_handle: "h_grandma",
      child_ref_list: [{ ref: handles.mother }, { ref: "h_aunt" }],
      event_ref_list: [],
    };

    data.persons.set("h_grandpa", grandpa);
    data.persons.set("h_grandma", grandma);
    data.persons.set("h_aunt", aunt);
    data.families.set("fam_grandparents", grandparentFamily);
    // Give Mother a parent_family_list
    data.persons.get(handles.mother)!.parent_family_list = [
      "fam_grandparents",
    ];

    const hourglass = buildHourglass(handles.remo, data, 4);

    // Mother is female (gender=0) — find her in the ancestor tree
    const motherNode = hourglass.ancestors.mother!;
    expect(motherNode).toBeDefined();
    expect(motherNode.info.handle).toBe(handles.mother);
    expect(motherNode.siblings.length).toBe(1);
    expect(motherNode.siblings[0].handle).toBe("h_aunt");

    // Expand Mother's siblings
    const expanded = new Set([handles.mother]);
    const layout = layoutHourglass(
      hourglass.ancestors,
      hourglass.selectedDescendants,
      expanded
    );

    const motherPlaced = layout.nodes.find(
      (n) => n.info.handle === handles.mother
    )!;
    const auntPlaced = layout.nodes.find(
      (n) => n.info.handle === "h_aunt"
    )!;

    expect(motherPlaced).toBeDefined();
    expect(auntPlaced).toBeDefined();
    // Aunt should be to the RIGHT of Mother
    expect(auntPlaced.x).toBeGreaterThan(motherPlaced.x);
  });

  it("layout includes spouse and child nodes for selected person", () => {
    const { data, handles } = makeMockData();
    const hourglass = buildHourglass(handles.remo, data, 4);
    const layout = layoutHourglass(
      hourglass.ancestors,
      hourglass.selectedDescendants,
      new Set()
    );

    const spouseNode = layout.nodes.find(
      (n) => n.info.handle === handles.spouse
    );
    expect(spouseNode).toBeDefined();

    const darleneNode = layout.nodes.find(
      (n) => n.info.handle === handles.darlene
    );
    expect(darleneNode).toBeDefined();
    expect(darleneNode!.info.isPrivate).toBe(true);
  });

  it("parent-level siblings are farther from direct line than child-level siblings", () => {
    const { data, handles } = makeMockData();

    // Add a paternal uncle (Father's sibling) via grandparents
    const grandpa: GrampsPerson = {
      _class: "Person",
      handle: "h_pgrandpa",
      gramps_id: "h_pgrandpa",
      private: false,
      gender: 1,
      primary_name: {
        first_name: "PGrandpa",
        surname_list: [{ surname: "Test", prefix: "", primary: true }],
        suffix: "",
        title: "",
      },
      event_ref_list: [],
      family_list: ["fam_pgrandparents"],
      parent_family_list: [],
    };
    const grandma: GrampsPerson = {
      _class: "Person",
      handle: "h_pgrandma",
      gramps_id: "h_pgrandma",
      private: false,
      gender: 0,
      primary_name: {
        first_name: "PGrandma",
        surname_list: [{ surname: "Test", prefix: "", primary: true }],
        suffix: "",
        title: "",
      },
      event_ref_list: [],
      family_list: ["fam_pgrandparents"],
      parent_family_list: [],
    };
    const uncle: GrampsPerson = {
      _class: "Person",
      handle: "h_uncle",
      gramps_id: "h_uncle",
      private: false,
      gender: 1,
      primary_name: {
        first_name: "Uncle",
        surname_list: [{ surname: "Test", prefix: "", primary: true }],
        suffix: "",
        title: "",
      },
      event_ref_list: [],
      family_list: [],
      parent_family_list: ["fam_pgrandparents"],
    };
    const pgpFamily: GrampsFamily = {
      _class: "Family",
      handle: "fam_pgrandparents",
      gramps_id: "fam_pgrandparents",
      father_handle: "h_pgrandpa",
      mother_handle: "h_pgrandma",
      child_ref_list: [{ ref: handles.father }, { ref: "h_uncle" }],
      event_ref_list: [],
    };

    data.persons.set("h_pgrandpa", grandpa);
    data.persons.set("h_pgrandma", grandma);
    data.persons.set("h_uncle", uncle);
    data.families.set("fam_pgrandparents", pgpFamily);
    data.persons.get(handles.father)!.parent_family_list = [
      "fam_pgrandparents",
    ];

    const hourglass = buildHourglass(handles.remo, data, 4);

    // Expand siblings at both levels: Remo (gen 0) and Father (gen 1)
    const expanded = new Set([handles.remo, handles.father]);
    const layout = layoutHourglass(
      hourglass.ancestors,
      hourglass.selectedDescendants,
      expanded
    );

    const remoNode = layout.nodes.find(
      (n) => n.info.handle === handles.remo
    )!;
    const fatherNode = layout.nodes.find(
      (n) => n.info.handle === handles.father
    )!;

    // Remo's siblings (gen 0) — distance from Remo
    const remoSibDistances = hourglass.ancestors.siblings.map((s) => {
      const sibNode = layout.nodes.find((n) => n.info.handle === s.handle)!;
      return Math.abs(sibNode.x - remoNode.x);
    });

    // Father's siblings (gen 1) — distance from Remo (the direct line center)
    const fatherSibDistances = hourglass.ancestors.father!.siblings.map(
      (s) => {
        const sibNode = layout.nodes.find((n) => n.info.handle === s.handle)!;
        return Math.abs(sibNode.x - remoNode.x);
      }
    );

    const maxRemoSibDist = Math.max(...remoSibDistances);
    const minFatherSibDist = Math.min(...fatherSibDistances);

    // Father's siblings (level n=parent) should be farther from the
    // direct line than Remo's siblings (level n+1=child)
    expect(minFatherSibDist).toBeGreaterThan(maxRemoSibDist);
  });

  it("siblings are at the same y-level as their direct-line sibling", () => {
    const { data, handles } = makeMockData();
    const hourglass = buildHourglass(handles.remo, data, 4);

    const expanded = new Set([handles.remo]);
    const layout = layoutHourglass(
      hourglass.ancestors,
      hourglass.selectedDescendants,
      expanded
    );

    const remoNode = layout.nodes.find((n) => n.info.handle === handles.remo)!;

    for (const sibling of hourglass.ancestors.siblings) {
      const sibNode = layout.nodes.find(
        (n) => n.info.handle === sibling.handle
      )!;
      expect(sibNode.y).toBe(remoNode.y);
    }
  });
});
