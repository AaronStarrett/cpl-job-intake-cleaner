import { FIELD_KEYS, FIELD_LABELS, type Field, type FieldKey, type JobRecord } from './schema';
import { RULE_CONFIG } from './rule-config';

export interface RuleIssue { id: string; severity: 'required' | 'recommended' | 'review'; message: string; field?: FieldKey }
export interface RequiredCheck { id: string; label: string; satisfied: boolean; detail: string }
export interface Evaluation { checks: RequiredCheck[]; satisfied: number; total: number; issues: RuleIssue[]; needsReview: boolean; readyForReview: boolean }

export const isUsableField = (field: Field): boolean => Boolean(field.value?.trim()) && field.status !== 'needs-review' && field.issues.length === 0;
export function isUsablePhone(value: string | null): boolean {
  if (!value || !/^[+()\d\s.-]+(?:\s*(?:ext\.?|x)\s*\d{1,6})?$/i.test(value.trim())) return false;
  const digits = value.replace(/\s*(?:ext\.?|x)\s*\d{1,6}$/i, '').replace(/\D/g, '');
  return digits.length >= RULE_CONFIG.phone.minDigits && digits.length <= RULE_CONFIG.phone.maxDigits;
}
export function isUsableEmail(value: string | null): boolean {
  return Boolean(value && /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(value) && value.length <= 254);
}
export function isSufficientRawAddress(value: string | null): boolean {
  if (!value) return false;
  const parts = value.split(',').map((part) => part.trim());
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) return false;
  const [street, locality, regionPostal] = parts;
  const hasSite = /^(?:\d+[\w-]*\s+\S|(?:site|building|lot|farm|campus)\s+\S)/i.test(street);
  const hasLocality = /\p{L}{2}/u.test(locality);
  const hasRegionPostal = /^(?:[A-Za-z]{2}(?:\s+\d{5}(?:-\d{4})?)?|\d{5}(?:-\d{4})?)$/.test(regionPostal);
  return hasSite && hasLocality && hasRegionPostal;
}
export function evaluateRecord(record: JobRecord): Evaluation {
  const f = record.fields;
  const phone = isUsableField(f.phone) && isUsablePhone(f.phone.value);
  const email = isUsableField(f.email) && isUsableEmail(f.email.value);
  const street = isUsableField(f.addressStreet) && /\d|\b(site|building|lot|unit|suite|farm|campus)\b/i.test(f.addressStreet.value ?? '');
  const componentsComplete = street && isUsableField(f.addressCity) && (isUsableField(f.addressRegion) || isUsableField(f.addressPostalCode));
  const addressConflict = ['addressRaw', 'addressStreet', 'addressCity', 'addressRegion', 'addressPostalCode'].some((key) => f[key as FieldKey].status === 'needs-review');
  const address = !addressConflict && ((isUsableField(f.addressRaw) && isSufficientRawAddress(f.addressRaw.value)) || componentsComplete);
  const work = isUsableField(f.requestedServices) || isUsableField(f.summary);
  const checks: RequiredCheck[] = [
    { id: 'contact', label: 'Contact name', satisfied: isUsableField(f.contactName), detail: 'Name of the person making this request.' },
    { id: 'contact-method', label: 'Usable phone or email', satisfied: phone || email, detail: 'One basic-format contact method is enough; reachability is not verified.' },
    { id: 'address', label: 'Service address', satisfied: address, detail: RULE_CONFIG.addressPolicy },
    { id: 'work', label: 'Requested work', satisfied: work, detail: 'A usable description of the requested services or work.' },
  ];
  const issues: RuleIssue[] = checks.filter((check) => !check.satisfied).map((check) => ({ id: check.id, severity: 'required', message: `Confirm ${check.label.toLowerCase()}.` }));
  for (const key of FIELD_KEYS) {
    const field = f[key];
    if (field.status === 'needs-review' || field.issues.length) issues.push({ id: `review-${key}`, severity: 'review', field: key, message: `${FIELD_LABELS[key]}: ${field.issues.join(' ') || 'Confirm or correct this value.'}` });
  }
  if (f.phone.value && !isUsablePhone(f.phone.value)) issues.push({ id: 'phone-format', severity: 'review', field: 'phone', message: 'The phone format needs correction. No reachability check was performed.' });
  if (f.email.value && !isUsableEmail(f.email.value)) issues.push({ id: 'email-format', severity: 'review', field: 'email', message: 'The email format needs correction. No delivery check was performed.' });
  if (!f.requestedTiming.value && !f.requestedDate.value) issues.push({ id: 'timing', severity: 'recommended', field: 'requestedTiming', message: 'Ask for the customer’s preferred timing, if useful.' });
  if (f.requestedTiming.value && !f.requestedDate.value) issues.push({ id: 'date-confirmation', severity: 'recommended', field: 'requestedDate', message: 'Confirm the calendar date if scheduling depends on this timing.' });
  if (f.contactPreference.value && /\b(email|e-mail)\b/i.test(f.contactPreference.value) && !email) issues.push({ id: 'preferred-email', severity: 'recommended', field: 'email', message: 'The customer prefers email; confirm an email address if you plan to use it.' });
  if (f.contactPreference.value && /\b(text|sms|phone|call)\b/i.test(f.contactPreference.value) && !phone) issues.push({ id: 'preferred-phone', severity: 'recommended', field: 'phone', message: 'The stated contact preference needs a usable phone number.' });
  if (f.urgency.value && /urgent|emergency|asap|smell|gas|sparking|smoke|flood|burning/i.test(f.urgency.value)) issues.push({ id: 'urgency-attention', severity: 'review', field: 'urgency', message: 'Review the customer’s urgency wording. This tool does not diagnose, assess safety, or promise emergency service.' });
  if (record.multipleRequests) issues.push({ id: 'split-requests', severity: 'review', message: 'Separate jobs, customers, or properties appear in this source. Split and review them individually before using this draft.' });
  record.warnings.forEach((message, index) => issues.push({ id: `warning-${index}`, severity: 'review', message }));
  const satisfied = checks.filter((check) => check.satisfied).length;
  const unresolved = issues.some((issue) => issue.severity === 'review');
  return { checks, satisfied, total: checks.length, issues, needsReview: !record.reviewed || unresolved, readyForReview: satisfied === checks.length && !unresolved };
}
