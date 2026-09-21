export type ImportMatchableRow = {
  fingerprint: string;
  phone_normalized: string | null;
};

export function classifyImportRows<T extends ImportMatchableRow>(
  rows: T[],
  existingPhones: ReadonlySet<string>,
  importedFingerprints: ReadonlySet<string>,
) {
  const seen = new Set<string>();
  return rows.map((row) => {
    const previouslyImported = importedFingerprints.has(row.fingerprint);
    const duplicate = seen.has(row.fingerprint) || previouslyImported;
    seen.add(row.fingerprint);
    return {
      ...row,
      existing_contact: Boolean(row.phone_normalized && existingPhones.has(row.phone_normalized)),
      duplicate,
      previously_imported: previouslyImported,
    };
  });
}

export function countUniqueImportContacts(rows: ImportMatchableRow[]) {
  return new Set(rows.map((row) => row.phone_normalized).filter((value): value is string => Boolean(value))).size;
}
