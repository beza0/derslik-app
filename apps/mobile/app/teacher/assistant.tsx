import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { AI_EXAMPLES, RULES_EXAMPLES, RULES_NOTE, type AiActionDto, type AiReplyDto, type AiStatusDto } from '@derslik/shared';
import { api, errorMessage } from '../../src/api';
import { Alert, Badge, Button, Card, Input, Row, Screen, T, useTheme } from '../../src/ui';

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  actions?: AiActionDto[];
  choices?: AiReplyDto['choices'];
  undoable?: AiReplyDto['undoable'];
}

const STATUS: Record<AiActionDto['status'], string> = {
  proposed: 'Onay bekliyor',
  applied: 'Uygulandı',
  rejected: 'Reddedildi',
  stale: 'Uygulanmadı',
  expired: 'Süresi doldu',
  failed: 'Başarısız',
  undone: 'Geri alındı',
};

/** Yalnızca öğretmen. Ses cihazda yazıya çevrilir; gönderilmeden önce metin düzenlenebilir. */
export default function Assistant() {
  const c = useTheme();
  const qc = useQueryClient();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string>();
  const base = useRef('');
  const status = useQuery({ queryKey: ['ai-status'], queryFn: () => api.get<AiStatusDto>('/ai/status'), staleTime: 5 * 60_000 });
  const rules = status.data?.mode === 'rules';

  useSpeechRecognitionEvent('result', (e) => setText(base.current + (e.results[0]?.transcript ?? '')));
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('error', (e) => {
    setListening(false);
    setMicError(e.error === 'not-allowed' ? 'Mikrofon izni verilmedi; yazarak devam edebilirsiniz.' : 'Ses tanınamadı.');
  });

  const toggleMic = async () => {
    setMicError(null);
    if (listening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setMicError('Mikrofon izni verilmedi; yazarak devam edebilirsiniz.');
      return;
    }
    base.current = text ? `${text} ` : '';
    setListening(true);
    ExpoSpeechRecognitionModule.start({ lang: 'tr-TR', interimResults: true });
  };

  const send = async (msg = text) => {
    if (!msg.trim() || busy) return;
    setBusy(true);
    setTurns((t) => [...t, { role: 'user', text: msg }]);
    setText('');
    try {
      const r = await api.post<AiReplyDto>('/ai/messages', { conversationId, text: msg, fileIds: [] });
      setConversationId(r.conversationId);
      setTurns((t) => [...t, { role: 'assistant', text: r.text, actions: r.actions, choices: r.choices, undoable: r.undoable }]);
    } catch (e) {
      setTurns((t) => [...t, { role: 'assistant', text: `⚠ ${errorMessage(e)}` }]);
    } finally {
      setBusy(false);
    }
  };

  const decide = async (a: AiActionDto, decision: 'confirm' | 'reject') => {
    try {
      const r = await api.post<AiActionDto & { newAction?: AiActionDto }>(`/ai/actions/${a.id}/decide`, { decision });
      setTurns((ts) => ts.map((t) => ({ ...t, actions: t.actions?.map((x) => (x.id === r.id ? r : x)) })));
      if (r.newAction) setTurns((t) => [...t, { role: 'assistant', text: 'Veriler değiştiği için önizleme güncellendi.', actions: [r.newAction!] }]);
      if (r.status === 'applied') void qc.invalidateQueries();
    } catch (e) {
      setTurns((t) => [...t, { role: 'assistant', text: `⚠ ${errorMessage(e)}` }]);
    }
  };

  return (
    <Screen title="Asistan" scroll={false}>
      <T muted size={13}>Takvimi, notları ve ödevleri değiştiren her işlem önce önizleme olarak sunulur.</T>
      {rules && <T muted size={13}>{RULES_NOTE}</T>}
      <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 10 }}>
        {turns.length === 0 && (
          <Card>
            <T bold>Örnek komutlar</T>
            {(rules ? RULES_EXAMPLES : AI_EXAMPLES).map((e) => <Button key={e} small title={e} onPress={() => setText(e)} />)}
          </Card>
        )}
        {turns.map((t, i) => (
          <View key={i} style={{ alignItems: t.role === 'user' ? 'flex-end' : 'flex-start', gap: 6 }}>
            {!!t.text && (
              <View style={{ backgroundColor: t.role === 'user' ? c.primary : c.surface, borderColor: c.border, borderWidth: t.role === 'user' ? 0 : 1, borderRadius: 14, padding: 10, maxWidth: '90%' }}>
                <T color={t.role === 'user' ? c.primaryInk : undefined}>{t.text}</T>
              </View>
            )}
            {t.choices?.map((ch) => (
              <Card key={ch.question}>
                <T bold>{ch.question}</T>
                <Row>{ch.options.map((o) => <Button key={o.id} small title={o.label} onPress={() => send(`${o.label} (id: ${o.id})`)} />)}</Row>
              </Card>
            ))}
            {t.actions?.map((a) => (
              <Card key={a.id} style={{ width: '100%' }}>
                <Row>
                  <T bold>Önizleme</T>
                  <Badge tone={a.status === 'applied' ? 'ok' : a.status === 'proposed' ? 'info' : 'warn'}>{STATUS[a.status]}</Badge>
                </Row>
                {a.preview.map((p, j) => (
                  <View key={j}>
                    <T>{p.summary}</T>
                    {p.who && <T muted size={13}>Kime: {p.who}</T>}
                    {p.when && <T bold size={13}>{p.when}</T>}
                  </View>
                ))}
                {a.warnings.map((w) => <Alert key={w} tone="warn">{w}</Alert>)}
                {a.status === 'proposed' && (
                  <Row>
                    <Button small kind="primary" title="Onayla" onPress={() => decide(a, 'confirm')} />
                    <Button small title="Vazgeç" onPress={() => decide(a, 'reject')} />
                  </Row>
                )}
              </Card>
            ))}
            {t.undoable?.map((u) => (
              <Button key={u.actionId} small title={`Geri al: ${u.summary}`} onPress={async () => { await api.post(`/ai/actions/${u.actionId}/undo`); setTurns((ts) => ts.map((x) => ({ ...x, undoable: x.undoable?.filter((y) => y.actionId !== u.actionId) }))); }} />
            ))}
          </View>
        ))}
        {busy && <T muted>Düşünüyor…</T>}
      </ScrollView>
      <Input label="Mesaj" value={text} onChangeText={setText} multiline placeholder="Yazın veya mikrofonla söyleyin" />
      {micError && <Alert tone="warn">{micError}</Alert>}
      <Row>
        <Button title={listening ? '■ Dinleniyor' : '🎤 Sesle'} onPress={toggleMic} />
        <Button kind="primary" title="Gönder" onPress={() => send()} disabled={busy || !text.trim()} />
      </Row>
    </Screen>
  );
}
