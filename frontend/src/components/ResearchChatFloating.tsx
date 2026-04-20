import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';
import { api } from '../api';
import type { ChatMessage } from '../types';

interface ResearchChatFloatingProps {
  sessionId: string | null;
}

export function ResearchChatFloating({ sessionId }: ResearchChatFloatingProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || !sessionId) return;
    setLoading(true);
    setError(null);
    api.getResearchChat(sessionId)
      .then((res) => {
        setMessages(Array.isArray(res?.history) ? res.history : []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, sessionId]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  const disabled = !sessionId || loading || !input.trim();

  const placeholder = useMemo(() => {
    if (!sessionId) return 'Select a research session first...';
    return 'Ask about methods, gaps, evidence, or next experiments...';
  }, [sessionId]);

  const send = async () => {
    if (disabled || !sessionId) return;
    const text = input.trim();
    setInput('');
    setError(null);
    setLoading(true);

    const optimistic: ChatMessage = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await api.sendResearchChat(sessionId, text);
      setMessages(Array.isArray(res?.history) ? res.history : []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Chat request failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {open ? (
        <div className="fixed bottom-6 right-6 z-[120] w-[360px] max-w-[calc(100vw-24px)] h-[520px] rounded-2xl border border-orion-border/60 bg-white/95 shadow-2xl backdrop-blur-md flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-orion-border/40">
            <div>
              <p className="text-sm font-semibold text-orion-text-muted">Research Discussion</p>
              <p className="text-[11px] text-orion-text-dim">
                {sessionId ? `Session ${sessionId.slice(0, 8)}` : 'No active session'}
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-orion-surface transition-colors"
              aria-label="Close chat"
            >
              <X className="h-4 w-4 text-orion-text-muted" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-orion-surface/30">
            {messages.length === 0 && !loading ? (
              <div className="text-xs text-orion-text-dim border border-orion-border/40 rounded-xl bg-white px-3 py-2">
                Ask anything about this research run: quality, contradictions, gaps, methods, or how to improve the paper.
              </div>
            ) : null}
            {messages.map((m, idx) => (
              <div
                key={`${m.timestamp}-${idx}`}
                className={`max-w-[90%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'ml-auto bg-orion-accent text-white'
                    : 'mr-auto bg-white border border-orion-border/40 text-orion-text-muted'
                }`}
              >
                {m.content}
              </div>
            ))}
            {loading ? (
              <div className="mr-auto inline-flex items-center gap-2 text-xs text-orion-text-dim bg-white border border-orion-border/40 rounded-lg px-3 py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Thinking...
              </div>
            ) : null}
          </div>

          <div className="p-3 border-t border-orion-border/40">
            {error ? <p className="text-xs text-orion-error mb-2">{error}</p> : null}
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') send();
                }}
                placeholder={placeholder}
                className="flex-1 rounded-lg border border-orion-border/50 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orion-accent/20"
                disabled={!sessionId || loading}
              />
              <button
                onClick={send}
                disabled={disabled}
                className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-orion-accent text-white disabled:opacity-50"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-[110] h-14 w-14 rounded-full bg-orion-accent text-white shadow-lg shadow-orion-accent/30 hover:bg-orion-accent-light transition-all active:scale-[0.98] inline-flex items-center justify-center"
        aria-label="Open research discussion chat"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    </>
  );
}

