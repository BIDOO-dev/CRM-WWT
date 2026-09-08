import { describe, expect, it } from "vitest";
import { classifyActionError, validationFailure } from "@/lib/action-errors";

describe("CRM action error handling", () => {
  it.each([
    [{ code: "42501", message: "row-level security policy" }, "permission_denied"],
    [{ code: "23505", message: "duplicate key" }, "constraint_error"],
    [{ code: "PGRST116", message: "zero rows" }, "not_found"],
    [{ code: "22P02", message: "invalid input syntax" }, "validation_error"],
    [new TypeError("fetch failed"), "network_error"],
    [{ message: "unknown database response" }, "unexpected_server_error"],
  ] as const)("classifies %o as %s", (error, expected) => {
    expect(classifyActionError(error)).toBe(expected);
  });

  it("returns a client-safe validation result", () => {
    expect(validationFailure("Check the phone number.")).toEqual({
      ok: false,
      kind: "validation_error",
      message: "Check the phone number.",
    });
  });
});
