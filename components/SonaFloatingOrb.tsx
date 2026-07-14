'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, usePathname } from 'next/navigation';
import { useTheme } from '@/components/ThemeProvider';
import { useStore } from '@/lib/store';
import { useUserTier } from '@/hooks/use-user-tier';
import { authFetch } from '@/lib/auth-fetch';
import SonaThinkingTile from '@/components/SonaThinkingTile';
import { SonaMark, type SonaMarkState } from '@/components/sona';
import SonaCapabilityDrawer from '@/components/sona/SonaCapabilityDrawer';
import { useApplicationKitContext } from '@/hooks/useApplicationKitContext';
import { getSonaCapabilitiesForPath, getSonaCapability, type SonaCapability } from '@/lib/sona/capabilities';
import { buildSonaCapabilityPrompt, createSonaExecutionContext, type SonaOpenDetail } from '@/lib/sona/execution-context';

type SonaActionPlan = {
  intent: string;
  capabilityId: string;
  plannedSteps: string[];
  approvalRequired: boolean;
  artifactTargets: string[];
};
type Message = { role: 'user' | 'assistant'; content: string; actionPlan?: SonaActionPlan };
type Insight = {
  id: string; type: string; title: string; body: string;
  icon: string; priority: 'high' | 'medium' | 'low';
  actionLabel?: string; actionUrl?: string; read: boolean; createdAt: string;
};
type ConversationMeta = { id: string; title: string; personality: string; lastMessageAt: string };
type PanelTab = 'chat' | 'history' | 'insights';
type PromoData = { active: boolean; headline: string; code: string; ctaText: string };

function safeLocalStorageGet(key: string): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionStorageGet(key: string): string | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionStorageSet(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Best-effort preference only.
  }
}

const PAGE_HINTS: Record<string, string> = {
  '/suite/job-search': 'I found a job I\'m interested in — can you score it?',
  '/suite/resume': 'Can you review my resume?',
  '/suite/applications': 'Any applications, offers, or follow-ups I should handle?',
  '/suite/market-oracle': 'What does the market look like for my target roles?',
  '/suite/skill-bridge': 'What skills should I focus on learning?',
  '/suite/flashcards': 'Help me prepare for an upcoming interview',
  '/suite/interview-sim': 'Help me prepare for an upcoming interview',
  '/suite/negotiate': 'Open Applications and help me review my offer',
  '/suite/linkedin': 'Can you optimize my LinkedIn profile?',
  '/suite/cover-letter': 'Write a cover letter for my next application',
  '/suite/network': 'Who should I follow up with this week?',
  '/suite/analytics': 'How is my job search going?',
};

const PRIORITY_COLOR: Record<string, string> = {
  high: '#f43f5e', medium: '#f59e0b', low: '#3b82f6',
};

