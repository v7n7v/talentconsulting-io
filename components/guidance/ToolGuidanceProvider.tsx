'use client';

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useStore } from '@/lib/store';
import { TacoText } from '@/components/BrandLogo';
import { getToolHelpOverview, type ToolHelpOverview } from '@/lib/tool-guidance-overview';
import {
  guidanceAvailability, guidanceInvitationKey, guidanceScope, guidanceUnavailableText,
  initialGuidancePosition, moveGuidancePosition, resolveGuidancePosition,
  type ToolGuidanceConfig, type ToolGuidancePosition,
} from '@/lib/tool-guidance';
import { guidanceScrollContainer, guidanceTargetVisibleRect, hasCompetingGuidanceModal, isGuidanceSurfaceActive, isGuidanceTargetVisible, resolveGuidanceSurface, resolveGuidanceTarget, showGuidanceTarget } from '@/lib/tool-guidance-target';
import { guidanceModalPanelPlacement, guidancePanelPlacement } from '@/lib/tool-guidance-geometry';
import './tool-guidance.css';

export { isGuidanceShortcutBlocked } from '@/lib/tool-guidance-shortcuts';
export type { ToolGuidanceConfig, ToolGuidanceChapter, ToolGuidanceStep, ToolGuidanceAvailability } from '@/lib/tool-guidance';

interface Binding { token: object; config: ToolGuidanceConfig }
interface Session { toolId: string; scope: string; position: ToolGuidancePosition | null; mode: 'guided' | 'overview'; surface: HTMLElement | null }
interface GuidanceController {
  bindings: Binding[];
  session: Session | null;
  panelId: string;
  owner: string | null;
  invitationRevision: number;
  register: (token: object, config: ToolGuidanceConfig) => void;
  unregister: (token: object) => void;
  start: (toolId: string, trigger?: HTMLElement | null) => void;
  close: () => void;
  dismissInvitation: (config: ToolGuidanceConfig) => void;
}

const GuidanceContext = createContext<GuidanceController | null>(null);
// Session memory contains only scope IDs/version, never text or persisted user data.
const dismissedInvitations = new Set<string>();

