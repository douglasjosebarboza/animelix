// Pure form-value parsers. MUST stay free of "use server": Next.js requires
// every export of a "use server" module to be an async server action, so
// these sync helpers live here and are imported by server actions and tests.
export function parsePositiveInt(value: FormDataEntryValue | null): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function parseTotal(value: FormDataEntryValue | null): number | null {
  return parsePositiveInt(value);
}
