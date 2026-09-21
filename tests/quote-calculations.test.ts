import { describe, expect, it } from "vitest";
import { calculateQuoteTotals, formatPipelineValue, summarizePipelineValue } from "@/lib/quote-calculations";

describe("quotation calculations", () => {
  it("applies line discounts, an additional discount, then configurable tax", () => {
    expect(calculateQuoteTotals([
      { description: "Treatment unit", quantity: 2, unit: "unit", unit_price: 1000, discount_percent: 10 },
      { description: "Installation", quantity: 1, unit: "service", unit_price: 500, discount_percent: 0 },
    ], 100, 11)).toEqual({
      subtotal: 2500,
      lineDiscountTotal: 200,
      taxableAmount: 2200,
      taxTotal: 242,
      total: 2442,
    });
  });

  it("never creates a negative taxable total", () => {
    expect(calculateQuoteTotals([
      { description: "Assessment", quantity: 1, unit: "service", unit_price: 100, discount_percent: 0 },
    ], 200, 20).total).toBe(0);
  });

  it("keeps pipeline currencies separate instead of presenting a false converted total", () => {
    const rows = [{ currency: "usd", total: 1000 }, { currency: "USD", total: 250 }, { currency: "EUR", total: 500 }];
    expect(summarizePipelineValue(rows)).toEqual([["EUR", 500], ["USD", 1250]]);
    expect(formatPipelineValue(rows)).toBe("EUR 500 · USD 1,250");
    expect(formatPipelineValue([])).toBe("—");
  });
});