export default function SonaFloatingOrb() {
  const router = useRouter();
  const pathname = usePathname();
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const { user } = useStore();
  const { tier } = useUserTier();
  const { context: kitContext } = useApplicationKitContext();

  const [shimmerCount, setShimmerCount] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>('chat');
  const [activeContextLabel, setActiveContextLabel] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Insights state
  const [insights, setInsights] = useState<Insight[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [insightsLoaded, setInsightsLoaded] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Conversation history
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const isMaxTier = tier === 'studio' || tier === 'god';
  const isAgentPage = pathname === '/suite/agent';
  const isSuiteWorkspace = pathname?.startsWith('/suite') ?? false;
  const isHomeDashboard = pathname === '/';
  const shouldSuppressPromo = isSuiteWorkspace || isHomeDashboard;
  const pageCapabilities = useMemo(() => getSonaCapabilitiesForPath(pathname), [pathname]);
  const pageExecutionContext = useMemo(() => createSonaExecutionContext({
    pathname,
    applicationKit: kitContext,
    sourceTool: pageCapabilities[0]?.toolName,
  }), [pathname, kitContext, pageCapabilities]);

  // Promo bubble state
  const [promo, setPromo] = useState<PromoData | null>(null);
  const [promoVisible, setPromoVisible] = useState(false);
  const [promoDismissed, setPromoDismissed] = useState(false);

  // Shimmers
  useEffect(() => {
    const t1 = setTimeout(() => setShimmerCount(1), 1500);
    const t2 = setTimeout(() => setShimmerCount(2), 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  useEffect(() => {
    if (shimmerCount < 2) return;
    const interval = setInterval(() => setShimmerCount(prev => prev + 1), 60000);
    return () => clearInterval(interval);
  }, [shimmerCount]);

  useEffect(() => {
    if (chatOpen) setTimeout(() => inputRef.current?.focus(), 200);
  }, [chatOpen]);

  useEffect(() => {
    const handleSonaOpen = (event: Event) => {
      const detail = (event as CustomEvent<SonaOpenDetail>).detail;
      const capability = getSonaCapability(detail?.capabilityId);
      const detailContext = createSonaExecutionContext({
        pathname,
        applicationKit: kitContext,
        sourceTool: capability?.toolName || detail?.contextLabel || pageExecutionContext.sourceTool,
        context: detail?.context,
      });
      const prompt = detail?.prompt || (capability ? buildSonaCapabilityPrompt(capability, detailContext) : '');
      setActiveTab('chat');
      setChatOpen(true);
      setShowTooltip(false);
      setActiveContextLabel(detail?.contextLabel || capability?.toolName || detailContext.pageLabel || null);
      if (prompt) setInput(prompt);
      setTimeout(() => inputRef.current?.focus(), 120);
    };
    window.addEventListener('sona:open', handleSonaOpen);
    return () => window.removeEventListener('sona:open', handleSonaOpen);
  }, [kitContext, pageExecutionContext.sourceTool, pathname]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  // Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && chatOpen) setChatOpen(false); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [chatOpen]);

  // Click outside
  useEffect(() => {
    if (!chatOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setChatOpen(false);
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handleClick), 100);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handleClick); };
  }, [chatOpen]);

  // Fetch insights on mount for Max users
  useEffect(() => {
    if (!user || !isMaxTier || insightsLoaded) return;
    fetchInsights();
  }, [user, isMaxTier, insightsLoaded]);

  // Fetch promo on mount
  useEffect(() => {
    if (shouldSuppressPromo) return;
    if (safeSessionStorageGet('tc_promo_sona_dismissed')) {
      setPromoDismissed(true);
      return;
    }
    fetch('/api/admin/promo')
      .then(r => r.json())
      .then(data => {
        if (data.active) {
          setPromo(data);
          setTimeout(() => setPromoVisible(true), 5000);
        }
      })
      .catch(() => {});
  }, [shouldSuppressPromo]);

  // Re-show promo every 30s after close (unless permanently dismissed)
  useEffect(() => {
    if (shouldSuppressPromo) return;
    if (!promo?.active || promoDismissed || promoVisible || chatOpen) return;
    const timer = setTimeout(() => setPromoVisible(true), 30000);
    return () => clearTimeout(timer);
  }, [shouldSuppressPromo, promo, promoDismissed, promoVisible, chatOpen]);

  // Hide promo when chat opens
  useEffect(() => {
    if (chatOpen || shouldSuppressPromo) setPromoVisible(false);
  }, [chatOpen, shouldSuppressPromo]);

  const fetchInsights = async () => {
    try {
      const res = await authFetch('/api/agent/insights');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.gated) {
        setInsights(data.insights || []);
        setUnreadCount(data.unreadCount || 0);
      }
      setInsightsLoaded(true);
    } catch { /* silent */ }
  };

  // Fetch conversation history
  const fetchConversations = async () => {
    try {
      const res = await authFetch('/api/agent/chat');
      if (!res.ok) return;
      const data = await res.json();
      setConversations((data.conversations || []).slice(0, 10));
      setHistoryLoaded(true);
    } catch { /* silent */ }
  };

  // Load a specific conversation's messages
  const loadConversation = async (convId: string) => {
    setLoadingHistory(true);
    setConversationId(convId);
    setActiveTab('chat');
    try {
      const res = await authFetch(`/api/agent/chat/history?conversationId=${convId}`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setMessages(data.messages || []);
    } catch {
      setMessages([{ role: 'assistant', content: 'Could not load this conversation. Try the full view.' }]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const startNewConversation = () => {
    setConversationId(null);
    setMessages([]);
    setActiveTab('chat');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const generateInsights = async () => {
    try {
      const res = await authFetch('/api/agent/insights', { method: 'POST', body: JSON.stringify({}) });
      if (!res.ok) return;
      await fetchInsights(); // Refresh after generation
    } catch { /* silent */ }
  };

  const markRead = async (insightId: string) => {
    setInsights(prev => prev.map(i => i.id === insightId ? { ...i, read: true } : i));
    setUnreadCount(prev => Math.max(0, prev - 1));
    try {
      await authFetch('/api/agent/insights', {
        method: 'PATCH',
        body: JSON.stringify({ insightId }),
      });
    } catch { /* silent */ }
  };

  const sendMessage = useCallback(async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    if (!user) { router.push('/suite/agent'); return; }

    const userMsg: Message = { role: 'user', content: msg };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setLoading(true);

    try {
      const personality = safeLocalStorageGet('sona-personality') || 'coach';
      const res = await authFetch('/api/agent/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: updated,
          personality,
          conversationId,
          resumeVersionId: kitContext.resumeVersionId || undefined,
        }),
      });
      const data = await res.json();
      if (data.gated) { setMessages(prev => [...prev, { role: 'assistant', content: `🔒 ${data.error}` }]); setLoading(false); return; }
      if (!res.ok) throw new Error(data.error || 'Failed');
      if (data.conversationId) setConversationId(data.conversationId);
      setMessages(prev => [...prev, { role: 'assistant', content: data.message, actionPlan: data.actionPlan }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Try the full view.' }]);
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading, user, conversationId, router, kitContext.resumeVersionId]);

  const handleRunCapability = useCallback((capability: SonaCapability) => {
    const context = createSonaExecutionContext({
      pathname,
      applicationKit: kitContext,
      sourceTool: capability.toolName,
    });
    setActiveContextLabel(capability.toolName);
    sendMessage(buildSonaCapabilityPrompt(capability, context));
  }, [kitContext, pathname, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const toggleChat = () => {
    if (chatOpen) { setChatOpen(false); } else { setChatOpen(true); setShowTooltip(false); }
  };

  const contextHint = PAGE_HINTS[pathname] || undefined;
  const tierLabel = isMaxTier ? 'Proactive' : tier === 'pro' ? 'Manual scout' : '1 free scout';
  const accentColor = '#f43f5e';
  const sonaState: SonaMarkState = loading ? 'thinking' : chatOpen ? (input.trim() ? 'listening' : 'responding') : 'idle';

  const formatTimeAgo = (dateStr: string) => {
    const diffMin = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${Math.floor(diffHr / 24)}d ago`;
  };

  const totalBadge = unreadCount + (messages.length > 0 && !chatOpen ? 1 : 0);

  if (isAgentPage) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40 block" ref={panelRef}>

      {/* ═══ PANEL ═══ */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.92 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="fixed inset-x-2 bottom-[calc(var(--mobile-appbar-height,0px)+5.5rem)] sm:absolute sm:inset-x-auto sm:bottom-16 sm:right-0 w-auto overflow-hidden rounded-2xl sm:w-[340px] md:w-[380px] 2xl:right-[320px] flex flex-col"
            style={{
              height: 'min(480px, 70vh)',
              background: isLight ? '#fff' : '#111114',
              border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
              boxShadow: isLight
                ? '0 16px 48px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)'
                : '0 16px 48px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            {/* Header */}
            <div
              className="shrink-0"
              style={{
                background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)',
                borderBottom: `1px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <SonaMark size="xs" state={loading ? 'thinking' : 'idle'} />
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)] leading-none">Sona</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{activeContextLabel ? `Working in ${activeContextLabel}` : tierLabel}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setChatOpen(false); router.push('/suite/agent'); }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors"
                    title="Open full view"
                  >
                    <span className="material-symbols-rounded text-[16px] text-[var(--text-muted)]">open_in_full</span>
                  </button>
                  <button onClick={() => setChatOpen(false)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors">
                    <span className="material-symbols-rounded text-[16px] text-[var(--text-muted)]">close</span>
                  </button>
                </div>
              </div>

              {/* Tab switcher */}
              <div className="flex px-4 gap-1 pb-2">
                <button
                  onClick={() => setActiveTab('chat')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    background: activeTab === 'chat' ? `${accentColor}10` : 'transparent',
                    color: activeTab === 'chat' ? accentColor : 'var(--text-muted)',
                  }}
                >
                  <span className="material-symbols-rounded text-[14px]">chat</span>
                  Chat
                </button>
                <button
                  onClick={() => { setActiveTab('history'); if (!historyLoaded) fetchConversations(); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    background: activeTab === 'history' ? `${accentColor}10` : 'transparent',
                    color: activeTab === 'history' ? accentColor : 'var(--text-muted)',
                  }}
                >
                  <span className="material-symbols-rounded text-[14px]">history</span>
                  History
                </button>
                {isMaxTier && (
                  <button
                    onClick={() => { setActiveTab('insights'); if (!insightsLoaded) fetchInsights(); }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors relative"
                    style={{
                      background: activeTab === 'insights' ? `${accentColor}10` : 'transparent',
                      color: activeTab === 'insights' ? accentColor : 'var(--text-muted)',
                    }}
                  >
                    <span className="material-symbols-rounded text-[14px]">lightbulb</span>
                    Insights
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 right-2 w-4 h-4 rounded-full bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* ═══ CHAT TAB ═══ */}
            {activeTab === 'chat' && (
              <>
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                  {messages.length === 0 && !loading && (
                    <div className="text-center py-6">
                      <SonaMark size="md" state="idle" className="mx-auto mb-3" />
                      <p className="text-xs text-[var(--text-secondary)] mb-4">Quick chat with Sona</p>

                      {contextHint && (
                        <button
                          onClick={() => sendMessage(contextHint)}
                          className="w-full text-left px-3 py-2.5 rounded-xl text-xs transition-colors mb-2"
                          style={{ background: `${accentColor}08`, border: `1px solid ${accentColor}15`, color: 'var(--text-secondary)' }}
                        >
                          <span className="material-symbols-rounded text-[14px] mr-1.5 align-middle" style={{ color: accentColor }}>lightbulb</span>
                          {contextHint}
                        </button>
                      )}

                      <SonaCapabilityDrawer
                        capabilities={pageCapabilities}
                        context={pageExecutionContext}
                        onRun={handleRunCapability}
                        compact
                      />

                      <button onClick={() => sendMessage('What jobs match my resume?')} className="w-full text-left px-3 py-2 rounded-xl text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors">
                        <span className="material-symbols-rounded text-[14px] mr-1.5 align-middle opacity-50">radar</span>What jobs match my resume?
                      </button>
                      <button onClick={() => sendMessage('Any follow-ups I should send?')} className="w-full text-left px-3 py-2 rounded-xl text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors">
                        <span className="material-symbols-rounded text-[14px] mr-1.5 align-middle opacity-50">mail</span>Any follow-ups I should send?
                      </button>
                    </div>
                  )}

                  {messages.slice(-8).map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${msg.role === 'user' ? 'text-white' : 'text-[var(--text-primary)]'}`}
                        style={msg.role === 'user' ? { background: accentColor } : { background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)' }}
                      >
                        {msg.role === 'assistant' && msg.actionPlan && (
                          <div
                            className="mb-2 rounded-xl border px-2.5 py-2 text-[10px] leading-snug"
                            style={{ borderColor: `${accentColor}22`, background: `${accentColor}08`, color: 'var(--text-secondary)' }}
                          >
                            <div className="font-semibold" style={{ color: accentColor }}>Plan: {msg.actionPlan.capabilityId}</div>
                            <div className="mt-1">{msg.actionPlan.plannedSteps.join(' -> ')}</div>
                            {msg.actionPlan.approvalRequired && <div className="mt-1">Review required before external action.</div>}
                          </div>
                        )}
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>
                    </div>
                  ))}

                  {loading && (
                    <div className="flex justify-start">
                      <SonaThinkingTile
                        variant="agent"
                        accentColor={accentColor}
                        title="Thinking"
                        description="Sona is checking your context."
                        activeStage="thinking"
                        icon="neurology"
                        compact
                        className="min-w-[170px]"
                      />
                    </div>
                  )}
                </div>

                {/* Input */}
                <div className="shrink-0 px-3 py-2.5" style={{ borderTop: `1px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}` }}>
                  <div
                    className="flex min-h-11 items-center gap-2 rounded-xl px-3 py-1.5"
                    style={{ background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}` }}
                  >
                    <input
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask Sona..."
                      disabled={loading}
                      className="min-h-11 flex-1 border-none bg-transparent text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] sm:text-sm"
                    />
                    <button
                      onClick={() => sendMessage()}
                      disabled={!input.trim() || loading}
                      className="flex h-11 w-11 items-center justify-center rounded-lg transition-all disabled:opacity-20"
                      aria-label="Send message to Sona"
                      style={{ background: input.trim() ? accentColor : 'transparent', color: input.trim() ? '#fff' : 'var(--text-muted)' }}
                    >
                      <span className="material-symbols-rounded text-[18px]">arrow_upward</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ═══ HISTORY TAB ═══ */}
            {activeTab === 'history' && (
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
                <button
                  onClick={startNewConversation}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors mb-2"
                  style={{ background: `${accentColor}08`, border: `1px solid ${accentColor}15`, color: accentColor }}
                >
                  <span className="material-symbols-rounded text-[14px]">add</span>
                  New conversation
                </button>

                {conversations.length === 0 && historyLoaded && (
                  <div className="text-center py-6">
                    <span className="material-symbols-rounded text-[28px] mb-2 block" style={{ color: 'var(--text-muted)' }}>forum</span>
                    <p className="text-xs text-[var(--text-muted)]">No past conversations yet</p>
                  </div>
                )}

                {!historyLoaded && (
                  <div className="text-center py-6">
                    <span className="material-symbols-rounded text-[20px] animate-spin block mb-2" style={{ color: 'var(--text-muted)' }}>progress_activity</span>
                    <p className="text-[10px] text-[var(--text-muted)]">Loading history...</p>
                  </div>
                )}

                {conversations.map((conv, index) => (
                  <button
                    key={conv.id || `conversation-${index}`}
                    onClick={() => loadConversation(conv.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${
                      conv.id === conversationId
                        ? ''
                        : 'hover:bg-[var(--bg-hover)]'
                    }`}
                    style={conv.id === conversationId ? {
                      background: `${accentColor}10`,
                      border: `1px solid ${accentColor}20`,
                    } : {}}
                  >
                    <p className="text-xs text-[var(--text-primary)] truncate font-medium">{conv.title}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{formatTimeAgo(conv.lastMessageAt)}</p>
                  </button>
                ))}

                {historyLoaded && conversations.length > 0 && (
                  <button
                    onClick={fetchConversations}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors mt-2"
                  >
                    <span className="material-symbols-rounded text-[14px]">refresh</span>
                    Refresh
                  </button>
                )}
              </div>
            )}

            {/* ═══ INSIGHTS TAB ═══ */}
            {activeTab === 'insights' && (
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                {insights.length === 0 && (
                  <div className="text-center py-8">
                    <span className="material-symbols-rounded text-[28px] mb-2 block" style={{ color: '#3b82f6' }}>lightbulb</span>
                    <p className="text-xs text-[var(--text-secondary)] mb-4">No insights yet</p>
                    <button
                      onClick={generateInsights}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-white transition-opacity hover:opacity-90"
                      style={{ background: accentColor }}
                    >
                      <span className="material-symbols-rounded text-[14px]">auto_awesome</span>
                      Generate Insights
                    </button>
                  </div>
                )}

                {insights.map((insight, index) => (
                  <motion.div
                    key={insight.id || `insight-${index}`}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`rounded-xl p-3 transition-colors cursor-pointer ${insight.read ? 'opacity-60' : ''}`}
                    style={{
                      background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
                      borderLeft: `3px solid ${PRIORITY_COLOR[insight.priority]}`,
                    }}
                    onClick={() => {
                      if (!insight.read) markRead(insight.id);
                      if (insight.actionUrl) { setChatOpen(false); router.push(insight.actionUrl); }
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <span className="material-symbols-rounded text-[16px] mt-0.5 shrink-0" style={{ color: PRIORITY_COLOR[insight.priority] }}>
                        {insight.icon}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--text-primary)] leading-tight">{insight.title}</p>
                        <p className="text-[10px] text-[var(--text-secondary)] mt-1 leading-relaxed line-clamp-3">{insight.body}</p>
                        <div className="flex items-center justify-between mt-2">
                          {insight.actionLabel && (
                            <span className="text-[10px] font-medium" style={{ color: accentColor }}>{insight.actionLabel} →</span>
                          )}
                          <span className="text-[9px] text-[var(--text-muted)]">{formatTimeAgo(insight.createdAt)}</span>
                        </div>
                      </div>
                      {!insight.read && (
                        <div className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ background: '#3b82f6' }} />
                      )}
                    </div>
                  </motion.div>
                ))}

                {insights.length > 0 && (
                  <button
                    onClick={generateInsights}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors mt-2"
                  >
                    <span className="material-symbols-rounded text-[14px]">refresh</span>
                    Check for new insights
                  </button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ PROMO BUBBLE ═══ */}
      <AnimatePresence>
        {promoVisible && !chatOpen && !shouldSuppressPromo && promo?.active && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.9 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="absolute bottom-16 right-0 hidden w-[280px] rounded-2xl overflow-hidden lg:block 2xl:hidden"
            style={{
              background: isLight ? '#fff' : '#111114',
              border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
              boxShadow: isLight
                ? '0 12px 40px rgba(0,0,0,0.12)'
                : '0 12px 40px rgba(0,0,0,0.5)',
            }}
          >
            {/* Header */}
            <div className="px-4 pt-3 pb-2 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${accentColor}15` }}>
                  <span className="material-symbols-rounded text-[14px]" style={{ color: accentColor }}>local_offer</span>
                </div>
                <span className="text-[11px] font-semibold" style={{ color: accentColor }}>Sona · Special Offer</span>
              </div>
              <button
                onClick={() => setPromoVisible(false)}
                className="w-5 h-5 rounded-md flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors"
              >
                <span className="material-symbols-rounded text-[14px] text-[var(--text-muted)]">close</span>
              </button>
            </div>

            {/* Content */}
            <div className="px-4 pb-3">
              <p className="text-xs font-semibold text-[var(--text-primary)] mb-2 leading-snug">{promo.headline}</p>

              {/* Code pill */}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(promo.code);
                  const el = document.getElementById('sona-promo-copied');
                  if (el) { el.textContent = 'Copied!'; setTimeout(() => { el.textContent = 'Click to copy'; }, 1500); }
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl mb-2.5 transition-colors group"
                style={{
                  background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
                  border: `1px dashed ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
                }}
              >
                <span className="text-sm font-bold tracking-widest" style={{ color: 'var(--success)' }}>{promo.code}</span>
                <span id="sona-promo-copied" className="text-[9px] text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors">Click to copy</span>
              </button>

              {/* CTA + Dismiss */}
              <a
                href="/suite/upgrade"
                onClick={() => setPromoVisible(false)}
                className="block w-full text-center py-2 rounded-xl text-xs font-semibold text-white transition-all hover:opacity-90"
                style={{ background: `linear-gradient(135deg, ${accentColor}, #e11d48)` }}
              >
                {promo.ctaText} →
              </a>
              <button
                onClick={() => {
                  setPromoVisible(false);
                  setPromoDismissed(true);
                  safeSessionStorageSet('tc_promo_sona_dismissed', 'true');
                }}
                className="w-full text-center text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors mt-2 py-1"
              >
                Don't show again
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ TOOLTIP ═══ */}
      <AnimatePresence>
        {showTooltip && !chatOpen && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            className="absolute bottom-full right-0 mb-2 px-3 py-2 rounded-xl text-xs whitespace-nowrap"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', color: 'var(--text-primary)' }}
          >
            <span className="font-medium">Sona AI</span>
            <span className="text-[var(--text-muted)] ml-1.5">· {tierLabel}</span>
            {unreadCount > 0 && <span className="ml-1.5 text-blue-400">· {unreadCount} new</span>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ ORB BUTTON ═══ */}
      <motion.button
        onClick={toggleChat}
        aria-label={chatOpen ? 'Minimize Sona assistant' : 'Open Sona assistant'}
        onMouseEnter={() => !chatOpen && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        animate={{ y: chatOpen ? 0 : [0, -4, 0], rotate: chatOpen ? 0 : [0, 1.5, -1, 0] }}
        transition={{ duration: 4.2, repeat: chatOpen ? 0 : Infinity, ease: 'easeInOut' }}
        whileHover={{ scale: 1.1, y: -5 }}
        whileTap={{ scale: 0.95 }}
        className="relative hidden h-14 w-14 items-center justify-center rounded-[20px] transition-shadow hover:shadow-xl lg:flex 2xl:hidden"
        style={{
          background: 'transparent',
          boxShadow: chatOpen ? '0 14px 34px rgba(15,23,42,0.2)' : '0 18px 42px rgba(56,189,248,0.28), 0 10px 28px rgba(124,58,237,0.16)',
        }}
      >
        {!chatOpen && (
          <motion.div
            key={shimmerCount}
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 1.8, opacity: 0 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="absolute inset-1 rounded-[18px]"
            style={{ border: '2px solid rgba(56,189,248,0.52)' }}
          />
        )}

        <AnimatePresence mode="wait">
          <motion.span
            key={sonaState}
            initial={{ scale: 0.5, rotate: -90, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0.5, rotate: 90, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <SonaMark size="md" state={sonaState} />
          </motion.span>
        </AnimatePresence>

        {/* Badge */}
        {totalBadge > 0 && !chatOpen && (
          <div
            className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
            style={{ background: '#3b82f6' }}
          >
            {Math.min(totalBadge, 9)}
          </div>
        )}
      </motion.button>
    </div>
  );
}
