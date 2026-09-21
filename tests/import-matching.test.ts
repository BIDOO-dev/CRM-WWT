import { describe, expect, it } from "vitest";
import { classifyImportRows, countUniqueImportContacts } from "@/lib/imports/matching";

describe("historical lead contact matching and duplicate classification", () => {
  const rows = [
    { fingerprint: "lead-a", phone_normalized: "+96170111111", source_row: 2 },
    { fingerprint: "lead-b", phone_normalized: "+96170111111", source_row: 3 },
    { fingerprint: "lead-b", phone_normalized: "+96170111111", source_row: 4 },
    { fingerprint: "lead-c", phone_normalized: "+96171222222", source_row: 5 },
    { fingerprint: "invalid", phone_normalized: null, source_row: 6 },
  ];

  it("reuses a normalized phone as one contact while preserving separate lead requests", () => {
    expect(countUniqueImportContacts(rows)).toBe(2);
    const classified = classifyImportRows(rows, new Set(["+96170111111"]), new Set<string>());
    expect(classified.slice(0, 3).every((row) => row.existing_contact)).toBe(true);
    expect(classified[0].duplicate).toBe(false);
    expect(classified[1].duplicate).toBe(false);
    expect(classified[2].duplicate).toBe(true);
  });

  it("blocks fingerprints already imported by an earlier batch", () => {
    const classified = classifyImportRows(rows, new Set<string>(), new Set(["lead-c"]));
    expect(classified[3]).toMatchObject({ duplicate: true, previously_imported: true });
  });
});
