import { EXAMPLES } from './fixtures';
import { type FieldKey, type JobRecord } from './schema';

/** The caller retains the original extraction snapshot; returned edits never mutate it. */
export function updateField(record: JobRecord, key: FieldKey, value: string | null): JobRecord {
  const normalized = value === null || value.trim() === '' ? null : value;
  if (record.fields[key].value === normalized && record.fields[key].status === 'user-entered') return record;
  const fields = { ...record.fields, [key]: { value: normalized, status: normalized === null ? 'missing' as const : 'user-entered' as const, evidence: [...record.fields[key].evidence], issues: [] } };
  const addressComponents: FieldKey[] = ['addressStreet', 'addressCity', 'addressRegion', 'addressPostalCode'];
  if (key === 'addressRaw' && record.fields[key].value !== normalized) {
    for (const component of addressComponents) fields[component] = { value: null, status: 'missing', evidence: [], issues: [] };
  } else if (addressComponents.includes(key) && record.fields[key].value !== normalized) {
    fields.addressRaw = { value: null, status: 'missing', evidence: [], issues: [] };
  }
  return {
    ...record, reviewed: false,
    fields,
  };
}
export function setReview(record: JobRecord, reviewed: boolean): JobRecord { return { ...record, reviewed }; }
export function fixtureMatches(id: string, source: string): boolean { return EXAMPLES.some((example) => example.id === id && example.source === source); }
export function sourceChanged(previous: string, next: string): boolean { return previous !== next; }

export interface IntakeState { source: string; record: JobRecord | null; original: JobRecord | null; draft: { subject: string; body: string } | null; reviewed: boolean }
/** Any source change clears the dependent result, its original snapshot, follow-up, and acknowledgment. */
export function changeSource<T extends IntakeState>(state: T, source: string): T {
  if (!sourceChanged(state.source, source)) return state;
  return { ...state, source, record: null, original: null, draft: null, reviewed: false };
}
