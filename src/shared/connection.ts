/** Format check only: this does not verify the key, billing, model access, or connectivity.
 * Keys belong in transient browser state and the same-origin POST body, never persistence. */
export const API_KEY_PATTERN = /^sk-[A-Za-z0-9_-]{16,509}$/;
export function isApiKeyFormat(value: unknown): value is string { return typeof value === 'string' && value.trim() === value && API_KEY_PATTERN.test(value); }