export function ToolGuidanceProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const owner = useStore(state => state.user?.uid || null);
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [invitationRevision, setInvitationRevision] = useState(0);
  const [reservedHeight, setReservedHeight] = useState(0);
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const panelId = useId();
  const config = bindings.filter(binding => binding.config.toolId === session?.toolId).at(-1)?.config;
  const scope = guidanceScope(pathname, owner, config);
  const validSurface = !session?.surface || (typeof document !== 'undefined' && isGuidanceSurfaceActive(document, session.surface, config?.modalSurface));
  const currentSession = session?.scope === scope && validSurface ? session : null;
  const latest = useRef({ bindings, owner, pathname });
  latest.current = { bindings, owner, pathname };

  const register = useCallback((token: object, nextConfig: ToolGuidanceConfig) => {
    setBindings(previous => {
      const index = previous.findIndex(binding => binding.token === token);
      if (index < 0) return [...previous, { token, config: nextConfig }];
      return previous.map((binding, position) => position === index ? { token, config: nextConfig } : binding);
    });
  }, []);
  const unregister = useCallback((token: object) => {
    setBindings(previous => previous.filter(binding => binding.token !== token));
  }, []);
  const dismissInvitation = useCallback((nextConfig: ToolGuidanceConfig) => {
    dismissedInvitations.add(guidanceInvitationKey(latest.current.owner, nextConfig));
    setInvitationRevision(value => value + 1);
  }, []);
  const close = useCallback(() => {
    const focusedInPanel = Boolean(panelRef.current?.contains(document.activeElement));
    setSession(null);
    const current = latest.current;
    const currentConfig = current.bindings.filter(binding => binding.config.toolId === session?.toolId).at(-1)?.config;
    const currentScope = guidanceScope(current.pathname, current.owner, currentConfig);
    // Explicit Close may restore a visible trigger in this exact current workspace.
    // Owner/context/route invalidation never restores a trigger from the obsolete scope.
    if (focusedInPanel && session?.scope === currentScope && !hasCompetingGuidanceModal(document, session.surface)) {
      const validTrigger = (element: HTMLElement | null) => Boolean(element && document.defaultView && isGuidanceTargetVisible(element, document.defaultView) && (!session.surface || session.surface.contains(element)));
      const trigger = validTrigger(triggerRef.current) ? triggerRef.current : Array.from((session.surface || document).querySelectorAll<HTMLElement>('[data-tool-help]')).find(element => element.getAttribute('data-tool-help') === session.toolId && validTrigger(element));
      // A valid trigger may have scrolled away during Show target. Let focus reveal it.
      trigger?.focus();
    }
  }, [session?.toolId, session?.scope, session?.surface]);
  const start = useCallback((toolId: string, trigger?: HTMLElement | null) => {
    const current = latest.current;
    const matching = current.bindings.filter(binding => binding.config.toolId === toolId).at(-1)?.config;
    if (!matching && !getToolHelpOverview(toolId)) return;
    const explicitTrigger = trigger || (document.activeElement as HTMLElement | null);
    const surface = resolveGuidanceSurface(document, matching?.modalSurface, explicitTrigger);
    if (matching?.modalSurface && !surface) return;
    if (hasCompetingGuidanceModal(document, surface)) return;
    triggerRef.current = explicitTrigger;
    if (matching) {
      dismissedInvitations.add(guidanceInvitationKey(current.owner, matching));
      setInvitationRevision(value => value + 1);
    }
    setSession({
      toolId, scope: guidanceScope(current.pathname, current.owner, matching),
      position: matching ? initialGuidancePosition(matching) : null,
      mode: matching && initialGuidancePosition(matching) ? 'guided' : 'overview',
      surface,
    });
  }, []);

  // Invalidation only closes. It never focuses, scrolls, or restores obsolete work.
  useEffect(() => { setSession(previous => previous?.scope === scope && validSurface ? previous : null); }, [scope, validSurface]);
  useEffect(() => {
    if (!currentSession?.surface) return;
    const surface = currentSession.surface;
    const update = () => {
      if (!isGuidanceSurfaceActive(document, surface, config?.modalSurface)) setSession(previous => previous?.scope === currentSession.scope ? null : previous);
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'inert', 'aria-hidden', 'aria-modal', 'open', 'style', 'class', 'data-guide-surface'] });
    return () => observer.disconnect();
  }, [currentSession?.surface, config?.modalSurface]);
  useLayoutEffect(() => {
    if (!currentSession) return;
    document.documentElement.setAttribute('data-tool-guidance-open', '');
    return () => document.documentElement.removeAttribute('data-tool-guidance-open');
  }, [currentSession]);
  useEffect(() => {
    if (!currentSession) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || hasCompetingGuidanceModal(document, currentSession.surface)) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    document.addEventListener('keydown', keydown, true);
    return () => document.removeEventListener('keydown', keydown, true);
  }, [Boolean(currentSession), currentSession?.surface, close]);

  const controller = useMemo(() => ({
    bindings, session: currentSession, panelId, owner, invitationRevision,
    register, unregister, start, close, dismissInvitation,
  }), [bindings, currentSession, panelId, owner, invitationRevision, register, unregister, start, close, dismissInvitation]);

  const panel = currentSession ? (
    <ToolGuidancePanel
      config={config?.toolId === currentSession.toolId ? config : undefined}
      session={currentSession}
      setSession={setSession}
      panelRef={panelRef}
      onPanelHeight={setReservedHeight}
      reservedHeight={reservedHeight}
    />
  ) : null;

  return (
    <GuidanceContext.Provider value={controller}>
      {children}
      {currentSession && !currentSession.surface && <div aria-hidden="true" style={{ height: reservedHeight }} />}
      {currentSession?.surface ? createPortal(panel, currentSession.surface) : panel}
    </GuidanceContext.Provider>
  );
}

/** Mount once per route. Tool state supplies availability; the DOM supplies location only. */
export function useToolGuidance(config: ToolGuidanceConfig) {
  const controller = useContext(GuidanceContext);
  const token = useRef<object>({});
  const register = controller?.register;
  const unregister = controller?.unregister;
  const fingerprint = JSON.stringify(config);
  useLayoutEffect(() => { register?.(token.current, config); }, [register, fingerprint]);
  useEffect(() => {
    const currentToken = token.current;
    return () => unregister?.(currentToken);
  }, [unregister]);
  return {
    start: () => controller?.start(config.toolId),
    close: () => controller?.close(),
    isOpen: controller?.session?.toolId === config.toolId,
  };
}

export function ToolGuidanceBinding({ config }: { config: ToolGuidanceConfig }) {
  useToolGuidance(config);
  return null;
}

