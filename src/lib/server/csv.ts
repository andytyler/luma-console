export function csvEscape(value: unknown) {
  const raw = value === null || value === undefined ? '' : String(value);
  const text = /^[=+\-@\t\r]/.test(raw.trimStart()) ? `'${raw}` : raw;
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function toCsv(rows: unknown[][]) {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}
