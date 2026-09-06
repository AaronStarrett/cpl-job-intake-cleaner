import { createEmptyFields, validateExtraction, type Extraction, type FieldKey, type JobRecord, type TRADE_HINTS } from './schema';

export interface Example {
  id: string; title: string;
  sourceLabel: 'pasted email' | 'phone notes' | 'website message' | 'other';
  tradeHint: typeof TRADE_HINTS[number]; source: string; extraction: Extraction;
}
type FixtureValues = Partial<Record<FieldKey, [value: string, ...evidence: string[]]>>;
function prepared(values: FixtureValues, review: Partial<Record<FieldKey, { value?: string; evidence: string[]; issues: string[] }>> = {}, warnings: string[] = [], multipleRequests = false): Extraction {
  const fields = createEmptyFields() as Extraction['fields'];
  for (const [key, [value, ...evidence]] of Object.entries(values) as [FieldKey, [string, ...string[]]][]) {
    fields[key] = { value, status: 'extracted', evidence, issues: [] };
  }
  for (const [key, item] of Object.entries(review) as [FieldKey, { value?: string; evidence: string[]; issues: string[] }][]) {
    fields[key] = { value: item.value ?? null, status: 'needs-review', evidence: item.evidence, issues: item.issues };
  }
  return { fields, warnings, multipleRequests };
}

/** These sources and expected extractions are authored, fictional fixtures. They make no AI calls.
 * Prepared-fixture review is not a visitor's human review acknowledgment. */