export function useToolGuidanceHelp(toolId: string) {
  const controller = useContext(GuidanceContext);
  const config = controller?.bindings.filter(binding => binding.config.toolId === toolId).at(-1)?.config;
  return {
    title: config?.title || getToolHelpOverview(toolId)?.title,
    available: Boolean(config || getToolHelpOverview(toolId)),
    isOpen: controller?.session?.toolId === toolId,
    panelId: controller?.panelId,
    open: (trigger: HTMLElement) => controller?.start(toolId, trigger),
  };
}

export function ToolGuidanceInvitation({ toolId }: { toolId: string }) {
  const controller = useContext(GuidanceContext);
  const config = controller?.bindings.filter(binding => binding.config.toolId === toolId).at(-1)?.config;
  if (!controller || !config || controller.session || dismissedInvitations.has(guidanceInvitationKey(controller.owner, config))) return null;
  return (
    <div className="tool-guidance-invitation" data-guidance-controls>
      <button type="button" className="btn-secondary min-h-11 whitespace-nowrap px-4 py-2 text-sm" onClick={event => controller.start(toolId, event.currentTarget)}>
        Show me how
      </button>
      <button type="button" className="btn-secondary btn-icon" aria-label="Dismiss guidance invitation" onClick={() => controller.dismissInvitation(config)}>
        <span className="material-symbols-rounded" aria-hidden="true">close</span>
      </button>
    </div>
  );
}

interface TargetView {
  status: 'ready' | 'offscreen' | 'waiting' | 'missing' | 'paused';
  rect: { top: number; left: number; width: number; height: number } | null;
}

function useGuidanceTarget(anchor: string | undefined, enabled: boolean, surface: HTMLElement | null) {
  const [view, setView] = useState<TargetView>({ status: 'missing', rect: null });
  useEffect(() => {
    if (!enabled || !anchor) { setView({ status: 'missing', rect: null }); return; }
    let attempts = 0;
    let frame = 0;
    let observed: HTMLElement | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    const update = () => {
      if (hasCompetingGuidanceModal(document, surface)) {
        setView(previous => previous.status === 'paused' ? previous : { status: 'paused', rect: null });
        return;
      }
      const target = resolveGuidanceTarget(document, anchor, surface);
      if (!target) {
        const status = attempts < 24 ? 'waiting' : 'missing';
        setView(previous => previous.status === status ? previous : { status, rect: null });
        return;
      }
      if (timer) { clearInterval(timer); timer = undefined; }
      if (observed !== target) { resize?.disconnect(); resize?.observe(target); observed = target; }
      const visible = guidanceTargetVisibleRect(document, target, surface);
      const container = surface?.getBoundingClientRect();
      const rect = visible ? { ...visible, top: visible.top - (container?.top || 0) + (surface?.scrollTop || 0), left: visible.left - (container?.left || 0) + (surface?.scrollLeft || 0) } : null;
      const next: TargetView = rect ? { status: 'ready', rect } : { status: 'offscreen', rect: null };
      setView(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(); }); };
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'inert', 'aria-hidden', 'aria-modal', 'open', 'class', 'style', 'data-guide'] });
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);
    timer = setInterval(() => { attempts += 1; update(); if (attempts >= 24 && timer) { clearInterval(timer); timer = undefined; } }, 150);
    update();
    return () => {
      if (timer) clearInterval(timer);
      if (frame) cancelAnimationFrame(frame);
      resize?.disconnect(); mutations.disconnect();
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, true);
    };
  }, [anchor, enabled, surface]);
  return view;
}

