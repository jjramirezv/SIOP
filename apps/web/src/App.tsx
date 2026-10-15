import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Boxes, Loader2, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { REFERENCE_CASES } from './mocks/reference-cases';
import type { ReferenceCaseId } from './mocks/reference-cases';
import { apiClient } from './services/api-client';
import type { AnalysisRequest, AnalysisResponse } from './services/generated/types';
import { CaseSelectorBar } from './features/inventory-form/CaseSelectorBar';
import { InventoryForm } from './features/inventory-form/InventoryForm';
import { analysisFormSchema } from './features/inventory-form/schema';
import { StaleResultsBanner } from './features/results/StaleResultsBanner';
import { RecommendationHeroCard } from './features/results/RecommendationHeroCard';
import { SensitivityAndComparisonBar } from './features/results/SensitivityAndComparisonBar';
import { ProcedureAccordion } from './features/results/ProcedureAccordion';
import { AssistantPanel } from './features/assistant/AssistantPanel';

const AlternativesComparisonSection = lazy(() => import('./features/results/AlternativesComparisonSection')
  .then((module) => ({ default: module.AlternativesComparisonSection })));

type DataMode = 'mock' | 'real';

export function App() {
  const [activeCase, setActiveCase] = useState<ReferenceCaseId | null>('ily');
  const [defaultValues, setDefaultValues] = useState<AnalysisRequest>(() => structuredClone(REFERENCE_CASES.ily.request));
  const [draftRequest, setDraftRequest] = useState<AnalysisRequest>(() => structuredClone(REFERENCE_CASES.ily.request));
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [analyzedRequest, setAnalyzedRequest] = useState<AnalysisRequest | null>(null);
  const [mode, setMode] = useState<DataMode>(() => apiClient.useMocks ? 'mock' : 'real');
  const [resultMode, setResultMode] = useState<DataMode>(mode);
  const [formDirty, setFormDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assistantOpen, setAssistantOpen] = useState(false);
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
    const requestedMode: DataMode = apiClient.useMocks ? 'mock' : 'real';
    const currentSequence = ++sequence.current;
    setLoading(true);
    setError('');
    try {
      const response = await apiClient.runAnalysis(payload);
      if (!mounted.current || currentSequence !== sequence.current) return;
      setResult(response);
      setAnalyzedRequest(payload);
      setResultMode(requestedMode);
      setFormDirty(false);
    } catch (cause) {
      if (!mounted.current || currentSequence !== sequence.current) return;
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

  function changeMode(nextMode: DataMode) {
    apiClient.setUseMocks(nextMode === 'mock');
    setMode(nextMode);
    setFormDirty(true);
    void analyze(draftRequest);
  }

  function applyAssistantDraft(editedDraft: Partial<AnalysisRequest>): boolean {
    const presentValues = Object.fromEntries(Object.entries(editedDraft).filter(([, value]) => value !== undefined));
    const merged = analysisFormSchema.safeParse({ ...structuredClone(draftRequest), ...structuredClone(presentValues) });
    if (!merged.success) return false;
    quickRecalculate(merged.data);
    return true;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased selection:bg-indigo-100 selection:text-indigo-900">
      <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur border-b border-slate-200 px-4 lg:px-8 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Boxes aria-hidden="true" size={24} className="hidden shrink-0 text-slate-900 sm:block" />
          <div className="min-w-0">
            <p className="font-bold tracking-tight">SIOP</p>
            <p className="hidden truncate text-xs text-slate-500 md:block">Optimización de Pedidos con Rompimiento de Precios</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label htmlFor="data-mode" className="sr-only">Modo de datos</label>
          <select id="data-mode" value={mode} onChange={(event) => changeMode(event.target.value as DataMode)} disabled={loading}
            className="max-w-[128px] rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 disabled:opacity-50 sm:max-w-[205px]">
            <option value="mock">Modo Simulado (Mocks)</option>
            <option value="real">API Real (FastAPI)</option>
          </select>
          <span className={clsx('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', mode === 'mock' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900')}>
            <span className="sm:hidden">{mode === 'mock' ? 'Demo' : 'Real'}</span><span className="hidden sm:inline">{mode === 'mock' ? 'Simulado' : 'API Real'}</span>
          </span>
          <button ref={assistantTrigger} type="button" onClick={() => setAssistantOpen((open) => !open)} aria-label="Asistente IA (Texto, Foto y Voz)" aria-expanded={assistantOpen} aria-controls="assistant-panel"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 p-2 text-xs font-semibold text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 lg:px-3 cursor-pointer">
            <Sparkles size={17} aria-hidden="true" /><span className="hidden lg:inline">Asistente IA (Texto, Foto y Voz)</span>
          </button>
        </div>
      </header>
      <div className="flex flex-col-reverse items-start xl:flex-row">
      <main className="w-full min-w-0 flex-1 max-w-[1600px] mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-12 space-y-5">
          <div>
            <h1 id="inventory-title" className="text-2xl font-semibold tracking-tight">Planifica tu próxima compra</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Compara precios por volumen, revisa el costo anual y decide cuánto pedir con tus datos de ventas y almacenamiento.</p>
          </div>
          <CaseSelectorBar activeCase={activeCase} onSelectCase={selectCase} isLoading={loading} />
        </div>
        <section className="lg:col-span-5 space-y-5 min-w-0" aria-labelledby="inventory-title">
          <InventoryForm defaultValues={defaultValues} onSubmit={(data) => void analyze(data)} onFormDirtyChange={onFormDirtyChange} onValuesChange={setDraftRequest} isLoading={loading} />
        </section>
        <section className="lg:col-span-7 space-y-6 min-w-0" aria-label="Resultados del análisis" aria-busy={loading}>
          <StaleResultsBanner isStale={stale} isLoading={loading} />
          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-700">{error}</p>}
          {loading && <p role="status" className="flex items-center gap-2 text-sm text-slate-600"><Loader2 size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />Calculando con los datos actuales…</p>}
          {result && analyzedRequest ? (
            <div data-testid="results-panel" className={clsx('space-y-6', stale && 'opacity-60')}>
              <RecommendationHeroCard recommended={result.recommended} currency={analyzedRequest.currency} productName={analyzedRequest.product_name} mode={resultMode} />
              <SensitivityAndComparisonBar response={result} request={draftRequest} currency={analyzedRequest.currency} onQuickRecalculate={quickRecalculate} isLoading={loading} useMocks={mode === 'mock'} />
              <Suspense fallback={<div className="h-[300px] rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Cargando comparación de alternativas…</div>}>
                <AlternativesComparisonSection response={result} currency={analyzedRequest.currency} />
              </Suspense>
              <ProcedureAccordion procedure={result.procedure} />
            </div>
          ) : !loading && <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 text-sm leading-6 text-slate-500">Completa los datos y presiona «Calcular compra óptima». Puedes cargar un caso de referencia para empezar.</div>}
        </section>
      </main>
      <AssistantPanel isOpen={assistantOpen} onClose={() => { setAssistantOpen(false); assistantTrigger.current?.focus(); }} currentDraft={draftRequest} currentResult={!loading && !formDirty && resultMode === mode ? result : null} onApplyDraft={applyAssistantDraft} isCalculating={loading} useMocks={mode === 'mock'} />
      </div>
      {!assistantOpen && <button type="button" onClick={() => setAssistantOpen(true)} aria-label="Abrir asistente IA" className="fixed bottom-4 right-4 z-20 inline-flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 lg:hidden"><Sparkles size={22} aria-hidden="true" /></button>}
    </div>
  );
}
