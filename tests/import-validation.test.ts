import { describe, expect, it } from "vitest";
import { normalizeImportedPhone } from "@/lib/imports/phone";

describe("historical lead import phone normalization", () => {
  it.each([
    ["70 123 456", "+96170123456"],
    ["03 123 456", "+9613123456"],
    ["+961 71 234 567", "+96171234567"],
    ["00961 76 123 456", "+96176123456"],
  ])("normalizes Lebanese number %s", (input, expected) => {
    expect(normalizeImportedPhone(input).normalized).toBe(expected);
  });

  it("keeps the first number and warns when a spreadsheet cell contains several", () => {
    const result = normalizeImportedPhone("70 123 456 / 71 234 567");
    expect(result.normalized).toBe("+96170123456");
    expect(result.warning).toContain("Multiple phone numbers");
  });

  it.each(["", "12", "not a phone"])("holds invalid value %s for manual review", (input) => {
    expect(normalizeImportedPhone(input).normalized).toBeNull();
  });
});