function ToolGuidancePanel({ config, session, setSession, panelRef, onPanelHeight, reservedHeight }: {
  config?: ToolGuidanceConfig;
  session: Session;
  setSession: React.Dispatch<React.SetStateAction<Session | null>>;
  panelRef: React.RefObject<HTMLElement | null>;
  onPanelHeight: (height: number) => void;
  reservedHeight: number;
}) {
  const controller = useContext(GuidanceContext)!;
  const selected = config ? resolveGuidancePosition(config, session.position) : null;
  const availability = selected ? guidanceAvailability(selected.chapter, selected.step) : null;
  const guided = session.mode === 'guided' && selected;
  const targetEnabled = Boolean(guided && (availability?.state === 'available' || availability?.state === 'complete'));
  const target = useGuidanceTarget(guided ? selected.step.anchor : undefined, targetEnabled, session.surface);
  const [paused, setPaused] = useState(false);
  const [scrollContainer, setScrollContainer] = useState<HTMLElement | null>(null);
  const [placement, setPlacement] = useState<CSSProperties | undefined>();
  useLayoutEffect(() => {
    const surface = session.surface;
    const originalPosition = surface?.style.position;
    const needsPosition = surface && window.getComputedStyle(surface).position === 'static';
    if (needsPosition) surface.style.position = 'relative';
    const panel = panelRef.current;
    // Focus moves only on the user's explicit Help opening. This region is not a trap.
    panel?.focus({ preventScroll: true });
    // Cleanup restores presentation only. Explicit Close validates focus in the provider.
    return () => { if (needsPosition) surface.style.position = originalPosition || ''; };
  }, []);
  useEffect(() => {
    const surface = session.surface;
    setScrollContainer(surface && targetEnabled ? guidanceScrollContainer(document, resolveGuidanceTarget(document, selected?.step.anchor, surface), surface) : null);
  }, [session.surface, targetEnabled, selected?.step.anchor, target.status]);
  useEffect(() => {
    const update = () => {
      const virtual = window.visualViewport;
      const currentTarget = session.surface ? resolveGuidanceTarget(document, selected?.step.anchor, session.surface) : null;
      const next: CSSProperties = session.surface ? guidanceModalPanelPlacement({
        surface: session.surface.getBoundingClientRect(),
        viewport: { top: virtual?.offsetTop || 0, left: virtual?.offsetLeft || 0, width: virtual?.width || window.innerWidth, height: virtual?.height || window.innerHeight },
        target: currentTarget === session.surface ? null : currentTarget?.getBoundingClientRect(),
        scrollable: Boolean(guidanceScrollContainer(document, currentTarget, session.surface)),
        scrollTop: session.surface.scrollTop, scrollLeft: session.surface.scrollLeft,
      }) : guidancePanelPlacement({ width: virtual?.width || window.innerWidth, height: virtual?.height || window.innerHeight, offsetTop: virtual?.offsetTop, offsetLeft: virtual?.offsetLeft, layoutWidth: window.innerWidth, layoutHeight: window.innerHeight });
      setPlacement(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      onPanelHeight((panelRef.current?.getBoundingClientRect().height || 0) + 32);
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (panelRef.current) observer?.observe(panelRef.current);
    if (session.surface) observer?.observe(session.surface);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    document.addEventListener('scroll', update, true);
    update();
    return () => {
      observer?.disconnect(); window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
      document.removeEventListener('scroll', update, true);
      onPanelHeight(0);
    };
  }, [onPanelHeight, session.surface, selected?.step.anchor, target.status]);
  useEffect(() => {
    const update = () => setPaused(hasCompetingGuidanceModal(document, session.surface));
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'aria-modal', 'open', 'style', 'class'] });
    update();
    return () => observer.disconnect();
  }, [session.surface]);
  const title = config?.title || getToolHelpOverview(session.toolId)?.title || 'this tool';
  const overview: ToolHelpOverview = getToolHelpOverview(session.toolId) || {
    title, subtitle: 'Read the workflow, then make choices in the tool when you are ready.',
    steps: config?.chapters.flatMap(chapter => chapter.steps.map(step => ({ title: step.title, description: step.description }))) || [],
  };
  const positions = config?.chapters.flatMap(chapter => chapter.steps.map(step => ({ chapterId: chapter.id, stepId: step.id }))) || [];
  const index = positions.findIndex(item => item.chapterId === selected?.chapter.id && item.stepId === selected?.step.id);
  const isLast = index === positions.length - 1;
  const preferredChapter = config?.chapters.find(chapter => chapter.id === config.preferredChapterId && chapter.steps.length > 0);
  const waiting = availability && availability.state !== 'available' && availability.state !== 'complete';
  const move = (direction: -1 | 1) => {
    if (!config || paused) return;
    const position = moveGuidancePosition(config, session.position, direction);
    setSession(previous => previous?.scope === session.scope ? { ...previous, position } : previous);
  };
  const chooseChapter = (chapterId: string) => {
    const chapter = config?.chapters.find(item => item.id === chapterId);
    if (!chapter?.steps.length || paused) return;
    setSession(previous => previous?.scope === session.scope ? { ...previous, position: { chapterId, stepId: chapter.steps[0].id }, mode: 'guided' } : previous);
  };

  return (
    <>
      {scrollContainer && !paused && createPortal(<div aria-hidden="true" style={{ height: reservedHeight, flexShrink: 0 }} />, scrollContainer)}
      {targetEnabled && !paused && target.rect && <div className="tool-guidance-outline" style={{ ...target.rect, position: session.surface ? 'absolute' : 'fixed' }} aria-hidden="true" />}
      <aside id={controller.panelId} ref={panelRef} tabIndex={-1} role="region" aria-label={`How to use ${title}`} className="tool-guidance-panel glass-card" style={placement} data-guidance-controls data-guidance-panel hidden={paused}>
        <div className="tool-guidance-panel-heading">
          <h2 className="min-w-0 text-base font-semibold"><TacoText text={`How to use ${title}`} /></h2>
          <button type="button" className="btn-secondary min-h-11 min-w-11 px-2" onClick={controller.close} aria-label="Close guidance">
            <span className="material-symbols-rounded" aria-hidden="true">close</span>
          </button>
        </div>
        <div className="tool-guidance-panel-body">
          {guided ? (
            <>
              {config && config.chapters.length > 1 && (
                <label className="tool-guidance-chapter-picker">
                  <span className="tool-guidance-caption">Guide chapter</span>
                  <select className="min-h-11 min-w-0 w-full px-2 text-sm" value={selected.chapter.id} onChange={event => chooseChapter(event.target.value)}>
                    {config.chapters.filter(chapter => chapter.steps.length).map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
                  </select>
                </label>
              )}
              <p className="tool-guidance-caption">{selected.chapter.title} · Explanation {index + 1} of {positions.length}</p>
              {preferredChapter && preferredChapter.id !== selected.chapter.id && <button type="button" className="btn-secondary min-h-11 px-4 py-2 text-sm" onClick={() => chooseChapter(preferredChapter.id)}>Guide this section: {preferredChapter.title}</button>}
              <div role="status" aria-live="polite" aria-atomic="true">
                <h3 className="text-sm font-semibold"><TacoText text={selected.step.title} /></h3>
                <p className="tool-guidance-description"><TacoText text={selected.step.description} /></p>
                {waiting && <p className="tool-guidance-prerequisite">{guidanceUnavailableText(availability.state, availability.reason)}</p>}
                {targetEnabled && target.status === 'offscreen' && <p className="tool-guidance-prerequisite">This control is outside the current view. Use Show target to scroll to it.</p>}
                {targetEnabled && selected.step.anchor && (target.status === 'waiting' || target.status === 'missing') && (
                  <p className="tool-guidance-prerequisite">{selected.step.targetUnavailableReason || 'This control is not visible in the current view. Use the instructions above, or open the relevant section yourself. The guide will highlight it when it becomes visible.'}</p>
                )}
              </div>
              <div className="tool-guidance-actions">
                <button type="button" className="btn-secondary min-h-11 px-4 py-2 text-sm" onClick={() => move(-1)} disabled={index <= 0}>Back</button>
                <button type="button" className="btn-primary min-h-11 px-4 py-2 text-sm" onClick={isLast ? controller.close : () => move(1)} disabled={!isLast && Boolean(waiting)}>{isLast ? 'Close guide' : 'Next'}</button>
                {targetEnabled && selected.step.anchor && <button type="button" className="btn-secondary min-h-11 px-4 py-2 text-sm" onClick={() => showGuidanceTarget(document, selected.step.anchor, session.surface)} disabled={target.status === 'waiting' || target.status === 'missing'}>Show target</button>}
              </div>
              <button type="button" className="btn-secondary min-h-11 px-4 py-2 text-sm" onClick={() => { panelRef.current?.focus({ preventScroll: true }); setSession(previous => previous?.scope === session.scope ? { ...previous, mode: 'overview' } : previous); }}>Read the workflow</button>
              <p className="tool-guidance-caption">These explanations leave every action to you.</p>
            </>
          ) : (
            <>
              <p className="tool-guidance-description"><TacoText text={overview.subtitle} /></p>
              <ol className="tool-guidance-overview">
                {overview.steps.map((step, stepIndex) => <li key={`${stepIndex}-${step.title}`}><h3 className="text-sm font-semibold"><TacoText text={step.title} /></h3><p className="tool-guidance-description"><TacoText text={step.description} /></p></li>)}
              </ol>
              {overview.tips?.map(tip => <p className="tool-guidance-prerequisite" key={tip}>{tip}</p>)}
              {selected && <button type="button" className="btn-secondary min-h-11 px-4 py-2 text-sm" onClick={() => { panelRef.current?.focus({ preventScroll: true }); setSession(previous => previous?.scope === session.scope ? { ...previous, mode: 'guided' } : previous); }}>Return to guidance</button>}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