export const EXAMPLES: Example[] = [
  {
    id: 'electrical', title: 'Electrical · missing address', sourceLabel: 'website message', tradeHint: 'Electrical',
    source: 'Hi, I’m Casey Morgan. Can someone replace two ceiling fans and examine the outdoor outlet at my house? Friday would be ideal. Call me at +1 (202) 555-0104. I can put the new fans by the front door.',
    extraction: prepared({
      contactName: ['Casey Morgan', 'I’m Casey Morgan'], phone: ['+1 (202) 555-0104', '+1 (202) 555-0104'],
      contactPreference: ['Phone call', 'Call me'], propertyType: ['House', 'my house'],
      suggestedTrade: ['Electrical', 'replace two ceiling fans and examine the outdoor outlet'],
      requestedServices: ['Replace two ceiling fans; examine the outdoor outlet.', 'replace two ceiling fans and examine the outdoor outlet'],
      summary: ['Customer requests replacement of two ceiling fans and examination of an outdoor outlet.', 'replace two ceiling fans and examine the outdoor outlet'],
      accessNotes: ['New fans can be placed by the front door.', 'I can put the new fans by the front door'],
    }, { requestedTiming: { value: 'Friday would be ideal.', evidence: ['Friday would be ideal.'], issues: ['Friday has no reference date. Confirm the intended calendar date.'] } }),
  },
  {
    id: 'roofing', title: 'Roofing · complete details', sourceLabel: 'pasted email', tradeHint: 'Roofing',
    source: 'Hello, I’m Riley Chen with Example Orchard Studio. Please review the loose shingles along the rear roof edge at our studio, 42 Sample Lane, Exampleton, NY 10001. I’m requesting September 18, 2026. Email is best: riley.chen@example.com. The rear gate will be unlocked for a confirmed visit; please contact me before anyone arrives.',
    extraction: prepared({
      contactName: ['Riley Chen', 'I’m Riley Chen'], company: ['Example Orchard Studio', 'Example Orchard Studio'],
      email: ['riley.chen@example.com', 'riley.chen@example.com'], contactPreference: ['Email', 'Email is best'],
      addressRaw: ['42 Sample Lane, Exampleton, NY 10001', '42 Sample Lane, Exampleton, NY 10001'],
      addressStreet: ['42 Sample Lane', '42 Sample Lane'], addressCity: ['Exampleton', 'Exampleton'], addressRegion: ['NY', 'NY'], addressPostalCode: ['10001', '10001'],
      propertyType: ['Studio', 'our studio'], suggestedTrade: ['Roofing', 'loose shingles along the rear roof edge'],
      requestedServices: ['Review loose shingles along the rear roof edge.', 'review the loose shingles along the rear roof edge'],
      summary: ['Customer requests a review of loose shingles along the studio’s rear roof edge.', 'review the loose shingles along the rear roof edge at our studio'],
      requestedTiming: ['September 18, 2026', 'September 18, 2026'], requestedDate: ['2026-09-18', 'September 18, 2026'],
      accessNotes: ['Rear gate available for a confirmed visit. Contact the customer before arrival.', 'The rear gate will be unlocked for a confirmed visit; please contact me before anyone arrives.'],
    }),
  },
  {
    id: 'plumbing', title: 'Plumbing · conflicting addresses', sourceLabel: 'phone notes', tradeHint: 'Plumbing',
    source: 'Phone note: Devon Ellis, +1 (202) 555-0112. Kitchen tap keeps dripping. Devon first said the service address was 17 Example Court, Exampleton, NY 10001, then said “actually put 71 Example Court, Exampleton, NY 10001.” The call cut off before I could confirm which address is correct. Email: devon.ellis@example.com. No date agreed.',
    extraction: prepared({
      contactName: ['Devon Ellis', 'Devon Ellis'], phone: ['+1 (202) 555-0112', '+1 (202) 555-0112'], email: ['devon.ellis@example.com', 'devon.ellis@example.com'],
      suggestedTrade: ['Plumbing', 'Kitchen tap keeps dripping'], requestedServices: ['Review a dripping kitchen tap.', 'Kitchen tap keeps dripping'],
      summary: ['Customer reports a dripping kitchen tap. The service address needs confirmation.', 'Kitchen tap keeps dripping', 'The call cut off before I could confirm which address is correct.'],
    }, {
      addressRaw: { evidence: ['17 Example Court, Exampleton, NY 10001', '71 Example Court, Exampleton, NY 10001'], issues: ['Two service addresses were provided. Confirm the correct address before using this request.'] },
    }),
  },
  {
    id: 'hvac', title: 'HVAC · customer-stated urgency', sourceLabel: 'website message', tradeHint: 'HVAC',
    source: 'This is Jordan. URGENT — the heating unit stopped and there’s a burning smell. Need someone ASAP. It’s at our shop on Sample Road. You can reach me at jordan.service@example.com. I don’t have the unit details with me.',
    extraction: prepared({
      contactName: ['Jordan', 'This is Jordan'], email: ['jordan.service@example.com', 'jordan.service@example.com'],
      addressRaw: ['Our shop on Sample Road', 'our shop on Sample Road'], propertyType: ['Shop', 'our shop'],
      suggestedTrade: ['HVAC', 'the heating unit stopped'], requestedServices: ['Customer requests attention to a heating unit that stopped.', 'the heating unit stopped'],
      summary: ['Customer reports a stopped heating unit and a burning smell at a shop; precise service location is missing.', 'the heating unit stopped and there’s a burning smell', 'our shop on Sample Road'],
      requestedTiming: ['Need someone ASAP.', 'Need someone ASAP.'],
    }, {
      urgency: { value: 'URGENT — heating unit stopped; customer reports a burning smell.', evidence: ['URGENT — the heating unit stopped and there’s a burning smell.', 'Need someone ASAP.'], issues: ['Customer-reported urgency requires human attention. No diagnosis, safety assessment, or emergency-service commitment is made.'] },
    }),
  },
  {
    id: 'handyman', title: 'Handyman · several tasks, one property', sourceLabel: 'phone notes', tradeHint: 'Handyman',
    source: 'avery brooks here!! text only please +1 (202) 555-0137 — same house for all of this: 8 Fiction Way, Exampleton, NY 10001. fix loose cupboard handle... hang the hallway mirror (24 x 36 inches), and touch up paint by back door. after 3pm is best. dog will be in kitchen; use side entrance. budget up to $300, please discuss scope first.',
    extraction: prepared({
      contactName: ['Avery Brooks', 'avery brooks here'], phone: ['+1 (202) 555-0137', '+1 (202) 555-0137'], contactPreference: ['Text only', 'text only please'],
      addressRaw: ['8 Fiction Way, Exampleton, NY 10001', '8 Fiction Way, Exampleton, NY 10001'], addressStreet: ['8 Fiction Way', '8 Fiction Way'], addressCity: ['Exampleton', 'Exampleton'], addressRegion: ['NY', 'NY'], addressPostalCode: ['10001', '10001'], propertyType: ['House', 'same house for all of this'],
      suggestedTrade: ['Handyman', 'fix loose cupboard handle... hang the hallway mirror (24 x 36 inches), and touch up paint by back door'],
      requestedServices: ['Fix a loose cupboard handle; hang a hallway mirror; touch up paint by the back door.', 'fix loose cupboard handle... hang the hallway mirror (24 x 36 inches), and touch up paint by back door'],
      summary: ['Three small tasks at one house: cupboard handle, mirror hanging, and paint touch-up.', 'same house for all of this', 'fix loose cupboard handle... hang the hallway mirror (24 x 36 inches), and touch up paint by back door'],
      requestedTiming: ['after 3pm is best', 'after 3pm is best'], accessNotes: ['Dog in kitchen; use side entrance. Discuss scope first.', 'dog will be in kitchen; use side entrance', 'please discuss scope first'],
      budget: ['Up to $300', 'budget up to $300'], dimensions: ['Hallway mirror: 24 x 36 inches', 'hallway mirror (24 x 36 inches)'],
    }),
  },
  {
    id: 'two-properties', title: 'Mixed conversation · split required', sourceLabel: 'other', tradeHint: 'Auto-detect',
    source: 'Forwarded notes for two separate customers. Customer 1: Morgan Vale, morgan.vale@example.com, wants a bathroom painted at 10 Fiction Street, Exampleton, NY 10001. Customer 2: Taylor Reed, +1 (202) 555-0181, needs a garden fence repaired at 99 Sample Avenue, Demo City, NY 10002. These are separate properties and separate jobs. Please keep the customers apart.',
    extraction: prepared({}, {
      contactName: { evidence: ['Customer 1: Morgan Vale', 'Customer 2: Taylor Reed'], issues: ['Two different customers are included. Do not choose or combine their identities.'] },
      addressRaw: { evidence: ['10 Fiction Street, Exampleton, NY 10001', '99 Sample Avenue, Demo City, NY 10002'], issues: ['Two different service properties are included. Split the source into separate requests.'] },
      requestedServices: { evidence: ['wants a bathroom painted', 'needs a garden fence repaired'], issues: ['The services belong to different customers and properties. Extract one request at a time.'] },
      summary: { value: 'Two distinct customer requests require separate intake drafts.', evidence: ['These are separate properties and separate jobs.'], issues: ['This is a split-and-review warning, not a merged job card.'] },
    }, ['Split this conversation into one request per customer/property. This draft intentionally leaves shared contact, address, and service values unresolved.'], true),
  },
];

export function loadExample(id: string, source?: string): JobRecord | null {
  const example = EXAMPLES.find((item) => item.id === id);
  if (!example || (source !== undefined && source !== example.source)) return null;
  return { ...validateExtraction(example.extraction, example.source, 'example'), fixtureId: example.id };
}
