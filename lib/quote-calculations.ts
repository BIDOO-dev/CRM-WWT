export type QuoteLineInput = {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount_percent: number;
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateQuoteTotals(items: QuoteLineInput[], discountAmount = 0, taxRate = 0) {
  const subtotal = money(items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0));
  const lineDiscountTotal = money(items.reduce((sum, item) => sum + item.quantity * item.unit_price * item.discount_percent / 100, 0));
  const taxableAmount = Math.max(0, subtotal - lineDiscountTotal - discountAmount);
  const taxTotal = money(taxableAmount * taxRate / 100);
  return {
    subtotal,
    lineDiscountTotal,
    taxableAmount: money(taxableAmount),
    taxTotal,
    total: money(taxableAmount + taxTotal),
  };
}

export function summarizePipelineValue(rows: Array<{ currency: string; total: number }>) {
  const totals = new Map<string, number>();
  rows.forEach((row) => {
    const currency = row.currency.trim().toUpperCase() || "N/A";
    totals.set(currency, money((totals.get(currency) ?? 0) + Number(row.total)));
  });
  return [...totals.entries()].sort(([left], [right]) => left.localeCompare(right));
}

export function formatPipelineValue(rows: Array<{ currency: string; total: number }>) {
  const totals = summarizePipelineValue(rows);
  if (!totals.length) return "—";
  return totals.map(([currency, total]) => `${currency} ${total.toLocaleString("en-US", { maximumFractionDigits: 0 })}`).join(" · ");
}
