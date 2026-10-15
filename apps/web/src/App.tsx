import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { REFERENCE_CASES } from './features/inventory-form/reference-cases';
import type { ReferenceCaseId } from './features/inventory-form/reference-cases';
import { ApiClientError, apiClient } from './services/api-client';
import type { AnalysisRequest, AnalysisResponse } from './services/generated/types';
import { CaseSelectorBar } from './features/inventory-form/CaseSelectorBar';
import { InventoryForm } from './features/inventory-form/InventoryForm';
import type { FormSection } from './features/inventory-form/InventoryForm';
import { analysisFormSchema } from './features/inventory-form/schema';
import { StaleResultsBanner } from './features/results/StaleResultsBanner';
import { RecommendationHeroCard } from './features/results/RecommendationHeroCard';
import { DecisionWorkspace } from './features/results/DecisionWorkspace';
import { AssistantPanel } from './features/assistant/AssistantPanel';


export function App() {
  const [activeCase, setActiveCase] = useState<ReferenceCaseId | null>('ily');
  const [defaultValues, setDefaultValues] = useState<AnalysisRequest>(() => structuredClone(REFERENCE_CASES.ily.request));
  const [draftRequest, setDraftRequest] = useState<AnalysisRequest>(() => structuredClone(REFERENCE_CASES.ily.request));
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [analyzedRequest, setAnalyzedRequest] = useState<AnalysisRequest | null>(null);
  const [connection, setConnection] = useState<'checking' | 'online' | 'offline'>('checking');
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [focusSection, setFocusSection] = useState<{ section: FormSection; revision: number }>();
  const assistantTrigger = useRef<HTMLButtonElement>(null);
  const mounted = useRef(false);
  const sequence = useRef(0);
  const stale = result !== null && formDirty;

  const analyze = useCallback(async (data: AnalysisRequest) => {
    const parsed = analysisFormSchema.safeParse(data);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      setFormDirty(true);
      return;
    }
    const payload = structuredClone(parsed.data);
    const currentSequence = ++sequence.current;
    setLoading(true);
    setError('');
    try {
      const response = await apiClient.runAnalysis(payload);
      if (!mounted.current || currentSequence !== sequence.current) return;
      setResult(response);
      setAnalyzedRequest(payload);
      setConnection('online');
      setFormDirty(false);
    } catch (cause) {
      if (!mounted.current || currentSequence !== sequence.current) return;
      if (cause instanceof ApiClientError && (cause.code === 'network' || cause.code === 'timeout')) setConnection('offline');
      setError(cause instanceof Error ? cause.message : 'No pudimos completar el análisis. Vuelve a intentarlo.');
      setFormDirty(true);
    } finally {
      if (mounted.current && currentSequence === sequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void analyze(structuredClone(REFERENCE_CASES.ily.request));
    return () => { mounted.current = false; sequence.current += 1; };
  }, [analyze]);

  const onFormDirtyChange = useCallback((isDirty: boolean) => {
    setFormDirty(isDirty);
    if (isDirty) setActiveCase(null);
  }, []);

  function selectCase(id: ReferenceCaseId) {
    const request = structuredClone(REFERENCE_CASES[id].request);
    setActiveCase(id);
    setDefaultValues(request);
    setDraftRequest(request);
    setFormDirty(true);
    setError('');
  }

  function quickRecalculate(updatedRequest: AnalysisRequest) {
    const updated = structuredClone(updatedRequest);
    setDefaultValues(updated);
    setDraftRequest(updated);
    setActiveCase(null);
    setFormDirty(true);
    void analyze(updated);
  }

  const refreshHealth = useCallback(async () => {
    setConnection('checking');
    try {
      const health = await apiClient.checkHealth();
      if (mounted.current) { setConnection('online'); setAiAvailable(health.ai_available); }
    } catch { if (mounted.current) { setConnection('offline'); setAiAvailable(null); } }
  }, []);

  useEffect(() => { void refreshHealth(); }, [refreshHealth]);

  function applyAssistantDraft(editedDraft: Partial<AnalysisRequest>): boolean {
    const presentValues = Object.fromEntries(Object.entries(editedDraft).filter(([, value]) => value !== undefined));
    const merged = analysisFormSchema.safeParse({ ...structuredClone(draftRequest), ...structuredClone(presentValues) });
    if (!merged.success) return false;
    quickRecalculate(merged.data);
    return true;
  }

  function editSection(section: FormSection) {
    setFocusSection((previous) => ({ section, revision: (previous?.revision ?? 0) + 1 }));
  }

  return (
    <div className="decision-app">
      <a href="#decision-main" className="desk-skip-link">Saltar al análisis</a>
      <header className="desk-header">
        <div className="desk-brand">
          <span className="desk-wordmark">SIOP</span>
          <div className="desk-brand-description"><h1>Mesa de decisión</h1><p>Decide hoy tu mejor compra de inventario</p></div>
        </div>
        <div className="desk-header-actions">
          <button type="button" onClick={() => void refreshHealth()} className={clsx('desk-mode', connection === 'online' ? 'is-real' : 'is-offline')} title="Comprobar conexión con la API" aria-label="Comprobar conexión con la API">
            <span role="status">{connection === 'online' ? 'Motor conectado' : connection === 'checking' ? 'Conectando…' : 'API sin conexión'}</span>
          </button>
          <button ref={assistantTrigger} type="button" onClick={() => setAssistantOpen((open) => !open)} aria-label="Asistente IA (Texto, Foto y Voz)" aria-expanded={assistantOpen} aria-controls="assistant-panel"
            className="desk-ai-trigger">
            <Sparkles size={18} aria-hidden="true" /><span>Asistente IA</span><i aria-hidden="true">✦</i>
          </button>
        </div>
      </header>
      <main id="decision-main" className="desk-layout">
        <section className="desk-inspector desk-glass" aria-label="Configurar el ejercicio">
          <InventoryForm defaultValues={defaultValues} onSubmit={(data) => void analyze(data)} onFormDirtyChange={onFormDirtyChange} onValuesChange={setDraftRequest} isLoading={loading}
            focusSection={focusSection} onQuickRecalculate={quickRecalculate}
            caseSelector={<CaseSelectorBar activeCase={activeCase} onSelectCase={selectCase} isLoading={loading} />} />
        </section>
        <section className="desk-results" aria-label="Resultados del análisis" aria-busy={loading}>
          <StaleResultsBanner isStale={stale} isLoading={loading} />
          {error && <p role="alert" className="desk-error">{error}</p>}
          {loading && <p role="status" className="desk-loading"><Loader2 size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />Calculando con los datos actuales…</p>}
          {result && analyzedRequest ? (
            <div data-testid="results-panel" className={clsx('desk-result-stack', stale && 'opacity-60')}>
              <RecommendationHeroCard recommended={result.recommended} currency={analyzedRequest.currency} productName={analyzedRequest.product_name} comparison={result.current_comparison} />
              <div hidden={assistantOpen}><DecisionWorkspace response={result} currency={analyzedRequest.currency} onEdit={editSection} /></div>
            </div>
          ) : !loading && <div className="desk-glass desk-empty">Completa los datos y presiona «Calcular mejor compra». Puedes cargar un caso de referencia para empezar.</div>}
          <AssistantPanel isOpen={assistantOpen} onClose={() => { setAssistantOpen(false); assistantTrigger.current?.focus(); }} currentDraft={draftRequest} currentResult={!loading && !formDirty ? result : null} onApplyDraft={applyAssistantDraft} isCalculating={loading} aiAvailable={aiAvailable} />
        </section>
      </main>
    </div>
  );
}
