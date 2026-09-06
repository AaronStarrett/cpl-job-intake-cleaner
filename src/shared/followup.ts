import { FIELD_LABELS, type JobRecord } from './schema';
import { evaluateRecord } from './rules';

export interface FollowUpDraft { subject: string; body: string; shortMessage: string }
export function generateFollowUp(record: JobRecord): FollowUpDraft {
  if (record.multipleRequests) {
    const body = 'Thanks for reaching out. This conversation appears to include separate customers or properties. Could you send each request separately, with the contact details, service address, and work requested for that property? This will help keep the requests organized.';
    return { subject: 'Please separate the job requests', body, shortMessage: body };
  }
  const result = evaluateRecord(record);
  const questions: string[] = [];
  const missing = new Set(result.checks.filter((check) => !check.satisfied).map((check) => check.id));
  if (missing.has('contact')) questions.push('What name should we use for the person making this request?');
  if (missing.has('contact-method')) questions.push('What phone number or email address should we use to contact you?');
  if (missing.has('address')) questions.push('Could you confirm the service street/site address, city or locality, and state/region or postal code?');
  if (missing.has('work')) questions.push('Could you describe the work you would like us to review?');
  if (result.issues.some((issue) => issue.id === 'timing')) questions.push('Do you have a preferred date or timing for the work?');
  else if (result.issues.some((issue) => issue.id === 'date-confirmation')) questions.push(`Could you confirm the calendar date you mean by “${record.fields.requestedTiming.value}”?`);

  const covered = new Set(['contactName', 'phone', 'email', 'addressRaw', 'addressStreet', 'addressCity', 'addressRegion', 'addressPostalCode', 'requestedServices', 'summary', 'requestedTiming', 'requestedDate', 'urgency']);
  for (const issue of result.issues) {
    if (issue.severity === 'review' && issue.field && !covered.has(issue.field)) {
      questions.push(`Could you confirm the ${FIELD_LABELS[issue.field].toLowerCase()}?`);
      covered.add(issue.field);
    }
  }
  if (!missing.has('contact-method') && result.issues.some((issue) => issue.id === 'preferred-email')) questions.push('You mentioned a preference for email. What email address would you like us to use?');
  if (!missing.has('contact-method') && result.issues.some((issue) => issue.id === 'preferred-phone')) questions.push('You mentioned a preference for phone or text. What number would you like us to use?');
  const name = record.fields.contactName.status !== 'needs-review' ? record.fields.contactName.value : null;
  const greeting = name ? `Hi ${name},` : 'Hello,';
  const intro = missing.size === 0
    ? 'Thanks for reaching out. The required intake details are present.'
    : 'Thanks for reaching out. Before we can review the request, could you help confirm a few details?';
  const body = `${greeting}\n\n${intro}${questions.length ? `\n\n${questions.map((question) => `• ${question}`).join('\n')}` : '\n\nThere are no additional intake questions in this draft. The request still needs human review before real-world use.'}\n\nThank you.`;
  return { subject: 'A few details for your job request', body, shortMessage: questions.length ? `Thanks for reaching out. ${questions.join(' ')}` : 'Thanks for reaching out. The required intake details are present; there are no additional intake questions in this draft. The request still needs human review.' };
}

/** UI calls again with replaceConfirmed only after a visitor approves replacing their wording. */
export function refreshFollowUp(record: JobRecord, current: FollowUpDraft, manuallyEdited: boolean, replaceConfirmed = false): { draft: FollowUpDraft; requiresConfirmation: boolean } {
  if (manuallyEdited && !replaceConfirmed) return { draft: current, requiresConfirmation: true };
  return { draft: generateFollowUp(record), requiresConfirmation: false };
}
