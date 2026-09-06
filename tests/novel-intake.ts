import { createEmptyFields, validateModelOutput, type Extraction, type FieldKey } from '../src/shared/schema';

/** Test-owned synthetic requests, distinct from the portfolio's prepared scenarios.
 * These expected outputs stand in for a provider only in deterministic tests. */
export function novelIntake({ name = 'Emery Solis', service = 'Repaint the garden shed door', phone = '+1 (202) 555-0168', address = '', timing = 'Friday afternoon' } = {}) {
  const message = `My name is ${name}. ${service}. Call ${phone}.${address ? ` The service address is ${address}.` : ''} ${timing} would work for me. Please contact me before arriving.`;
  const fields = createEmptyFields() as Extraction['fields'];
  const extracted = (key: FieldKey, value: string, quote = value) => { fields[key] = { value, status: 'extracted', evidence: [quote], issues: [] }; };
  extracted('contactName', name);
  extracted('phone', phone);
  extracted('contactPreference', 'Phone call', `Call ${phone}`);
  extracted('requestedServices', service);
  extracted('summary', service);
  extracted('requestedTiming', timing);
  extracted('accessNotes', 'Contact before arriving.', 'Please contact me before arriving.');
  if (address) extracted('addressRaw', address);
  const extraction: Extraction = { fields, warnings: [], multipleRequests: false };
  return { message, extraction, record: validateModelOutput(extraction, message) };
}
