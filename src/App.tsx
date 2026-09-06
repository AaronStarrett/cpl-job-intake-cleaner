import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronDown, CircleAlert, Clipboard, ClipboardCheck, FileCheck2, FileJson, FileSpreadsheet, FileText, Layers3, LoaderCircle, Mail, MessageSquareText, PencilLine, Printer, Quote, RotateCcw, ShieldCheck, Sparkles, X } from 'lucide-react';
import { EXAMPLES, loadExample } from './shared/fixtures';
import { FIELD_KEYS, FIELD_LABELS, SOURCE_LABELS, TRADE_HINTS, jobRecordSchema, type Field, type FieldKey, type JobRecord } from './shared/schema';
import { evaluateRecord } from './shared/rules';
import { generateFollowUp } from './shared/followup';
import { exportCsv, exportJson, formatJobCard } from './shared/exports';
import { setReview, updateField } from './shared/state';
import { Turnstile } from './components/Turnstile';

const PORTFOLIO_URL = 'https://cpl-portfolio.pages.dev';
const CONTACT_URL = `${PORTFOLIO_URL}/#contact`;
const INPUT_LIMIT = 8000;
const FIRST_EXAMPLE = EXAMPLES[0];
type Tab = 'card' | 'followup' | 'original';
type FollowUp = ReturnType<typeof generateFollowUp>;
type PublicConfig = {
  liveEnabled: boolean; unavailableReason: string | null; turnstileSiteKey: string | null;
  turnstileAction: string; maxInputChars: number; portfolioUrl: string; contactUrl: string;
};
const DEFAULT_CONFIG: PublicConfig = {
  liveEnabled: false, unavailableReason: 'Live AI is not available in this demonstration. The six fictional examples are ready to use.',
  turnstileSiteKey: null, turnstileAction: 'intake-analyze', maxInputChars: INPUT_LIMIT,
  portfolioUrl: PORTFOLIO_URL, contactUrl: CONTACT_URL,
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
  const [source, setSource] = useState(FIRST_EXAMPLE.source);
  const [selectedExample, setSelectedExample] = useState(FIRST_EXAMPLE.id);
  const [sourceLabel, setSourceLabel] = useState<(typeof SOURCE_LABELS)[number]>(FIRST_EXAMPLE.sourceLabel);
  const [tradeHint, setTradeHint] = useState<(typeof TRADE_HINTS)[number]>(FIRST_EXAMPLE.tradeHint);
  const [record, setRecord] = useState<JobRecord | null>(null);
  const [original, setOriginal] = useState<JobRecord | null>(null);
  const [followUp, setFollowUp] = useState<FollowUp | null>(null);
  const [followUpDirty, setFollowUpDirty] = useState(false);
  const [followUpStale, setFollowUpStale] = useState(false);
  const [tab, setTab] = useState<Tab>('card');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [sourceInvalidated, setSourceInvalidated] = useState(false);
  const [consented, setConsented] = useState(false);
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

  const selectedFixture = EXAMPLES.find((example) => example.id === selectedExample);
  const fixtureMatches = Boolean(selectedFixture && source === selectedFixture.source);
  const evaluation = useMemo(() => record ? evaluateRecord(record) : null, [record]);
  const hasManualEdits = Boolean(record && FIELD_KEYS.some((key) => record.fields[key].status === 'user-entered')) || followUpDirty;
  const liveAvailable = config.liveEnabled && Boolean(config.turnstileSiteKey);

  useEffect(() => {
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
          contactUrl: safePublicUrl(value.contactUrl, CONTACT_URL),
        });
      }).catch(() => {
        if (!cancelled) setConfig({ ...DEFAULT_CONFIG, unavailableReason: 'We could not check live AI availability. Your text stays here; fictional examples still work.' });
      }).finally(() => { window.clearTimeout(timeout); if (!cancelled) setCheckingConfig(false); });
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout); };
  }, []);

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    if (copyFallback && copyDialog.current && !copyDialog.current.open) copyDialog.current.showModal();
  }, [copyFallback]);

  const clearResult = () => {
    requestRef.current?.abort();
    requestRef.current = null;
    submissionRef.current = null;
    setLoading(false);
    setRecord(null); setOriginal(null); setFollowUp(null);
    setFollowUpDirty(false); setFollowUpStale(false); setEvidence(null);
    setTab('card'); setError(null); setAnnouncement('');
  };

  function chooseExample(id: string) {
    if (id === selectedExample && fixtureMatches) return;
    const customSource = source.trim().length > 0 && !fixtureMatches;
    if ((hasManualEdits || customSource || record?.reviewed) && !window.confirm('Load another example? Your current message, job-card corrections, and follow-up edits will be discarded.')) return;
    const example = EXAMPLES.find((item) => item.id === id);
    clearResult();
    setSelectedExample(id);
    setSource(example?.source ?? ''); sourceRef.current = example?.source ?? '';
    setSourceLabel(example?.sourceLabel ?? 'other'); setTradeHint(example?.tradeHint ?? 'Auto-detect');
    setSourceInvalidated(false); setConsented(false); setTurnstileToken(null); setVerificationVersion((value) => value + 1);
    setAnnouncement(example ? `${example.title} loaded. Select Show prepared result to organize the example.` : 'Message cleared. Paste fictional or anonymized text to begin.');
  }

  function changeSource(next: string) {
    const hadResult = Boolean(record || original);
    clearResult();
    setSource(next); sourceRef.current = next;
    if (hadResult) setSourceInvalidated(true);
    setConsented(false); setTurnstileToken(null); setVerificationVersion((value) => value + 1);
    if (hadResult) setAnnouncement('The source changed. The previous result and review acknowledgment were cleared.');
  }

  function changeMetadata(next: { sourceLabel?: typeof sourceLabel; tradeHint?: typeof tradeHint }) {
    clearResult();
    if (next.sourceLabel !== undefined) setSourceLabel(next.sourceLabel);
    if (next.tradeHint !== undefined) setTradeHint(next.tradeHint);
    setSourceInvalidated((previous) => previous || Boolean(record));
    setConsented(false); setTurnstileToken(null); setVerificationVersion((value) => value + 1);
    if (record) setAnnouncement('The message options changed. The previous result and review acknowledgment were cleared.');
  }

  function acceptRecord(next: JobRecord) {
    setRecord(next); setOriginal(structuredClone(next));
    setFollowUp(generateFollowUp(next)); setFollowUpDirty(false); setFollowUpStale(false);
    setSourceInvalidated(false); setEvidence(null); setTab('card'); setError(null);
    const nextEvaluation = evaluateRecord(next);
    setAnnouncement(`Job-intake draft prepared. ${nextEvaluation.satisfied} of ${nextEvaluation.total} required checks satisfied. Review the details.`);
    window.requestAnimationFrame(() => {
      resultRef.current?.focus({ preventScroll: true });
      if (window.matchMedia('(max-width: 880px)').matches) resultRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
  }

  function showPreparedResult() {
    if (hasManualEdits && !window.confirm('Show the prepared result again? Your current job-card corrections and follow-up edits will be discarded.')) return;
    const next = loadExample(selectedExample, source);
    if (!next) { setError('This message no longer matches the example. Restore the unchanged example or use live AI when available.'); return; }
    acceptRecord(next);
  }

  async function analyzeText() {
    if (loading || record?.sourceMode === 'live' || !liveAvailable || !consented || !turnstileToken || !source.trim()) return;
    if (hasManualEdits && !window.confirm('Analyze this message again? Your current job-card corrections and follow-up edits will be replaced.')) return;
    const controller = new AbortController();
    requestRef.current?.abort(); requestRef.current = controller;
    const submittedSource = source;
    // Keep one identity for this unchanged submission, including uncertain network failures.
    // The durable server reservation then prevents a lost response from causing a second paid call.
    const identity = JSON.stringify([source, sourceLabel, tradeHint]);
    const requestId = submissionRef.current?.identity === identity ? submissionRef.current.requestId : crypto.randomUUID();
    submissionRef.current = { identity, requestId };
    setLoading(true); setError(null); setAnnouncement('Live AI extraction is processing the submitted text.');
    const timeout = window.setTimeout(() => controller.abort(), 65000);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceText: submittedSource, sourceLabel, tradeHint, turnstileToken, requestId }),
      });
      const payload = await response.json() as { record?: unknown; mode?: string; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || 'Live extraction did not complete. Your input is still here.');
      const parsed = jobRecordSchema.safeParse(payload.record);
      if (!parsed.success || parsed.data.sourceMode !== 'live' || parsed.data.reviewed || payload.mode !== 'live') throw new Error('The response could not be validated. Your input is still here; please try again or use an example.');
      if (requestRef.current === controller && sourceRef.current === submittedSource) acceptRecord(parsed.data);
    } catch (cause) {
      if (requestRef.current !== controller || sourceRef.current !== submittedSource) return;
      setError(cause instanceof DOMException && cause.name === 'AbortError'
        ? 'Live processing took too long. Your text has been retained. Try again later or use a fictional example.'
        : cause instanceof Error ? cause.message : 'Live extraction is unavailable. Your text has been retained.');
      setAnnouncement('Live extraction did not complete. Your text has been retained.');
    } finally {
      window.clearTimeout(timeout);
      if (requestRef.current === controller) {
        setLoading(false); requestRef.current = null;
        setTurnstileToken(null); setVerificationVersion((value) => value + 1);
      }
    }
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
    if ((source.trim().length > 0 || record || followUpDirty) && !window.confirm('Reset this intake? The message, job card, follow-up, and review acknowledgment will all be cleared.')) return;
    clearResult(); setSource(''); sourceRef.current = ''; setSelectedExample('');
    setSourceLabel('other'); setTradeHint('Auto-detect'); setSourceInvalidated(false);
    setConsented(false); setTurnstileToken(null); setVerificationVersion((value) => value + 1);
    setCopyFallback(null); setAnnouncement('Intake reset. All message and draft content has been cleared.');
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
        <a href={config.portfolioUrl} className="brand" aria-label="Cyber Pirate Labs portfolio">
          <img src="/images/cpl-logo-c.png" width="58" height="58" alt="Cyber Pirate Labs logo" />
          <span>CYBER PIRATE LABS<small>Practical tools. Built with intent.</small></span>
        </a>
        <div className="header-actions">
          <span className={`mode-pill ${liveAvailable ? 'mode-live' : ''}`}><span className="status-dot" />{liveAvailable ? 'Live AI available' : 'Portfolio demo'}</span>
          <a className="back-link" href={config.portfolioUrl}>Back to Portfolio <ArrowUpRight size={15} /></a>
        </div>
      </header>

      <main>
        <section className="intro" aria-labelledby="page-title">
          <div className="product-label"><span className="product-icon"><ClipboardCheck size={15} /></span> JOB INTAKE CLEANER <span className="label-divider" /> BUILT FOR THE TRADES</div>
          <h1 id="page-title">Turn messy messages into<br className="desktop-break" /> <span>organized job requests.</span></h1>
          <p>Extract the details, spot what’s missing, and prepare your follow-up—without retyping the whole conversation.</p>
          <div className="intro-note"><ShieldCheck size={15} /> No account needed. Try it with fictional information.</div>
        </section>

        <div className="workflow-strip" aria-label="Current workflow stage">
          <div className={`workflow-step ${source.trim() ? 'step-done' : ''}`}><span>{source.trim() ? <Check size={13} /> : '1'}</span><b>Message {source.trim() ? 'received' : 'input'}</b></div>
          <ArrowRight size={15} className="step-arrow" />
          <div className={`workflow-step ${record ? 'step-done' : loading ? 'step-active' : ''}`}><span>{loading ? <LoaderCircle size={13} className="spin" /> : record ? <Check size={13} /> : '2'}</span><b>{loading ? 'Extracting details' : record ? 'Details organized' : 'Organize details'}</b></div>
          <ArrowRight size={15} className="step-arrow" />
          <div className={`workflow-step ${record ? 'step-done' : ''}`}><span>{record ? <Check size={13} /> : '3'}</span><b>{record ? 'Information checked' : 'Check information'}</b></div>
          <ArrowRight size={15} className="step-arrow" />
          <div className={`workflow-step ${record ? record.reviewed && evaluation?.readyForReview ? 'step-done' : 'step-attention' : ''}`}><span>{record?.reviewed ? <Check size={13} /> : '4'}</span><b>{record?.reviewed ? 'Review acknowledged' : record ? 'Ready for your review' : 'Review & export'}</b></div>
        </div>

        <div className="workspace" id="workspace">
          <section className="panel input-panel" aria-labelledby="input-heading">
            <div className="panel-heading"><div><span className="eyebrow">01 / THE MESSAGE</span><h2 id="input-heading">Start with the messy part.</h2></div><MessageSquareText className="panel-heading-icon" size={23} /></div>
            <div className="input-content">
              <div className="example-picker">
                <label htmlFor="example">Try a fictional example</label>
                <div className="select-wrap"><select id="example" value={selectedExample} onChange={(event) => chooseExample(event.target.value)}>
                  <option value="">Your own message</option>
                  {EXAMPLES.map((example) => <option key={example.id} value={example.id}>{example.title}</option>)}
                </select><ChevronDown size={16} /></div>
                <p>Six scenarios. Fictional people, places, and contact details.</p>
              </div>

              <div className="input-meta">
                <div><label htmlFor="source-label">Message source</label><div className="select-wrap"><select id="source-label" value={sourceLabel} onChange={(event) => changeMetadata({ sourceLabel: event.target.value as typeof sourceLabel })}>{SOURCE_LABELS.map((label) => <option key={label} value={label}>{label.charAt(0).toUpperCase() + label.slice(1)}</option>)}</select><ChevronDown size={15} /></div></div>
                <div><label htmlFor="trade-hint">Trade hint <span className="optional">optional</span></label><div className="select-wrap"><select id="trade-hint" value={tradeHint} onChange={(event) => changeMetadata({ tradeHint: event.target.value as typeof tradeHint })}>{TRADE_HINTS.map((hint) => <option key={hint}>{hint}</option>)}</select><ChevronDown size={15} /></div></div>
              </div>

              <div className="message-label"><label htmlFor="source-message">Customer message or phone notes</label>{fixtureMatches && <span className="fictional-tag">Fictional example</span>}</div>
              <textarea className="source-textarea" id="source-message" rows={11} value={source} onChange={(event) => changeSource(event.target.value)} maxLength={config.maxInputChars} placeholder="Paste a fictional or anonymized message here. Include the customer’s own wording—even if it’s a little messy." aria-describedby="source-hint source-count" spellCheck="false" />
              <div className="textarea-footer"><span id="source-hint">One job request at a time.</span><span id="source-count">{source.length.toLocaleString()} / {config.maxInputChars.toLocaleString()}</span></div>

              {sourceInvalidated && <div className="notice notice-amber" role="status"><CircleAlert size={17} /><p>The message changed, so the previous result was cleared. {fixtureMatches ? 'Show the prepared result to start again.' : 'Use live AI, or restore the unchanged example.'}</p></div>}
              {selectedFixture && !fixtureMatches && <button className="text-button restore-button" onClick={() => {
                if (source.trim() && !window.confirm('Restore the unchanged example? Your current message will be discarded.')) return;
                clearResult(); setSource(selectedFixture.source); sourceRef.current = selectedFixture.source; setSourceInvalidated(false); setConsented(false);
                setAnnouncement('Unchanged fictional example restored. Select Show prepared result.');
              }}><RotateCcw size={14} /> Restore unchanged example</button>}

              {fixtureMatches ? <div className="primary-action-area">
                <button className="button button-primary button-full" onClick={showPreparedResult} disabled={loading}><Sparkles size={18} /> Show prepared result <ArrowRight size={17} /></button>
                <p className="mode-disclosure">Example mode — prepared sample data; no live AI call.</p>
              </div> : <div className="primary-action-area">
                <div className={`live-notice ${liveAvailable ? 'live-ready' : ''}`}><ShieldCheck size={17} /><div><strong>{checkingConfig ? 'Checking live availability' : liveAvailable ? 'Live AI extraction' : 'Live AI is currently unavailable'}</strong><p>{liveAvailable ? 'Public demo: use fictional or anonymized information. Your text is sent to an external AI provider. Review the output before using it.' : config.unavailableReason}</p></div></div>
                {liveAvailable && <>
                  <label className="consent-label"><input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} /><span>I understand this text will be processed by an external AI provider.</span></label>
                  {consented && <Turnstile key={verificationVersion} siteKey={config.turnstileSiteKey!} action="intake-analyze" onToken={receiveToken} />}
                </>}
                <button className="button button-primary button-full" onClick={() => void analyzeText()} disabled={loading || record?.sourceMode === 'live' || !source.trim() || !liveAvailable || !consented || !turnstileToken}>{loading ? <LoaderCircle className="spin" size={18} /> : record?.sourceMode === 'live' ? <Check size={18} /> : <Sparkles size={18} />}{loading ? 'Analyzing text…' : record?.sourceMode === 'live' ? 'Text analyzed' : 'Analyze text'}{!loading && <ArrowRight size={17} />}</button>
                {!liveAvailable && <p className="mode-disclosure">Choose a fictional example above to explore the full workflow.</p>}
              </div>}
              {error && <div className="notice notice-error" role="alert"><CircleAlert size={18} /><p>{error}</p></div>}

              <div className="input-bottom"><p><ShieldCheck size={14} /> Job content is kept in memory, not saved as history.</p><button className="text-button" onClick={reset}><RotateCcw size={14} /> Reset</button></div>

              {evidence && <div className="evidence-panel" ref={evidenceRef} tabIndex={-1} aria-label={`Source evidence for ${FIELD_LABELS[evidence.key]}`}>
                <div className="evidence-heading"><span><Quote size={16} /><strong>{FIELD_LABELS[evidence.key]} · source evidence</strong></span><button className="icon-button" onClick={() => setEvidence(null)} aria-label="Close source evidence"><X size={17} /></button></div>
                <HighlightedSource source={source} quotes={evidence.quotes} />
                <p className="small-note">{evidence.beforeCorrection ? 'This passage supported the original extraction. Your correction is user-entered; this quote does not verify it.' : 'A matching quote supports the extraction. It does not verify the underlying facts.'}</p>
              </div>}
            </div>
          </section>

          <section className="panel result-panel" aria-labelledby="result-heading" ref={resultRef} tabIndex={-1}>
            <div className="panel-heading"><div><span className="eyebrow">02 / THE JOB REQUEST</span><h2 id="result-heading">A little order. A clearer next step.</h2></div><FileCheck2 className="panel-heading-icon" size={23} /></div>
            {!record || !evaluation ? <div className="empty-result">
              <div className="empty-illustration" aria-hidden="true"><div className="paper-card"><div className="paper-top"><ClipboardCheck size={25} /><span>JOB REQUEST</span></div><div className="paper-line paper-line-long" /><div className="paper-line" /><div className="paper-check"><Check size={12} /><span /></div><div className="paper-check"><Check size={12} /><span /></div><div className="paper-check paper-check-pending"><CircleAlert size={12} /><span /></div></div><span className="illustration-spark"><Sparkles size={21} /></span></div>
              <h3>{loading ? 'Organizing your message…' : 'Your next job starts with a clear request.'}</h3>
              <p>{loading ? 'One live extraction is in progress. Your text will be checked before a draft appears here.' : 'Start with a fictional example or paste a message. The editable details, missing information, and follow-up will appear here.'}</p>
              <div className="empty-features"><span><CheckCheck size={16} /> Clear required checks</span><span><PencilLine size={15} /> Your corrections</span><span><ArrowDownToLine size={15} /> Usable exports</span></div>
              <div className="empty-tip"><span>TRY THE ELECTRICAL EXAMPLE</span><p>It has a phone number and a clear scope—<br />but the service address needs a follow-up.</p></div>
            </div> : <>
              <div className="result-mode"><span className={`record-label ${record.sourceMode === 'live' ? 'record-live' : ''}`}><span className="status-dot" />{record.sourceMode === 'example' ? 'Example mode' : 'Live AI extraction'}</span><span>{record.reviewed ? 'Review acknowledged' : 'Unreviewed draft'}</span></div>
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
                {followUp && <div className="followup-fields"><label htmlFor="followup-subject">Subject</label><input id="followup-subject" value={followUp.subject} maxLength={400} onChange={(event) => { setFollowUp({ ...followUp, subject: event.target.value }); setFollowUpDirty(true); }} /><label htmlFor="followup-body">Email-style draft</label><textarea id="followup-body" rows={12} value={followUp.body} maxLength={8000} onChange={(event) => { setFollowUp({ ...followUp, body: event.target.value }); setFollowUpDirty(true); }} /><details className="short-message"><summary>Short-message version <ChevronDown size={15} /></summary><label className="sr-only" htmlFor="followup-short">Short-message draft</label><textarea id="followup-short" rows={6} value={followUp.shortMessage} maxLength={8000} onChange={(event) => { setFollowUp({ ...followUp, shortMessage: event.target.value }); setFollowUpDirty(true); }} /><button className="text-button" onClick={() => void copyText(followUp.shortMessage, 'Short-message draft')}><Clipboard size={14} /> Copy short message</button></details></div>}
                <div className="followup-actions"><button className="button button-secondary" onClick={refreshFollowUp}><RotateCcw size={15} /> Refresh draft</button><button className="button button-primary" onClick={() => followUp && void copyText(`Subject: ${followUp.subject}\n\n${followUp.body}`, 'Follow-up draft')}><Clipboard size={15} /> Copy follow-up</button></div>
                <p className="small-note"><PencilLine size={13} /> {followUpDirty ? 'Your wording has been edited.' : 'Generated in this app from the job card; no additional AI call.'} This tool does not send messages.</p>
              </div>

              <div id="panel-original" role="tabpanel" aria-labelledby="tab-original" hidden={tab !== 'original'} className="tab-content original-content">
                <h3>The extraction, before your edits.</h3><p className="section-help">This read-only snapshot keeps the original result separate from your corrections. The job card and exports use your current edited values.</p>
                {original && <dl className="original-fields">{FIELD_KEYS.map((key) => <div key={key}><dt>{FIELD_LABELS[key]}<span className={`field-status status-${original.fields[key].status}`}>{STATUS_LABELS[original.fields[key].status]}</span></dt><dd>{original.fields[key].value ?? <span className="not-supplied">Not supplied</span>}{original.fields[key].evidence.length > 0 && <button className="evidence-button" onClick={() => showEvidence(key, original)} aria-label={`View original evidence for ${FIELD_LABELS[key]}`}><Quote size={13} /> Source</button>}</dd></div>)}</dl>}
              </div>

              <div className="export-bar"><div className="export-heading"><span><ArrowDownToLine size={17} /><strong>Take the job card with you</strong></span><small>Current edits · {record.reviewed ? 'review acknowledged' : 'unreviewed draft'}</small></div><div className="export-actions"><button className="button button-secondary" onClick={() => void copyText(formatJobCard(record), 'Job card')}><Clipboard size={15} /> Copy job card</button><button className="button button-secondary" onClick={() => { downloadText(exportCsv(record), 'job-intake.csv', 'text/csv;charset=utf-8'); setAnnouncement('CSV downloaded from the current job card.'); }}><FileSpreadsheet size={15} /> CSV</button><button className="button button-secondary" onClick={() => { downloadText(exportJson(record), 'job-intake.json', 'application/json;charset=utf-8'); setAnnouncement('JSON downloaded from the current job card.'); }}><FileJson size={15} /> JSON</button><button className="button button-secondary" onClick={() => window.print()}><Printer size={15} /> Print</button></div><p>Source mode and review status travel with the card. The full raw message is excluded.</p></div>
            </>}
          </section>
        </div>

        <section className="scope-section" aria-label="About this tool">
          <div className="scope-today"><span className="scope-icon"><CheckCheck size={22} /></span><div><span className="eyebrow">WHAT THIS DOES TODAY</span><h2>One message. A usable starting point.</h2><p>Organize a request, check the details, make corrections, and prepare an editable follow-up. Copy, download, or print the result for your own workflow.</p></div></div>
          <div className="scope-custom"><span className="scope-icon"><Layers3 size={22} /></span><div><span className="eyebrow">CUSTOMIZE FOR YOUR BUSINESS</span><h2>Your process can be the next step.</h2><p>Trade-specific intake and connections to your existing tools can be scoped as additional implementation with CPL.</p><a href={config.contactUrl} className="contact-cta">Get this for my business <ArrowUpRight size={15} /></a></div></div>
        </section>
        <details className="privacy-details"><summary><ShieldCheck size={16} /> Privacy & demo limits <ChevronDown size={15} /></summary><div><p>This is a public demonstration. Use fictional or anonymized information. Example mode uses prepared data without an AI call. In live mode, submitted text is processed by an external AI provider; provider retention policies still apply, and infrastructure may retain operational metadata. No claim of zero retention is made.</p><p>The app keeps the message and job card in browser memory for this session. It does not save job history. Review all output before real-world use. Basic format and completeness checks do not verify contact reachability, service addresses, safety, or availability. This tool does not send messages, estimate prices, book work, or dispatch crews.</p></div></details>
      </main>
      <footer className="site-footer"><span>Job Intake Cleaner <span className="footer-dot">·</span> Cyber Pirate Labs</span><a href={config.portfolioUrl}>Explore the CPL portfolio <ArrowUpRight size={13} /></a></footer>
    </div>

    <div className="announcement" role="status" aria-live="polite" aria-atomic="true">{announcement && <span key={announcement}><Check size={15} />{announcement}</span>}</div>
    <dialog ref={copyDialog} className="copy-dialog" onClose={() => setCopyFallback(null)} onCancel={() => setCopyFallback(null)} aria-labelledby="copy-dialog-heading"><div className="dialog-heading"><h2 id="copy-dialog-heading">Copy your text</h2><button className="icon-button" onClick={() => copyDialog.current?.close()} aria-label="Close copy dialog"><X size={20} /></button></div><p>Automatic clipboard access is unavailable. Select the text below and copy it with your keyboard.</p><textarea autoFocus readOnly value={copyFallback ?? ''} aria-label="Text to copy" onFocus={(event) => event.target.select()} rows={14} /><button className="button button-primary" onClick={() => copyDialog.current?.close()}>Done</button></dialog>

    {record && evaluation && <article className="print-card"><header><span>CYBER PIRATE LABS</span><h1>Job Intake Card</h1><p>{record.sourceMode === 'example' ? 'Example mode — prepared fictional sample data; no live AI call.' : 'Live AI extraction'}<br />{record.reviewed ? 'Human review acknowledged. This is not a booking or approval of the work.' : 'UNREVIEWED DRAFT — review before use.'}</p></header><p><strong>{evaluation.satisfied} of {evaluation.total} required checks satisfied.</strong> Completeness does not verify underlying facts.</p>{evaluation.issues.length > 0 && <section className="print-warnings"><h2>Open items & warnings</h2><ul>{evaluation.issues.map((issue) => <li key={issue.id}><strong>{issue.severity}:</strong> {issue.message}</li>)}</ul></section>}<dl>{FIELD_KEYS.map((key) => <div key={key}><dt>{FIELD_LABELS[key]}</dt><dd>{record.fields[key].value ?? ''}{record.fields[key].status === 'user-entered' && <small> (entered by user)</small>}</dd></div>)}</dl><footer>Prepared with Job Intake Cleaner by Cyber Pirate Labs. Full raw source message excluded.</footer></article>}
  </>;
}
