import { z } from 'zod';

export const SOURCE_LABELS = ['pasted email', 'phone notes', 'website message', 'other'] as const;
export const TRADE_HINTS = ['Auto-detect', 'Electrical', 'Roofing', 'Plumbing', 'HVAC', 'Handyman', 'Remodeling', 'Painting', 'Landscaping', 'Other'] as const;

export const FIELD_LABELS = {
  contactName: 'Contact name', company: 'Company', phone: 'Phone', email: 'Email',
  contactPreference: 'Preferred contact method', addressRaw: 'Service address',
  addressStreet: 'Street address', addressCity: 'City / locality', addressRegion: 'State / region',
  addressPostalCode: 'Postal code', propertyType: 'Property / site type',
  suggestedTrade: 'Suggested trade', requestedServices: 'Requested services', summary: 'Work summary',
  requestedTiming: 'Timing in customer’s words', requestedDate: 'Exact requested date',
  urgency: 'Customer-stated urgency', accessNotes: 'Access / preparation notes', budget: 'Stated budget',
  dimensions: 'Stated dimensions',
} as const;
export type FieldKey = keyof typeof FIELD_LABELS;
export const FIELD_KEYS = Object.keys(FIELD_LABELS) as FieldKey[];

const baseField = {
  value: z.string().max(2000).nullable(),
  evidence: z.array(z.string().min(1).max(1000)).max(12),
  issues: z.array(z.string().min(1).max(500)).max(12),
};
export const modelFieldSchema = z.object({ ...baseField, status: z.enum(['extracted', 'missing', 'needs-review']) }).strict();
export const fieldSchema = z.object({ ...baseField, status: z.enum(['extracted', 'missing', 'needs-review', 'user-entered']) }).strict();
export type Field = z.infer<typeof fieldSchema>;

function makeShape<T extends z.ZodType>(field: T): { [K in FieldKey]: T } {
  return Object.fromEntries(FIELD_KEYS.map((key) => [key, field])) as { [K in FieldKey]: T };
}
export const fieldsSchema = z.object(makeShape(fieldSchema)).strict();
export const modelExtractionSchema = z.object({
  fields: z.object(makeShape(modelFieldSchema)).strict(),
  warnings: z.array(z.string().min(1).max(500)).max(24),
  multipleRequests: z.boolean(),
}).strict();
export const jobRecordSchema = z.object({
  fields: fieldsSchema,
  warnings: z.array(z.string()).max(64),
  multipleRequests: z.boolean(),
  sourceMode: z.enum(['example', 'live']),
  reviewed: z.boolean(),
  fixtureId: z.string().nullable(),
}).strict();
export type IntakeFields = z.infer<typeof fieldsSchema>;
export type Extraction = z.infer<typeof modelExtractionSchema>;
export type JobRecord = z.infer<typeof jobRecordSchema>;
export const MODEL_JSON_SCHEMA = z.toJSONSchema(modelExtractionSchema, { target: 'draft-7' });

export function createEmptyFields(): IntakeFields {
  return Object.fromEntries(FIELD_KEYS.map((key) => [key, {
    value: null, status: 'missing', evidence: [], issues: [],
  }])) as unknown as IntakeFields;
}

function addIssue(field: Field, issue: string): void {
  field.status = 'needs-review';
  if (!field.issues.includes(issue)) field.issues.push(issue);
}

const DIRECT_FACT_FIELDS = new Set<FieldKey>(['contactName', 'company', 'phone', 'email', 'addressRaw', 'addressStreet', 'addressCity', 'addressRegion', 'addressPostalCode', 'propertyType', 'requestedTiming', 'budget', 'dimensions']);
const normalizedFact = (value: string): string => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}@]+/gu, ' ').trim();

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
function calendarDate(year: number, month: number, day: number): string | null {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() + 1 !== month || candidate.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Only full ISO or month-name dates with an explicit year establish a calendar date.
 * Numeric slash dates are deliberately unresolved because date ordering varies by locale. */
export function unambiguousDates(text: string): string[] {
  const values = new Set<string>();
  for (const match of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    const value = calendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
    if (value) values.add(value);
  }
  const monthPattern = MONTHS.join('|');
  const named = new RegExp(`\\b(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(\\d{4})\\b`, 'gi');
  for (const match of text.matchAll(named)) {
    const value = calendarDate(Number(match[3]), MONTHS.indexOf(match[1].toLowerCase()) + 1, Number(match[2]));
    if (value) values.add(value);
  }
  const dayFirst = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthPattern})[,]?\\s+(\\d{4})\\b`, 'gi');
  for (const match of text.matchAll(dayFirst)) {
    const value = calendarDate(Number(match[3]), MONTHS.indexOf(match[2].toLowerCase()) + 1, Number(match[1]));
    if (value) values.add(value);
  }
  return [...values];
}

/** Trust boundaries: strict model schema, source-matching evidence, and unresolved dates.
 * Supporting quotes prove source presence only; they never certify the underlying facts. */
export function validateExtraction(raw: unknown, sourceText: string, sourceMode: 'example' | 'live' = 'live'): JobRecord {
  const parsed = modelExtractionSchema.parse(raw);
  const record: JobRecord = { ...parsed, sourceMode, reviewed: false, fixtureId: null };
  for (const key of FIELD_KEYS) {
    const field = record.fields[key];
    if (field.value !== null && field.value.trim() === '') field.value = null;
    const invalidEvidence = field.evidence.filter((quote) => !sourceText.includes(quote));
    if (invalidEvidence.length) {
      // Never show a fabricated quote as a source passage. Preserve the value for correction.
      field.evidence = field.evidence.filter((quote) => sourceText.includes(quote));
      addIssue(field, 'Some supplied evidence did not occur verbatim in the source and was removed.');
    }
    if (field.value !== null && field.evidence.length === 0) addIssue(field, 'No matching source evidence supports this value. Confirm or correct it.');
    if (field.value !== null && field.evidence.length > 0 && DIRECT_FACT_FIELDS.has(key)) {
      const expected = normalizedFact(field.value);
      const supported = field.evidence.some((quote) => normalizedFact(quote).includes(expected));
      if (!supported) addIssue(field, 'The value is not directly supported by its quoted wording. Confirm or correct it.');
    }
    if (field.value === null && field.status === 'extracted') field.status = 'missing';
    if (field.value !== null && field.status === 'missing') addIssue(field, 'The extracted status conflicts with the supplied value.');
    if (field.issues.length > 0 && field.status !== 'needs-review') field.status = 'needs-review';
  }
  const date = record.fields.requestedDate;
  if (date.value !== null && !unambiguousDates(date.evidence.join('\n')).includes(date.value)) {
    date.value = null;
    addIssue(date, 'The exact date is unresolved. Confirm a full calendar date; relative or locale-ambiguous dates are not converted.');
  }
  const timing = record.fields.requestedTiming;
  if (date.value === null && timing.value && /\b(today|tomorrow|tonight|next|this|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(timing.value)) {
    addIssue(timing, 'The reference date is unknown. Confirm the intended calendar date.');
  }
  if (/\bcustomer\s*(?:1|one)\b/i.test(sourceText) && /\bcustomer\s*(?:2|two)\b/i.test(sourceText)) record.multipleRequests = true;
  if (record.multipleRequests && !record.warnings.some((warning) => /separat|split/i.test(warning))) {
    record.warnings.push('This source contains separate jobs, customers, or properties. Split it into individual requests and review each one.');
  }
  return record;
}
export function validateModelOutput(raw: unknown, sourceText: string): JobRecord {
  return validateExtraction(raw, sourceText, 'live');
}
