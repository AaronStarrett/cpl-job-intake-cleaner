/** This is completeness guidance, not verification of reachability, geography, or dispatch readiness. */
export const RULE_CONFIG = {
  required: ['contact', 'contact-method', 'address', 'work'] as const,
  phone: { minDigits: 7, maxDigits: 15 },
  addressPolicy: 'Provide a street/site identifier, city/locality, and state/region or postal code. The US-style address check accepts a comma-separated full address (for example: 123 Example Lane, Exampleton, CA 90001), or separately entered components. Ambiguous raw text remains unresolved. This formatting heuristic does not verify geography, address existence, or serviceability.',
  recommended: ['timing'] as const,
};
