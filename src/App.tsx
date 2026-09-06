import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronDown, CircleAlert, Clipboard, ClipboardCheck, FileCheck2, FileJson, FileSpreadsheet, FileText, KeyRound, LoaderCircle, Mail, MessageSquareText, PencilLine, Printer, Quote, RotateCcw, Settings2, ShieldCheck, Sparkles, Unplug, X } from 'lucide-react';
import { EXAMPLES, loadExample } from './shared/fixtures';
import { isApiKeyFormat } from './shared/connection';
import { FIELD_KEYS, FIELD_LABELS, SOURCE_LABELS, TRADE_HINTS, jobRecordSchema, type Field, type FieldKey, type JobRecord } from './shared/schema';
import { evaluateRecord } from './shared/rules';
import { generateFollowUp } from './shared/followup';
import { exportCsv, exportJson, formatJobCard } from './shared/exports';
import { setReview, updateField } from './shared/state';
import { Turnstile } from './components/Turnstile';

const PORTFOLIO_URL = 'https://cpl-portfolio.pages.dev';
const INPUT_LIMIT = 8000;
const FIRST_EXAMPLE = EXAMPLES[0];
type Tab = 'card' | 'followup' | 'original';
type FollowUp = ReturnType<typeof generateFollowUp>;
type PublicConfig = {
  liveEnabled: boolean; unavailableReason: string | null; turnstileSiteKey: string | null;
  turnstileAction: string; maxInputChars: number; portfolioUrl: string;
};
const DEFAULT_CONFIG: PublicConfig = {
  liveEnabled: false, unavailableReason: 'Request processing is unavailable because the service is not fully configured. Your text has not been sent.',
  turnstileSiteKey: null, turnstileAction: 'intake-analyze', maxInputChars: INPUT_LIMIT,
  portfolioUrl: PORTFOLIO_URL,
};
const STATUS_LABELS: Record<Field['status'], string> = {
  extracted: 'From message', missing: 'Not supplied', 'needs-review': 'Needs review', 'user-entered': 'Entered by you',
};
const EXTRA_FIELDS: FieldKey[] = ['company', 'contactPreference', 'addressStreet', 'addressCity', 'addressRegion', 'addressPostalCode', 'propertyType', 'requestedServices', 'requestedDate', 'urgency', 'accessNotes', 'budget', 'dimensions'];
const MULTILINE_FIELDS: FieldKey[] = ['summary', 'addressRaw', 'requestedServices', 'accessNotes'];

function safePublicUrl(value: unknown, fallback: string) {
  try {
    const url = new URL(typeof value === 'string' ? value : '');
    return url.protocol === 'https:' ? url.href : fallback;
  } catch { return fallback; }
}

/** Render literal source characters. React escapes every segment, including marked quotes. */
function HighlightedSource({ source, quotes }: { source: string; quotes: string[] }) {
  const spans: { start: number; end: number }[] = [];
  for (const quote of quotes.filter(Boolean)) {
    let position = source.indexOf(quote);
    while (position !== -1) {
      spans.push({ start: position, end: position + quote.length });
      position = source.indexOf(quote, position + quote.length);
    }
  }
  spans.sort((a, b) => a.start - b.start);
  const merged: typeof spans = [];
  for (const span of spans) {
    const previous = merged.at(-1);
    if (previous && span.start <= previous.end) previous.end = Math.max(previous.end, span.end);
    else merged.push({ ...span });
  }
  const children: ReactNode[] = [];
  let cursor = 0;
  for (const span of merged) {
    children.push(source.slice(cursor, span.start));
    children.push(<mark key={span.start}>{source.slice(span.start, span.end)}</mark>);
    cursor = span.end;
  }
  children.push(source.slice(cursor));
  return <p className="source-evidence-text">{children}</p>;
}

