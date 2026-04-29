import { describe, it, expect } from "vitest";
import {
  buildTmpToRealMap,
  isTmpTicketId,
  makeTmpTicketId,
  translateTmpIdsInMap,
  TMP_ID_PREFIX,
} from "@/lib/ticket-tmp-id";

describe("ticket-tmp-id", () => {
  it("makeTmpTicketId mints unique ids prefixed with tmp-", () => {
    const a = makeTmpTicketId();
    const b = makeTmpTicketId();
    expect(a).not.toBe(b);
    expect(a.startsWith(TMP_ID_PREFIX)).toBe(true);
    expect(b.startsWith(TMP_ID_PREFIX)).toBe(true);
  });

  it("isTmpTicketId is true only for ids minted by this module", () => {
    expect(isTmpTicketId(makeTmpTicketId())).toBe(true);
    expect(isTmpTicketId("tmp-anything")).toBe(true);
    expect(isTmpTicketId("uuid-real-1234")).toBe(false);
    expect(isTmpTicketId("")).toBe(false);
    expect(isTmpTicketId(null)).toBe(false);
    expect(isTmpTicketId(undefined)).toBe(false);
  });

  it("buildTmpToRealMap returns empty when nothing is tmp", () => {
    const pre = [
      { id: "real-1", name: "GA", sort_order: 0 },
      { id: "real-2", name: "VIP", sort_order: 1 },
    ];
    const post = [
      { id: "real-1", name: "GA", sort_order: 0 },
      { id: "real-2", name: "VIP", sort_order: 1 },
    ];
    expect(buildTmpToRealMap(pre, post).size).toBe(0);
  });

  it("buildTmpToRealMap maps tmp ids to real ids by (sort_order, name)", () => {
    const pre = [
      { id: "real-existing", name: "GA", sort_order: 0 },
      { id: "tmp-a", name: "Phase 1", sort_order: 1 },
      { id: "tmp-b", name: "Phase 2", sort_order: 2 },
    ];
    const post = [
      { id: "real-existing", name: "GA", sort_order: 0 },
      { id: "real-new-1", name: "Phase 1", sort_order: 1 },
      { id: "real-new-2", name: "Phase 2", sort_order: 2 },
    ];
    const map = buildTmpToRealMap(pre, post);
    expect(map.size).toBe(2);
    expect(map.get("tmp-a")).toBe("real-new-1");
    expect(map.get("tmp-b")).toBe("real-new-2");
  });

  it("buildTmpToRealMap survives reorderings within the same save", () => {
    // Server reordered the new tickets but kept names + sort_order paired.
    const pre = [
      { id: "tmp-a", name: "Phase 1", sort_order: 0 },
      { id: "tmp-b", name: "Phase 2", sort_order: 1 },
    ];
    const post = [
      { id: "real-2", name: "Phase 2", sort_order: 1 },
      { id: "real-1", name: "Phase 1", sort_order: 0 },
    ];
    const map = buildTmpToRealMap(pre, post);
    expect(map.get("tmp-a")).toBe("real-1");
    expect(map.get("tmp-b")).toBe("real-2");
  });

  it("buildTmpToRealMap does NOT match a tmp id whose pair is missing", () => {
    const pre = [{ id: "tmp-a", name: "Lost", sort_order: 0 }];
    const post = [{ id: "real-x", name: "Different", sort_order: 0 }];
    const map = buildTmpToRealMap(pre, post);
    expect(map.size).toBe(0);
  });

  it("translateTmpIdsInMap rewrites keys, leaves real ids alone", () => {
    const tmpToReal = new Map([
      ["tmp-a", "real-a"],
      ["tmp-b", "real-b"],
    ]);
    const input: Record<string, string> = {
      "tmp-a": "Group A",
      "tmp-b": "Group B",
      "real-existing": "Group X",
    };
    const out = translateTmpIdsInMap(input, tmpToReal);
    expect(out).toEqual({
      "real-a": "Group A",
      "real-b": "Group B",
      "real-existing": "Group X",
    });
  });

  it("translateTmpIdsInMap is a no-op when the translation map is empty", () => {
    const input = { foo: 1, bar: 2 };
    expect(translateTmpIdsInMap(input, new Map())).toBe(input);
  });
});
