import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Check, FileText, Mic, MicOff, Send, Undo2, X } from 'lucide-react';
import { AI_EXAMPLES, RULES_EXAMPLES, RULES_NOTE, type AiActionDto, type AiReplyDto, type AiStatusDto } from '@derslik/shared';
import { api, errorMessage } from '../../api';
import { PageHeader, StatusBadge, useToast } from '../../ui';
import { FilePicker } from './Assignments';

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  actions?: AiActionDto[];
  choices?: AiReplyDto['choices'];
  undoable?: AiReplyDto['undoable'];
}

/* Tarayıcının konuşma tanıma API'si (Chrome, Edge, Safari). Desteklenmezse yalnızca yazılı giriş. */
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
const SpeechCtor = (typeof window !== 'undefined' && ((window as unknown as { SpeechRecognition?: new () => Recognition }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition)) || null;


export function Assistant() {
  const qc = useQueryClient();
  const toast = useToast();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const status = useQuery({ queryKey: ['ai-status'], queryFn: () => api.get<AiStatusDto>('/ai/status'), staleTime: 5 * 60_000 });
  const rules = status.data?.mode === 'rules';
  const EXAMPLES = rules ? RULES_EXAMPLES : AI_EXAMPLES;
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Yeni tarayıcılarda scrollIntoView Promise döndürür; efektten döndürülmemeli.
    void end.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);

  const send = async (msg = text) => {
    if (!msg.trim() || busy) return;
    setBusy(true);
    setTurns((t) => [...t, { role: 'user', text: msg }]);
    setText('');
    try {
      const r = await api.post<AiReplyDto>('/ai/messages', { conversationId, text: msg, fileIds: files.map((f) => f.id) });
      setFiles([]);
      setConversationId(r.conversationId);
      setTurns((t) => [...t, { role: 'assistant', text: r.text, actions: r.actions, choices: r.choices, undoable: r.undoable }]);
    } catch (e) {
      setTurns((t) => [...t, { role: 'assistant', text: `⚠ ${errorMessage(e)}` }]);
    } finally {
      setBusy(false);
    }
  };

  const updateAction = (a: AiActionDto) =>
    setTurns((ts) => ts.map((t) => ({ ...t, actions: t.actions?.map((x) => (x.id === a.id ? a : x)) })));

  const decide = async (a: AiActionDto, decision: 'confirm' | 'reject') => {
    try {
      const r = await api.post<AiActionDto & { newAction?: AiActionDto }>(`/ai/actions/${a.id}/decide`, { decision });
      updateAction(r);
      if (r.status === 'applied') {
        toast('Uygulandı');
        void qc.invalidateQueries();
      } else if (r.newAction) {
        setTurns((t) => [...t, { role: 'assistant', text: 'Veriler değiştiği için önizleme güncellendi. Lütfen yeni önizlemeyi kontrol edin.', actions: [r.newAction!] }]);
      } else if (r.status === 'stale') {
        toast('Uygulanamadı: veriler değişti');
      }
    } catch (e) {
      toast(errorMessage(e));
    }
  };

  const toggleMic = () => {
    if (!SpeechCtor) return;
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = new SpeechCtor();
    r.lang = 'tr-TR';
    r.interimResults = true;
    r.continuous = false;
    const base = text ? `${text} ` : '';
    r.onresult = (e) => setText(base + Array.from(e.results).map((x) => x[0]!.transcript).join(''));
    r.onend = () => setListening(false);
    r.onerror = (e) => {
      setListening(false);
      toast(e.error === 'not-allowed' ? 'Mikrofon izni verilmedi; yazarak devam edebilirsiniz' : 'Ses tanınamadı');
    };
    rec.current = r;
    setListening(true);
    r.start();
  };

  return (
    <>
      <PageHeader title="Asistan" subtitle="Takvimi, notları ve ödevleri değiştiren her işlem önce size önizleme olarak sunulur." />
      {rules && <div className="card small muted" style={{ marginBottom: 12 }}>{RULES_NOTE} Ne anladığını görmek için “yardım” yazın.</div>}
      <div className="chat" aria-live="polite">
        {turns.length === 0 && (
          <div className="card stack">
            <div className="row"><Bot size={20} aria-hidden /> <strong>Örnek komutlar</strong></div>
            {EXAMPLES.map((e) => (
              <button key={e} className="btn ghost" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => setText(e)}>{e}</button>
            ))}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className="stack" style={{ alignItems: t.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {t.text && <div className={`bubble ${t.role}`}>{t.text}</div>}
            {t.choices?.map((c) => (
              <div key={c.question} className="card stack" style={{ maxWidth: 520 }}>
                <strong>{c.question}</strong>
                <div className="row">{c.options.map((o) => <button key={o.id} className="btn sm" onClick={() => send(`${o.label} (id: ${o.id})`)}>{o.label}</button>)}</div>
              </div>
            ))}
            {t.actions?.map((a) => (
              <div key={a.id} className="card stack" style={{ maxWidth: 560, width: '100%' }}>
                <div className="row between">
                  <strong>Önizleme</strong>
                  <StatusBadge tone={a.status === 'applied' ? 'ok' : a.status === 'proposed' ? 'info' : a.status === 'stale' ? 'warn' : undefined}>
                    {{ proposed: 'Onay bekliyor', applied: 'Uygulandı', rejected: 'Reddedildi', stale: 'Uygulanmadı', expired: 'Süresi doldu', failed: 'Başarısız', undone: 'Geri alındı' }[a.status]}
                  </StatusBadge>
                </div>
                {a.preview.map((c, j) => (
                  <div key={j}>
                    <div>{c.summary}</div>
                    {c.who && <div className="small muted">Kime: {c.who}</div>}
                    {c.when && <div className="small"><strong>{c.when}</strong></div>}
                  </div>
                ))}
                {a.warnings.map((w) => <div key={w} className="alert warn small">{w}</div>)}
                {a.status === 'stale' && (a.result as { error?: { message: string } } | undefined)?.error && <div className="alert danger small">{(a.result as { error: { message: string } }).error.message}</div>}
                {a.status === 'proposed' && (
                  <div className="row">
                    <button className="btn primary sm" onClick={() => decide(a, 'confirm')}><Check size={16} /> Onayla</button>
                    <button className="btn sm" onClick={() => decide(a, 'reject')}><X size={16} /> Vazgeç</button>
                  </div>
                )}
              </div>
            ))}
            {t.undoable?.map((u) => (
              <div key={u.actionId} className="row small">
                <span className="muted">{u.summary}</span>
                <button className="btn sm" onClick={async () => { await api.post(`/ai/actions/${u.actionId}/undo`); toast('Geri alındı'); setTurns((ts) => ts.map((x) => ({ ...x, undoable: x.undoable?.filter((y) => y.actionId !== u.actionId) }))); }}><Undo2 size={14} /> Geri al</button>
              </div>
            ))}
          </div>
        ))}
        {busy && <div className="bubble assistant muted">Düşünüyor…</div>}
        <div ref={end} />
      </div>
      <form className="composer stack" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        {files.length > 0 && <div className="row">{files.map((f) => <span key={f.id} className="badge"><FileText size={12} /> {f.name}</span>)}</div>}
        <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Yazın veya mikrofonla söyleyin; göndermeden önce düzenleyebilirsiniz." aria-label="Mesaj" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
        <div className="row between">
          <div className="row">
            {!rules && <FilePicker purpose="ai_input" label="Fotoğraf/PDF" onUploaded={(f) => setFiles([...files, f])} />}
            {SpeechCtor ? (
              <button type="button" className={`btn sm ${listening ? 'primary' : ''}`} onClick={toggleMic} aria-pressed={listening}>
                {listening ? <MicOff size={16} /> : <Mic size={16} />} {listening ? 'Dinleniyor…' : 'Sesle'}
              </button>
            ) : (
              <span className="small muted">Bu tarayıcı sesli girişi desteklemiyor.</span>
            )}
          </div>
          <button className="btn primary" disabled={busy || !text.trim()}><Send size={16} /> Gönder</button>
        </div>
      </form>
    </>
  );
}