function FieldEditor({ fieldKey, field, onChange, onEvidence, wide = false }: {
  fieldKey: FieldKey; field: Field; onChange: (key: FieldKey, value: string) => void;
  onEvidence: (key: FieldKey) => void; wide?: boolean;
}) {
  const id = `field-${fieldKey}`;
  const control = {
    id, value: field.value ?? '', maxLength: 2000,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(fieldKey, event.target.value),
    'aria-describedby': `${id}-status${field.issues.length ? ` ${id}-issues` : ''}`,
    placeholder: field.status === 'needs-review' ? 'Confirm or correct this detail' : 'Not supplied — add if known',
  };
  return <div className={`field ${wide ? 'field-wide' : ''} ${field.status === 'needs-review' ? 'field-attention' : ''}`}>
    <div className="field-label-row">
      <label htmlFor={id}>{FIELD_LABELS[fieldKey]}</label>
      {field.evidence.length > 0 && <button type="button" className="evidence-button" onClick={() => onEvidence(fieldKey)} aria-label={`View ${field.status === 'user-entered' ? 'original source' : 'evidence'} for ${FIELD_LABELS[fieldKey]}`} title={field.status === 'user-entered' ? 'Show the original passage, before your correction' : 'Show the supporting source passage'}><Quote size={13} /> <span>{field.status === 'user-entered' ? 'Original source' : 'Source'}</span></button>}
    </div>
    {MULTILINE_FIELDS.includes(fieldKey)
      ? <textarea {...control} rows={fieldKey === 'summary' ? 3 : 2} />
      : <input {...control} type="text" inputMode={fieldKey === 'phone' ? 'tel' : fieldKey === 'email' ? 'email' : 'text'} autoComplete="off" />}
    <span className={`field-status status-${field.status}`} id={`${id}-status`}>
      {field.status === 'user-entered' ? <PencilLine size={11} /> : field.status === 'needs-review' ? <CircleAlert size={11} /> : field.status === 'extracted' ? <Check size={11} /> : null}
      {STATUS_LABELS[field.status]}
      {fieldKey === 'suggestedTrade' && field.value ? ' · suggestion' : ''}
    </span>
    {field.issues.length > 0 && <ul className="field-issues" id={`${id}-issues`}>{field.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
  </div>;
}

function DraftFields({ draft, onChange, onCopy }: {
  draft: FollowUp; onChange: (draft: FollowUp) => void; onCopy: (text: string, label: string) => void;
}) {
  return <div className="followup-fields">
    <label htmlFor="followup-subject">Subject</label>
    <input id="followup-subject" value={draft.subject} maxLength={400} onChange={(event) => onChange({ ...draft, subject: event.target.value })} />
    <label htmlFor="followup-body">Email-style draft</label>
    <textarea id="followup-body" rows={12} value={draft.body} maxLength={8000} onChange={(event) => onChange({ ...draft, body: event.target.value })} />
    <details className="short-message"><summary>Short-message version <ChevronDown size={15} /></summary>
      <label className="sr-only" htmlFor="followup-short">Short-message draft</label>
      <textarea id="followup-short" rows={6} value={draft.shortMessage} maxLength={8000} onChange={(event) => onChange({ ...draft, shortMessage: event.target.value })} />
      <button className="text-button" onClick={() => onCopy(draft.shortMessage, 'Short-message draft')}><Clipboard size={14} /> Copy short message</button>
    </details>
  </div>;
}

function downloadText(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [config, setConfig] = useState<PublicConfig>(DEFAULT_CONFIG);
  const [checkingConfig, setCheckingConfig] = useState(true);
  const [configCheck, setConfigCheck] = useState(0);
  const [source, setSource] = useState(FIRST_EXAMPLE.source);
  const [selectedExample, setSelectedExample] = useState(FIRST_EXAMPLE.id);
  const [sourceLabel, setSourceLabel] = useState<(typeof SOURCE_LABELS)[number]>(FIRST_EXAMPLE.sourceLabel);
  const [tradeHint, setTradeHint] = useState<(typeof TRADE_HINTS)[number]>(FIRST_EXAMPLE.tradeHint);
  // Keys never enter storage, source identity, URLs, exports, or rendered summaries.
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState('');
  const [editingConnection, setEditingConnection] = useState(false);
  const [keyVerified, setKeyVerified] = useState(false);
  const [connectionConsent, setConnectionConsent] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [record, setRecord] = useState<JobRecord | null>(null);
  const [original, setOriginal] = useState<JobRecord | null>(null);
  const [followUp, setFollowUp] = useState<FollowUp | null>(null);
  const [followUpDirty, setFollowUpDirty] = useState(false);
  const [followUpStale, setFollowUpStale] = useState(false);
  const [tab, setTab] = useState<Tab>('card');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [sourceInvalidated, setSourceInvalidated] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [verificationVersion, setVerificationVersion] = useState(0);
  const [evidence, setEvidence] = useState<{ key: FieldKey; quotes: string[]; beforeCorrection: boolean } | null>(null);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const submissionRef = useRef<{ identity: string; requestId: string } | null>(null);
  const sourceRef = useRef(source);
  const evidenceRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const copyDialog = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const settingsDialog = useRef<HTMLDialogElement>(null);

  const evaluation = useMemo(() => record ? evaluateRecord(record) : null, [record]);
  const liveAvailable = config.liveEnabled && Boolean(config.turnstileSiteKey);
  const walkthroughUrl = new URL('/projects/job-intake-cleaner/#walkthrough', config.portfolioUrl).href;
  const inputTooLong = source.length > config.maxInputChars;
  const selectedFixture = EXAMPLES.find((example) => example.id === selectedExample);
  const fixtureMatches = !apiKey && Boolean(selectedFixture && source === selectedFixture.source);
  const hasManualEdits = Boolean(record && FIELD_KEYS.some((key) => record.fields[key].status === 'user-entered')) || followUpDirty;

  useEffect(() => {
    setCheckingConfig(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    let cancelled = false;
    void fetch('/api/config', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unavailable configuration.');
        const value = await response.json() as Partial<PublicConfig>;
        if (typeof value.liveEnabled !== 'boolean') throw new Error('Invalid configuration.');
        if (!cancelled) setConfig({
          ...DEFAULT_CONFIG,
          liveEnabled: value.liveEnabled,
          unavailableReason: typeof value.unavailableReason === 'string' ? value.unavailableReason : DEFAULT_CONFIG.unavailableReason,
          turnstileSiteKey: typeof value.turnstileSiteKey === 'string' ? value.turnstileSiteKey : null,
          maxInputChars: typeof value.maxInputChars === 'number' ? Math.min(INPUT_LIMIT, Math.max(1, value.maxInputChars)) : INPUT_LIMIT,
          portfolioUrl: safePublicUrl(value.portfolioUrl, PORTFOLIO_URL),
        });
      }).catch(() => {
        if (!cancelled) setConfig({ ...DEFAULT_CONFIG, unavailableReason: 'We could not check request processing. Your text has not been sent. Check your connection and try the availability check again.' });
      }).finally(() => { window.clearTimeout(timeout); if (!cancelled) setCheckingConfig(false); });
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout); };
  }, [configCheck]);

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    if (copyFallback && copyDialog.current && !copyDialog.current.open) copyDialog.current.showModal();
  }, [copyFallback]);

  const clearResult = (preserveEditedFollowUp = false) => {
    requestRef.current?.abort();
    requestRef.current = null;
    submissionRef.current = null;
    setLoading(false);
    setRecord(null); setOriginal(null);
    if (preserveEditedFollowUp && followUpDirty && followUp) setFollowUpStale(true);
    else { setFollowUp(null); setFollowUpDirty(false); setFollowUpStale(false); }
    setEvidence(null); setTab('card'); setError(null); setErrorCode(null); setAnnouncement('');
  };

  function openSettings() {
    setPendingKey(''); setConnectionConsent(false); setSettingsError(null); setEditingConnection(false);
    settingsDialog.current?.showModal();
  }

  function closeSettings() {
    setPendingKey(''); setConnectionConsent(false); setSettingsError(null); setEditingConnection(false);
  }

  function connectKey() {
    const key = pendingKey.trim();
    if (!isApiKeyFormat(key)) { setSettingsError('Enter a complete OpenAI API key beginning with sk-. The key is checked locally for format only.'); return; }
    if (!connectionConsent) { setSettingsError('Review and acknowledge how your key and requests are processed.'); return; }
    if (apiKey) {
      requestRef.current?.abort(); requestRef.current = null; submissionRef.current = null;
      setLoading(false); setError(null); setErrorCode(null);
      setApiKey(key); setPendingKey(''); setKeyVerified(false);
      setTurnstileToken(null); setVerificationVersion((value) => value + 1);
      settingsDialog.current?.close();
      setAnnouncement('Key replaced for this tab. Your message, job card, and follow-up have been kept. The new key has not yet been verified.');
      return;
    }
    if ((hasManualEdits || (source.trim() && !fixtureMatches)) && !window.confirm('Switch to your own request? Your current sample message, job-card corrections, and follow-up edits will be cleared.')) return;
    clearResult(); setApiKey(key); setPendingKey(''); setKeyVerified(false);
    setSource(''); sourceRef.current = ''; setSelectedExample('');
    setSourceLabel('other'); setTradeHint('Auto-detect'); setSourceInvalidated(false);
    setTurnstileToken(null); setVerificationVersion((value) => value + 1);
    settingsDialog.current?.close();
    setAnnouncement('Connected for this tab. Your key has not yet been verified. Paste your own request to begin.');
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function disconnectKey() {
    if (!apiKey || !window.confirm('Disconnect your key? Your current message, job card, and follow-up will be cleared. The workspace will return to fictional sample data.')) return;
    clearResult(); setApiKey(null); setPendingKey(''); setKeyVerified(false);
    setSource(FIRST_EXAMPLE.source); sourceRef.current = FIRST_EXAMPLE.source; setSelectedExample(FIRST_EXAMPLE.id);
    setSourceLabel(FIRST_EXAMPLE.sourceLabel); setTradeHint(FIRST_EXAMPLE.tradeHint); setSourceInvalidated(false);
    setTurnstileToken(null); setVerificationVersion((value) => value + 1);
    settingsDialog.current?.close(); setAnnouncement('Key disconnected and current work cleared. Fictional sample data is loaded.');
  }

  function chooseExample(id: string) {
    if (apiKey || (id === selectedExample && fixtureMatches)) return;
    if ((hasManualEdits || (source.trim() && !fixtureMatches) || record?.reviewed) && !window.confirm('Load another sample? Your current message, job-card corrections, and follow-up edits will be discarded.')) return;
    const example = EXAMPLES.find((item) => item.id === id);
    clearResult(); setSelectedExample(id); setSource(example?.source ?? ''); sourceRef.current = example?.source ?? '';
    setSourceLabel(example?.sourceLabel ?? 'other'); setTradeHint(example?.tradeHint ?? 'Auto-detect');
    setSourceInvalidated(false); setAnnouncement(example ? `${example.title} loaded. Select Show sample result to organize it.` : 'Sample cleared. Choose a sample or connect your key for your own request.');
  }

  function changeSource(next: string) {
    const hadResult = Boolean(record || original);
    const wasProcessing = loading;
    clearResult(true);
    setSource(next); sourceRef.current = next;
    if (hadResult) setSourceInvalidated(true);
    if (wasProcessing) { setTurnstileToken(null); setVerificationVersion((value) => value + 1); }
    if (hadResult) setAnnouncement('The source changed. The previous result and review acknowledgment were cleared.');
  }

  function changeMetadata(next: { sourceLabel?: typeof sourceLabel; tradeHint?: typeof tradeHint }) {
    const wasProcessing = loading;
    clearResult(true);
    if (next.sourceLabel !== undefined) setSourceLabel(next.sourceLabel);
    if (next.tradeHint !== undefined) setTradeHint(next.tradeHint);
    setSourceInvalidated((previous) => previous || Boolean(record));
    if (wasProcessing) { setTurnstileToken(null); setVerificationVersion((value) => value + 1); }
    if (record) setAnnouncement('The message options changed. The previous result and review acknowledgment were cleared.');
  }

  function acceptRecord(next: JobRecord) {
    setRecord(next); setOriginal(structuredClone(next));
    if (followUpDirty && followUp) setFollowUpStale(true);
    else { setFollowUp(generateFollowUp(next)); setFollowUpDirty(false); setFollowUpStale(false); }
    setSourceInvalidated(false); setEvidence(null); setTab('card'); setError(null); setErrorCode(null);
    if (next.sourceMode === 'live') setKeyVerified(true);
    const nextEvaluation = evaluateRecord(next);
    setAnnouncement(`Job-intake draft prepared. ${nextEvaluation.satisfied} of ${nextEvaluation.total} required checks satisfied. Review the details.`);
    window.requestAnimationFrame(() => {
      resultRef.current?.focus({ preventScroll: true });
      if (window.matchMedia('(max-width: 880px)').matches) resultRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
  }

  function showSampleResult() {
    if (apiKey) return;
    if (hasManualEdits && !window.confirm('Show the sample result again? Your current job-card corrections will be replaced. Any edited follow-up wording will be retained.')) return;
    const next = loadExample(selectedExample, source);
    if (!next) { setError('This text no longer matches the sample. Restore its unchanged text or connect your key to organize your own request.'); return; }
    acceptRecord(next);
  }

  async function analyzeText() {
    if (loading || record || !apiKey || !liveAvailable || !turnstileToken || !source.trim() || inputTooLong) return;
    const controller = new AbortController();
    requestRef.current?.abort(); requestRef.current = controller;
    const submittedSource = source;
    // Keep one identity for this unchanged submission, including uncertain network failures.
    // The durable server reservation then prevents a lost response from causing a second paid call.
    const identity = JSON.stringify([source, sourceLabel, tradeHint]);
    const requestId = submissionRef.current?.identity === identity ? submissionRef.current.requestId : crypto.randomUUID();
    submissionRef.current = { identity, requestId };
    setLoading(true); setError(null); setErrorCode(null); setAnnouncement('Organizing the submitted request.');
    const timeout = window.setTimeout(() => controller.abort(), 65000);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceText: submittedSource, sourceLabel, tradeHint, turnstileToken, requestId, apiKey }),
      });
      const payload = await response.json() as { record?: unknown; mode?: string; error?: { code?: string; message?: string } };
      if (requestRef.current !== controller || sourceRef.current !== submittedSource) return;
      if (!response.ok) {
        setErrorCode(payload.error?.code ?? 'INTERNAL_ERROR');
        const message = payload.error?.message;
        throw new Error(message && !message.includes(apiKey) ? message : 'The request could not be organized. Your input is still here.');
      }
      const parsed = jobRecordSchema.safeParse(payload.record);
      if (!parsed.success || parsed.data.sourceMode !== 'live' || parsed.data.reviewed || payload.mode !== 'live') {
        setErrorCode('PROVIDER_INVALID_RESPONSE');
        throw new Error('The response could not be validated. Your input is still here. No unvalidated job card was accepted.');
      }
      if (requestRef.current === controller && sourceRef.current === submittedSource) acceptRecord(parsed.data);
    } catch (cause) {
      if (requestRef.current !== controller || sourceRef.current !== submittedSource) return;
      setError(cause instanceof DOMException && cause.name === 'AbortError'
        ? 'Processing took too long. Your text has been retained. You can retry safely; the same submission will not start a duplicate extraction.'
        : cause instanceof TypeError ? 'The connection was interrupted. Your text has been retained. Try again to check the same submission.'
        : cause instanceof Error ? cause.message : 'Request processing is unavailable. Your text has been retained.');
      setAnnouncement('The request could not be organized. Your text has been retained.');
    } finally {
      window.clearTimeout(timeout);
      if (requestRef.current === controller) {
        setLoading(false); requestRef.current = null;
        setTurnstileToken(null); setVerificationVersion((value) => value + 1);
      }
    }
  }

  function startNewAttempt() {
    if (loading || !error || !window.confirm('Start a separate extraction attempt for this text? The earlier result is unavailable. This may count as another request toward the service’s usage limit. Your text and edited follow-up will be kept.')) return;
    submissionRef.current = null;
    setError(null); setErrorCode(null); setTurnstileToken(null); setVerificationVersion((value) => value + 1);
    setAnnouncement('A new attempt is ready. Complete the verification check, then select Organize request.');
  }

  function editField(key: FieldKey, value: string) {
    if (!record) return;
    setRecord(updateField(record, key, value));
    setFollowUpStale(true);
    if (record.reviewed) setAnnouncement('The job card changed. Review acknowledgment cleared; refresh the follow-up to include your correction.');
  }

  function showEvidence(key: FieldKey, snapshot = record) {
    if (!snapshot) return;
    setEvidence({ key, quotes: snapshot.fields[key].evidence.filter((quote) => source.includes(quote)), beforeCorrection: snapshot.fields[key].status === 'user-entered' });
    window.requestAnimationFrame(() => {
      evidenceRef.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
      evidenceRef.current?.focus({ preventScroll: true });
    });
  }

  function refreshFollowUp() {
    if (!record) return;
    if (followUpDirty && !window.confirm('Replace your edited follow-up? A new draft will be generated from the current job card. Your wording will be discarded.')) return;
    setFollowUp(generateFollowUp(record)); setFollowUpDirty(false); setFollowUpStale(false);
    setAnnouncement('Follow-up refreshed from the current job card.');
  }

  async function copyText(text: string, label: string) {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable.');
      await navigator.clipboard.writeText(text);
      setAnnouncement(`${label} copied.`);
    } catch {
      setCopyFallback(text);
      setAnnouncement('Automatic copying is unavailable. Select and copy the text in the dialog.');
    }
  }

  function reset() {
    if ((source.trim().length > 0 || record || followUpDirty) && !window.confirm('Start a new request? The current message, job card, follow-up, and review acknowledgment will all be cleared.')) return;
    clearResult(); setSource(''); sourceRef.current = ''; setSelectedExample('');
    setSourceLabel('other'); setTradeHint('Auto-detect'); setSourceInvalidated(false);
    setTurnstileToken(null); setVerificationVersion((value) => value + 1);
    setCopyFallback(null); setAnnouncement('New request started. All previous message and draft content has been cleared.');
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function tabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const tabs: Tab[] = ['card', 'followup', 'original'];
    const current = tabs.indexOf(tab);
    const next = event.key === 'ArrowRight' ? (current + 1) % tabs.length : event.key === 'ArrowLeft' ? (current + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault(); setTab(tabs[next]); document.getElementById(`tab-${tabs[next]}`)?.focus();
  }

  const receiveToken = useCallback((token: string | null) => setTurnstileToken(token), []);
  const renderField = (key: FieldKey, wide = false) => record && <FieldEditor key={key} fieldKey={key} field={record.fields[key]} onChange={editField} onEvidence={showEvidence} wide={wide} />;
  const requiredMissing = evaluation ? evaluation.total - evaluation.satisfied : 0;
  const reviewIssues = evaluation?.issues.filter((issue) => issue.severity === 'review') ?? [];

  return <>
    <a className="skip-link" href="#workspace">Skip to the intake workspace</a>
    <div className="app-shell">
      <header className="site-header">
        <a href={config.portfolioUrl} className="brand" aria-label="Cyber Pirate Labs portfolio" target="_blank" rel="noopener noreferrer">
          <img src="/images/cpl-logo-c.png" width="50" height="50" alt="Cyber Pirate Labs logo" />
          <span>CYBER PIRATE LABS<small>Practical tools. Built with intent.</small></span>
        </a>
        <div className="header-actions">
          <a className="back-link" href={walkthroughUrl} target="_blank" rel="noopener noreferrer">Help <ArrowUpRight size={14} /></a>
          <button className={`button settings-button ${apiKey ? 'settings-connected' : ''}`} onClick={openSettings}><Settings2 size={16} /> Settings{apiKey && <span className="connection-dot" aria-hidden="true" />}</button>
        </div>
      </header>

      <main>
        <section className="tool-heading" aria-labelledby="page-title">
          <div><div className="product-label"><span className="product-icon"><ClipboardCheck size={15} /></span> A CLEARER START TO THE JOB</div><h1 id="page-title">Job Intake Cleaner<span>.</span></h1><p>The customer’s words. The details you need. Your next step.</p></div>
          <div className="tool-heading-actions"><span className={`workspace-badge ${apiKey ? 'workspace-live' : ''}`}><span className="status-dot" />{apiKey ? 'Live mode · your key' : 'Sample mode'}</span><button className="text-button new-request-button" onClick={reset}><RotateCcw size={14} /> New request</button></div>
        </section>

        <div className="workflow-strip" aria-label="Current workflow stage">
          <div className={`workflow-step ${source.trim() ? 'step-done' : ''}`}><span>{source.trim() ? <Check size={13} /> : '1'}</span><b>Your request</b></div>
          <ArrowRight size={15} className="step-arrow" />
          <div className={`workflow-step ${record ? 'step-done' : loading ? 'step-active' : ''}`}><span>{loading ? <LoaderCircle size={13} className="spin" /> : record ? <Check size={13} /> : '2'}</span><b>{loading ? 'Organizing details' : 'Job card'}</b></div>
          <ArrowRight size={15} className="step-arrow" />
          <div className={`workflow-step ${record?.reviewed ? 'step-done' : record ? 'step-attention' : ''}`}><span>{record?.reviewed ? <Check size={13} /> : '3'}</span><b>{record?.reviewed ? 'Review acknowledged' : 'Review & follow-up'}</b></div>
          <ArrowRight size={15} className="step-arrow" />
          <div className={`workflow-step ${record ? 'step-active' : ''}`}><span>4</span><b>{record ? 'Export available' : 'Export your work'}</b></div>
        </div>

        <div className="workspace" id="workspace">
          <section className="panel input-panel" aria-labelledby="input-heading">
            <div className="panel-heading"><div><span className="eyebrow">01 / THE CUSTOMER’S WORDS</span><h2 id="input-heading">Start with the request.</h2></div><MessageSquareText className="panel-heading-icon" size={23} /></div>
            <div className="input-content">
              {!apiKey && <div className="sample-picker">
                <div className="sample-picker-heading"><Sparkles size={15} /><strong>Explore with fictional data</strong><span>No AI calls</span></div>
                <label htmlFor="example">Try a sample request</label>
                <div className="select-wrap"><select id="example" value={selectedExample} onChange={(event) => chooseExample(event.target.value)}><option value="">Choose a sample</option>{EXAMPLES.map((example) => <option key={example.id} value={example.id}>{example.title}</option>)}</select><ChevronDown size={15} /></div>
                <p>Every person, place, and contact detail here is fictional.</p>
              </div>}

              <div className="message-label"><label htmlFor="source-message">Paste the customer message or phone notes.</label></div>
              <textarea ref={inputRef} className="source-textarea" id="source-message" rows={8} value={source} onChange={(event) => changeSource(event.target.value)} maxLength={config.maxInputChars} placeholder="Include the customer’s own wording, contact details, location, and requested work—even if it’s a little messy." aria-describedby="source-hint source-count input-privacy" spellCheck="false" autoComplete="off" />
              <div className="textarea-footer"><span id="source-hint">One job request at a time.</span><span id="source-count">{source.length.toLocaleString()} / {config.maxInputChars.toLocaleString()}</span></div>

              <div className="input-meta">
                <div><label htmlFor="source-label">Message source</label><div className="select-wrap"><select id="source-label" value={sourceLabel} onChange={(event) => changeMetadata({ sourceLabel: event.target.value as typeof sourceLabel })}>{SOURCE_LABELS.map((label) => <option key={label} value={label}>{label.charAt(0).toUpperCase() + label.slice(1)}</option>)}</select><ChevronDown size={15} /></div></div>
                <div><label htmlFor="trade-hint">Trade hint <span className="optional">optional</span></label><div className="select-wrap"><select id="trade-hint" value={tradeHint} onChange={(event) => changeMetadata({ tradeHint: event.target.value as typeof tradeHint })}>{TRADE_HINTS.map((hint) => <option key={hint}>{hint}</option>)}</select><ChevronDown size={15} /></div></div>
              </div>

              {sourceInvalidated && <div className="notice notice-amber" role="status"><CircleAlert size={17} /><p>The message or its options changed. The previous job card and review acknowledgment were cleared.{followUpDirty ? ' Your edited follow-up has been kept.' : ''}</p></div>}
              {!apiKey && selectedFixture && !fixtureMatches && <button className="text-button restore-button" onClick={() => {
                if (source.trim() && !window.confirm('Restore the unchanged sample? Your current source text will be discarded. Your edited follow-up will be kept.')) return;
                clearResult(true); setSource(selectedFixture.source); sourceRef.current = selectedFixture.source; setSourceInvalidated(false); setAnnouncement('Unchanged fictional sample restored. Select Show sample result.');
              }}><RotateCcw size={14} /> Restore unchanged sample</button>}

              <div className="primary-action-area">
                {apiKey ? <>
                  {!liveAvailable && <div className="service-notice" role="status"><CircleAlert size={17} /><div><strong>{checkingConfig ? 'Checking request processing…' : 'Request processing is unavailable'}</strong><p>{checkingConfig ? 'Your text stays here while the service configuration is checked.' : config.unavailableReason}</p>{!checkingConfig && <button className="text-button" onClick={() => setConfigCheck((value) => value + 1)}>Check again <RotateCcw size={12} /></button>}</div></div>}
                  {inputTooLong && <div className="notice notice-error" role="alert"><CircleAlert size={17} /><p>Shorten the message to {config.maxInputChars.toLocaleString()} characters before organizing it.</p></div>}
                  <p className="input-privacy" id="input-privacy"><ShieldCheck size={15} /><span>Use information you’re authorized to process and avoid unnecessary sensitive details. Organizing sends your key and text through CPL’s Worker to OpenAI and uses your API account.</span></p>
                  {liveAvailable && source.trim() && !record && <Turnstile key={verificationVersion} siteKey={config.turnstileSiteKey!} action="intake-analyze" onToken={receiveToken} />}
                  <button className="button button-primary button-full" aria-label="Organize request" onClick={() => void analyzeText()} disabled={loading || Boolean(record) || !source.trim() || !liveAvailable || !turnstileToken || inputTooLong}>{loading ? <LoaderCircle className="spin" size={18} /> : record ? <Check size={18} /> : <Sparkles size={18} />}{loading ? 'Organizing request…' : record ? 'Request organized' : 'Organize request'}<ArrowRight size={17} /></button>
                  <p className="action-caption">{keyVerified ? 'This key has completed an extraction in this tab.' : 'Connected for this tab. Your key is verified only by a successful extraction.'}</p>
                </> : <>
                  <button className="button button-primary button-full" onClick={showSampleResult} disabled={!fixtureMatches}><Sparkles size={18} /> Show sample result <ArrowRight size={17} /></button>
                  <p className="action-caption" id="input-privacy">Prepared fictional sample data. No live AI call.</p>
                  {!fixtureMatches && <p className="sample-change-note">Edited text cannot use a prepared result. Restore the sample, or connect your key for your own request.</p>}
                  <button className="connect-inline" onClick={openSettings}><KeyRound size={17} /><span><strong>Ready to use your own request?</strong><small>Add your OpenAI key in Settings.</small></span><ArrowUpRight size={16} /></button>
                </>}
              </div>
              {error && <div className="notice notice-error" role="alert"><CircleAlert size={18} /><div><p>{error}</p>{apiKey && errorCode && (errorCode === 'DUPLICATE_REQUEST' || errorCode.startsWith('PROVIDER_') || errorCode === 'INTERNAL_ERROR') && <button className="text-button new-attempt" onClick={startNewAttempt}>Start a new attempt <RotateCcw size={13} /></button>}</div></div>}
              <div className="input-bottom"><p><ShieldCheck size={14} /> Your work stays in this tab. No saved job history.</p><span>Review before use.</span></div>

              {evidence && <div className="evidence-panel" ref={evidenceRef} tabIndex={-1} aria-label={`Source evidence for ${FIELD_LABELS[evidence.key]}`}>
                <div className="evidence-heading"><span><Quote size={16} /><strong>{FIELD_LABELS[evidence.key]} · source evidence</strong></span><button className="icon-button" onClick={() => setEvidence(null)} aria-label="Close source evidence"><X size={17} /></button></div>
                <HighlightedSource source={source} quotes={evidence.quotes} />
                <p className="small-note">{evidence.beforeCorrection ? 'This passage supported the original extraction. Your correction is user-entered; this quote does not verify it.' : 'A matching quote supports the extraction. It does not verify the underlying facts.'}</p>
              </div>}
            </div>
          </section>

          <section className={`panel result-panel ${record ? 'result-present' : ''}`} aria-labelledby="result-heading" ref={resultRef} tabIndex={-1}>
            <div className="panel-heading"><div><span className="eyebrow">02 / THE DETAILS THAT MATTER</span><h2 id="result-heading">Your job card.</h2></div><FileCheck2 className="panel-heading-icon" size={23} /></div>
            {!record || !evaluation ? <>
              <div className="empty-result">
                <div className="empty-card-icon" aria-hidden="true">{loading ? <LoaderCircle size={34} className="spin" /> : <ClipboardCheck size={34} />}</div>
                <h3>{loading ? 'Finding the details in your request.' : 'A clear request starts here.'}</h3>
                <p>{loading ? 'One extraction is in progress. The returned details will be checked before a job card appears.' : apiKey ? 'Paste your message and organize it. Review the extracted details, fill the gaps, and prepare your follow-up.' : 'Show a sample result to explore the job card, make a correction, and export your work.'}</p>
                <div className="empty-features"><span><Quote size={16} /> Source evidence</span><span><PencilLine size={15} /> Your corrections</span><span><ArrowDownToLine size={15} /> Current-state exports</span></div>
                <p className="empty-boundary">{apiKey ? 'Nothing is sent until you choose Organize request.' : 'Fictional examples. Real editing, checks, and exports.'}</p>
              </div>
              {followUpDirty && followUp && <section className="retained-draft" aria-labelledby="retained-heading"><div className="notice notice-amber"><PencilLine size={17} /><div><h3 id="retained-heading">Your edited follow-up is still here.</h3><p>The source changed, so this wording may need updating. It will not be replaced without your confirmation.</p></div></div><DraftFields draft={followUp} onChange={(draft) => { setFollowUp(draft); setFollowUpDirty(true); }} onCopy={(text, label) => void copyText(text, label)} /><button className="button button-secondary" onClick={() => void copyText(`Subject: ${followUp.subject}\n\n${followUp.body}`, 'Follow-up draft')}><Clipboard size={15} /> Copy follow-up</button></section>}
            </> : <>
              <div className="result-status"><span className={`record-label ${record.sourceMode === 'live' ? 'record-live' : ''}`}><span className="status-dot" />{record.sourceMode === 'example' ? 'Fictional sample · prepared data' : 'Extracted from your request'}</span><span>{record.reviewed ? 'Review acknowledged' : 'Unreviewed draft'}</span></div>
              <div className="result-tabs" role="tablist" aria-label="Intake result views">
                {([{ id: 'card', label: 'Job card', Icon: ClipboardCheck }, { id: 'followup', label: 'Follow-up', Icon: Mail }, { id: 'original', label: 'Original extraction', Icon: FileText }] as const).map(({ id, label, Icon }) => <button key={id} id={`tab-${id}`} role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={tabKeyDown}><Icon size={15} />{label}{id === 'followup' && followUpStale && <span className="tab-attention" title="Needs refresh" aria-hidden="true" />}</button>)}
              </div>

              <div id="panel-card" role="tabpanel" aria-labelledby="tab-card" hidden={tab !== 'card'} className="tab-content">
                <div className={`completeness ${evaluation.readyForReview ? 'checks-satisfied' : 'checks-attention'}`}>
                  <div className="completeness-title"><span className="check-summary-icon">{evaluation.readyForReview ? <CheckCheck size={19} /> : <ClipboardCheck size={19} />}</span><div><strong>{evaluation.satisfied} of {evaluation.total} required checks satisfied</strong><p>{requiredMissing > 0 ? `${requiredMissing === 1 ? 'One required detail needs' : `${requiredMissing} required details need`} your attention.` : reviewIssues.length ? 'Required details are present. Review the flagged issues.' : 'The required details are present. A human review is still needed.'}</p></div></div>
                  <progress max={evaluation.total} value={evaluation.satisfied} aria-label={`${evaluation.satisfied} of ${evaluation.total} required checks satisfied`} />
                  <div className="checklist">{evaluation.checks.map((item) => <div key={item.id} className={item.satisfied ? 'check-satisfied' : 'check-missing'} title={item.detail}>{item.satisfied ? <Check size={14} /> : <CircleAlert size={14} />}<span>{item.label}</span></div>)}</div>
                </div>
                {evaluation.issues.length > 0 && <details className="attention-details" open={reviewIssues.length > 0}>
                  <summary><span><CircleAlert size={16} />{reviewIssues.length ? 'Details to clarify & review' : 'What still needs attention'} <b>{evaluation.issues.length}</b></span><ChevronDown size={16} /></summary>
                  <ul>{evaluation.issues.map((issue) => <li key={issue.id}><span className={`issue-kind issue-${issue.severity}`}>{issue.severity === 'review' ? 'Review' : issue.severity === 'required' ? 'Required' : 'Useful detail'}</span><p>{issue.message}</p>{issue.field && <button className="text-button" onClick={() => { const field = document.getElementById(`field-${issue.field}`); const details = field?.closest('details'); if (details) details.open = true; field?.focus(); field?.scrollIntoView({ block: 'center', behavior: 'auto' }); }}>View field <ArrowRight size={12} /></button>}</li>)}</ul>
                </details>}

                <div className="form-section"><div className="form-section-heading"><h3>Contact details</h3><span>Who’s making the request?</span></div><div className="field-grid">{renderField('contactName', true)}{renderField('phone')}{renderField('email')}</div></div>
                <div className="form-section"><div className="form-section-heading"><h3>Service address</h3><span>The location of the work</span></div><p className="section-help">Include the street or site location, city, and state/region or postal code. This checks completeness, not address validity.</p><div className="field-grid">{renderField('addressRaw', true)}</div></div>
                <div className="form-section"><div className="form-section-heading"><h3>Requested work</h3><span>Keep the customer’s meaning</span></div><div className="field-grid">{renderField('summary', true)}{renderField('suggestedTrade')}{renderField('requestedTiming')}</div></div>
                <details className="additional-details"><summary><span>Additional details <small>{EXTRA_FIELDS.filter((key) => record.fields[key].value).length} supplied</small></span><ChevronDown size={17} /></summary><div className="field-grid">{EXTRA_FIELDS.map((key) => renderField(key, MULTILINE_FIELDS.includes(key)))}</div></details>

                <div className="review-acknowledgment"><label><input type="checkbox" checked={record.reviewed} onChange={(event) => { setRecord(setReview(record, event.target.checked)); setAnnouncement(event.target.checked ? 'Human review acknowledged. Any unresolved warnings still apply.' : 'Review acknowledgment removed.'); }} /><span><strong>I have reviewed this draft and my corrections.</strong><small>This acknowledgment is not a booking, signature, or approval of the work. Unresolved warnings still apply.</small></span></label></div>
              </div>

              <div id="panel-followup" role="tabpanel" aria-labelledby="tab-followup" hidden={tab !== 'followup'} className="tab-content followup-content">
                <div className="followup-intro"><span className="followup-icon"><Mail size={23} /></span><h3>A thoughtful next message.</h3><p>Prepared from the current job card. Adjust the wording before sharing through your own email or messaging app.</p></div>
                {record.fields.contactPreference.value && <div className="preference-note"><MessageSquareText size={16} /><p>Stated contact preference: <strong>{record.fields.contactPreference.value}</strong></p></div>}
                {followUpStale && <div className="notice notice-amber"><CircleAlert size={17} /><p>The job card changed. Refresh this draft to include your corrections. Your edited wording will be protected by a confirmation.</p></div>}
                {!requiredMissing && <p className="no-missing"><CheckCheck size={15} />No required information is missing.{reviewIssues.length > 0 ? ' Review the remaining flagged details.' : ' Any questions below are optional clarifications.'}</p>}
                {followUp && <DraftFields draft={followUp} onChange={(draft) => { setFollowUp(draft); setFollowUpDirty(true); }} onCopy={(text, label) => void copyText(text, label)} />}
                <div className="followup-actions"><button className="button button-secondary" onClick={refreshFollowUp}><RotateCcw size={15} /> Refresh draft</button><button className="button button-primary" onClick={() => followUp && void copyText(`Subject: ${followUp.subject}\n\n${followUp.body}`, 'Follow-up draft')}><Clipboard size={15} /> Copy follow-up</button></div>
                <p className="small-note"><PencilLine size={13} /> {followUpDirty ? 'Your wording has been edited.' : 'Generated in this app from the job card; no additional AI call.'} This tool does not send messages.</p>
              </div>

              <div id="panel-original" role="tabpanel" aria-labelledby="tab-original" hidden={tab !== 'original'} className="tab-content original-content">
                <h3>The extraction, before your edits.</h3><p className="section-help">This read-only snapshot keeps the original result separate from your corrections. The job card and exports use your current edited values.</p>
                {original && <dl className="original-fields">{FIELD_KEYS.map((key) => <div key={key}><dt>{FIELD_LABELS[key]}<span className={`field-status status-${original.fields[key].status}`}>{STATUS_LABELS[original.fields[key].status]}</span></dt><dd>{original.fields[key].value ?? <span className="not-supplied">Not supplied</span>}{original.fields[key].evidence.length > 0 && <button className="evidence-button" onClick={() => showEvidence(key, original)} aria-label={`View original evidence for ${FIELD_LABELS[key]}`}><Quote size={13} /> Source</button>}</dd></div>)}</dl>}
              </div>

              <div className="export-bar"><div className="export-heading"><span><ArrowDownToLine size={17} /><strong>Take the job card with you</strong></span><small>Current edits · {record.reviewed ? 'review acknowledged' : 'unreviewed draft'}</small></div><div className="export-actions"><button className="button button-secondary" onClick={() => void copyText(formatJobCard(record), 'Job card')}><Clipboard size={15} /> Copy job card</button><button className="button button-secondary" onClick={() => { downloadText(exportCsv(record), 'job-intake.csv', 'text/csv;charset=utf-8'); setAnnouncement('CSV downloaded from the current job card.'); }}><FileSpreadsheet size={15} /> CSV</button><button className="button button-secondary" onClick={() => { downloadText(exportJson(record), 'job-intake.json', 'application/json;charset=utf-8'); setAnnouncement('JSON downloaded from the current job card.'); }}><FileJson size={15} /> JSON</button><button className="button button-secondary" onClick={() => window.print()}><Printer size={15} /> Print</button></div><p>Review status and unresolved warnings travel with the card. The full raw message is excluded.</p></div>
            </>}
          </section>
        </div>

        <details className="privacy-details"><summary><ShieldCheck size={16} /> Privacy & processing <ChevronDown size={15} /></summary><div><p>Only enter information you’re authorized to process, and leave out unnecessary sensitive details. In sample mode, prepared fictional data is used without an AI call. With your key connected, each Organize request sends your key and message through CPL’s Cloudflare Worker to OpenAI. API usage is charged to your OpenAI API account; a coding or ChatGPT subscription does not supply API credits.</p><p>The app does not save your key or job history. Your work and connection remain in this tab’s memory; reloading clears them. The Worker handles keys and job content transiently. OpenAI’s retention policies still apply, and infrastructure may retain operational metadata. Review the output: completeness checks do not verify facts, reachability, safety, or availability.</p></div></details>
      </main>
      <footer className="site-footer"><span>Job Intake Cleaner <span className="footer-dot">·</span> Cyber Pirate Labs</span><a href={config.portfolioUrl} target="_blank" rel="noopener noreferrer">Cyber Pirate Labs <ArrowUpRight size={13} /></a></footer>
    </div>

    <div className="announcement" role="status" aria-live="polite" aria-atomic="true">{announcement && <span key={announcement}><Check size={15} />{announcement}</span>}</div>
    <dialog ref={settingsDialog} className="settings-dialog" onClose={closeSettings} onCancel={closeSettings} aria-labelledby="connection-heading">
      <div className="dialog-heading"><span className="connection-icon"><KeyRound size={23} /></span><button className="icon-button" onClick={() => settingsDialog.current?.close()} aria-label="Close settings"><X size={20} /></button></div>
      <span className="eyebrow">YOUR CONNECTION</span><h2 id="connection-heading">{editingConnection ? 'Replace your OpenAI key' : apiKey ? 'Your OpenAI connection' : 'Connect your OpenAI key'}</h2>
      <p className="settings-model">OpenAI model <strong>gpt-6-astra</strong><a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">Manage API keys <ArrowUpRight size={13} /></a></p>
      {apiKey && !editingConnection ? <>
        <div className="connection-summary"><span className="connection-status"><Check size={16} /> Connected for this tab</span><p>{keyVerified ? 'Verified after successful extraction.' : 'Not yet verified. Your key is checked when you organize your first request.'}</p></div>
        <p className="settings-intro">Your key is held in this tab’s memory. It is never displayed here, included in exports, or saved by this app. Reloading the page or disconnecting clears it.</p>
        <div className="connection-flow"><span>This tab</span><ArrowRight size={14} /><span>CPL Worker</span><ArrowRight size={14} /><span>OpenAI</span></div>
        <p className="settings-note">Each Organize request sends your key and message through CPL’s Worker to OpenAI. API usage is charged to your OpenAI API account.</p>
        <div className="connection-actions"><button className="button button-secondary" onClick={() => { setPendingKey(''); setConnectionConsent(false); setSettingsError(null); setEditingConnection(true); }}><KeyRound size={16} /> Replace key</button><button className="button disconnect-button" onClick={disconnectKey}><Unplug size={16} /> Disconnect key</button></div>
      </> : <>
        <p className="settings-intro">{editingConnection ? 'Add a replacement key without losing your current message, job card, or follow-up. The replacement is used for your next request.' : 'Use your own OpenAI account to organize real requests. Connecting clears the fictional sample and opens an empty workspace for your text.'}</p>
        <div className="connection-flow"><span>Your key & request</span><ArrowRight size={14} /><span>CPL Worker</span><ArrowRight size={14} /><span>OpenAI</span></div>
        <label className="key-label" htmlFor="openai-key">OpenAI API key</label>
        <input id="openai-key" type="password" value={pendingKey} maxLength={512} onChange={(event) => { setPendingKey(event.target.value); setSettingsError(null); }} placeholder="sk-…" autoComplete="off" autoCapitalize="none" spellCheck="false" aria-invalid={Boolean(settingsError)} aria-describedby="key-hint" />
        <p id="key-hint" className="settings-note">Stored only in this tab’s memory. Adding a key checks its format, not its permissions or billing.</p>
        <label className="connection-consent"><input type="checkbox" checked={connectionConsent} onChange={(event) => setConnectionConsent(event.target.checked)} /><span>I understand requests use my OpenAI API account and send my key and text through CPL’s Worker to OpenAI.</span></label>
        <p className="settings-note">OpenAI API billing is separate from a coding or ChatGPT subscription. Only submit information you’re authorized to process. Provider retention policies apply.</p>
        {settingsError && <p className="error-text" role="alert">{settingsError}</p>}
        <button className="button button-primary button-full" onClick={connectKey} disabled={!pendingKey.trim() || !connectionConsent}><KeyRound size={17} /> Connect key <ArrowRight size={17} /></button>
        <p className="settings-footnote"><ShieldCheck size={14} /> No request is sent when you connect. Disconnect or reload to clear your key.</p>
      </>}
    </dialog>
    <dialog ref={copyDialog} className="copy-dialog" onClose={() => setCopyFallback(null)} onCancel={() => setCopyFallback(null)} aria-labelledby="copy-dialog-heading"><div className="dialog-heading"><h2 id="copy-dialog-heading">Copy your text</h2><button className="icon-button" onClick={() => copyDialog.current?.close()} aria-label="Close copy dialog"><X size={20} /></button></div><p>Automatic clipboard access is unavailable. Select the text below and copy it with your keyboard.</p><textarea autoFocus readOnly value={copyFallback ?? ''} aria-label="Text to copy" onFocus={(event) => event.target.select()} rows={14} /><button className="button button-primary" onClick={() => copyDialog.current?.close()}>Done</button></dialog>

    {record && evaluation && <article className="print-card"><header><span>CYBER PIRATE LABS</span><h1>Job Intake Card</h1><p>{record.sourceMode === 'example' ? 'Example mode — prepared fictional sample data; no live AI call.' : 'Live AI extraction'}<br />{record.reviewed ? 'Human review acknowledged. This is not a booking or approval of the work.' : 'UNREVIEWED DRAFT — review before use.'}</p></header><p><strong>{evaluation.satisfied} of {evaluation.total} required checks satisfied.</strong> Completeness does not verify underlying facts.</p>{evaluation.issues.length > 0 && <section className="print-warnings"><h2>Open items & warnings</h2><ul>{evaluation.issues.map((issue) => <li key={issue.id}><strong>{issue.severity}:</strong> {issue.message}</li>)}</ul></section>}<dl>{FIELD_KEYS.map((key) => <div key={key}><dt>{FIELD_LABELS[key]}</dt><dd>{record.fields[key].value ?? ''}{record.fields[key].status === 'user-entered' && <small> (entered by user)</small>}</dd></div>)}</dl><footer>Prepared with Job Intake Cleaner by Cyber Pirate Labs. Full raw source message excluded.</footer></article>}
  </>;
}
