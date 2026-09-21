export type PhoneResult = { normalized: string | null; warning?: string };

function numberText(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value).toString();
  return String(value ?? "").trim();
}

export function normalizeImportedPhone(value: string | number | null | undefined): PhoneResult {
  const raw = numberText(value);
  if (!raw) return { normalized: null, warning: "Missing phone number" };
  const candidates = raw.split(/\s*(?:\/|;|,|\bor\b|\n)\s*/i).filter(Boolean);
  let digits = candidates[0].replace(/[^0-9]/g, "");
  if (!digits) return { normalized: null, warning: "Invalid phone number" };
  if (digits.startsWith("00")) return { normalized: digits.length >= 10 && digits.length <= 17 ? `+${digits.slice(2)}` : null, warning: candidates.length > 1 ? "Multiple phone numbers; first number selected" : undefined };
  if (digits.startsWith("961")) return { normalized: digits.length >= 10 && digits.length <= 11 ? `+${digits}` : null, warning: candidates.length > 1 ? "Multiple phone numbers; first number selected" : undefined };
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 7 || digits.length === 8) return { normalized: `+961${digits}`, warning: candidates.length > 1 ? "Multiple phone numbers; first number selected" : undefined };
  if (digits.length >= 8 && digits.length <= 15) return { normalized: `+${digits}`, warning: candidates.length > 1 ? "Multiple phone numbers; first number selected" : undefined };
  return { normalized: null, warning: "Invalid phone number" };
}
