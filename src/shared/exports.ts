import Papa from 'papaparse';
import { FIELD_KEYS, FIELD_LABELS, type JobRecord } from './schema';
import { evaluateRecord } from './rules';

export const CSV_HEADERS = ['source_mode', 'review_status', 'required_checks_satisfied', 'required_checks_total', ...FIELD_KEYS, 'warnings'] as const;
export const modeLabel = (record: JobRecord): string => record.sourceMode === 'example' ? 'Example mode — prepared sample data; no live AI call.' : 'Live AI extraction';
export const reviewLabel = (record: JobRecord): string => record.reviewed ? 'Human review acknowledged (not a booking, signature, or work approval)' : 'Unreviewed draft — review before real-world use';
export function exportWarnings(record: JobRecord): string[] {
  const result = evaluateRecord(record);
  return [...new Set([
    ...(!record.reviewed ? ['UNREVIEWED DRAFT: review this record before real-world use.'] : []),
    ...(record.sourceMode === 'example' ? ['FICTIONAL EXAMPLE: prepared sample data; no live AI call.'] : []),
    ...result.issues.filter((issue) => issue.severity !== 'recommended').map((issue) => issue.message),
  ])];
}

/** Prefix a literal apostrophe when a value starts with a formula character after any
 * whitespace/control/format marks, or starts with tab/newline. This deliberately includes
 * international + phone numbers. CSV quoting alone is not a formula-injection defense. */
export function spreadsheetSafe(value: string): string {
  if (/^[\s\p{Cc}\p{Cf}]*[=+\-@]/u.test(value) || /^[\t\r\n]/.test(value)) return `'${value}`;
  return value;
}
export function exportCsv(record: JobRecord): string {
  const rules = evaluateRecord(record);
  const values: string[] = [record.sourceMode, reviewLabel(record), String(rules.satisfied), String(rules.total), ...FIELD_KEYS.map((key) => record.fields[key].value ?? ''), exportWarnings(record).join('\n')];
  return Papa.unparse({ fields: [...CSV_HEADERS], data: [values.map(spreadsheetSafe)] }, { quotes: true, newline: '\r\n' });
}
export function exportJson(record: JobRecord): string {
  const result = evaluateRecord(record);
  return JSON.stringify({
    schemaVersion: 1,
    sourceMode: record.sourceMode,
    modeDescription: modeLabel(record),
    reviewed: record.reviewed,
    reviewStatus: reviewLabel(record),
    multipleRequests: record.multipleRequests,
    requiredChecks: { satisfied: result.satisfied, total: result.total },
    fields: record.fields,
    warnings: exportWarnings(record),
    // Short supporting quotes stay with fields. Full raw input is intentionally excluded.
  }, null, 2);
}
export function formatJobCard(record: JobRecord): string {
  const result = evaluateRecord(record);
  const warnings = exportWarnings(record);
  return [
    'JOB INTAKE CLEANER · CYBER PIRATE LABS', modeLabel(record), reviewLabel(record),
    `${result.satisfied} of ${result.total} required checks satisfied`, '',
    ...FIELD_KEYS.map((key) => `${FIELD_LABELS[key]}: ${record.fields[key].value ?? ''}`),
    ...(warnings.length ? ['', 'WARNINGS', ...warnings.map((warning) => `• ${warning}`)] : []),
    '', 'Human acknowledgment is not an identity verification, booking, signature, or approval of the work.',
  ].join('\n');
}
