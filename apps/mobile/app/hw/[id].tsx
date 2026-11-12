import { useState } from 'react';
import { Linking } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { t, type RecipientStatus } from '@derslik/shared';
import { api, errorMessage } from '../../src/api';
import { fmtDateTime } from '../../src/format';
import { recTone } from '../../src/portal';
import { Alert, Badge, Button, Card, ErrorView, H2, Input, Loading, Row, Screen, T } from '../../src/ui';

interface Detail {
  id: string;
  studentId: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  links: string[];
  status: RecipientStatus;
  late: boolean;
  canSubmit: boolean;
  files: { id: string; name: string; isAnswerKey: boolean }[];
  answerKey: { text: string | null } | null;
  submissions: { id: string; version: number; text: string | null; submittedAt: string; files: { id: string; name: string }[] }[];
  feedback: { id: string; feedback: string | null; score: number | null; requestedResubmit: boolean }[];
}

async function uploadAsset(asset: { uri: string; name: string; mimeType: string; size?: number | null }, studentId: string) {
  const blob = await (await fetch(asset.uri)).blob();
  return api.uploadFile({ name: asset.name, type: asset.mimeType, size: asset.size ?? blob.size, body: blob }, 'submission', studentId);
}

/** Ödev detayı ve teslim: metin + fotoğraf/PDF; her teslim yeni sürüm. Veli teslim edemez. */
export default function Homework() {
  const { id, studentId } = useLocalSearchParams<{ id: string; studentId?: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['portal', 'assignment', id, studentId], queryFn: () => api.get<Detail>(`/portal/assignments/${id}${studentId ? `?studentId=${studentId}` : ''}`) });
  const [text, setText] = useState('');
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = useMutation({
    mutationFn: () => api.post(`/portal/assignments/${id}/submissions`, { studentId: q.data!.studentId, text: text || null, fileIds: files.map((f) => f.id) }),
    onSuccess: () => {
      setText('');
      setFiles([]);
      void qc.invalidateQueries({ queryKey: ['portal'] });
    },
  });

  const pick = async (kind: 'photo' | 'camera' | 'pdf') => {
    setErr(null);
    try {
      let asset: { uri: string; name: string; mimeType: string; size?: number | null } | null = null;
      if (kind === 'pdf') {
        const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
        if (r.canceled || !r.assets[0]) return;
        const a = r.assets[0];
        asset = { uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/pdf', size: a.size };
      } else {
        const perm = kind === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return setErr('İzin verilmedi; ayarlardan izin verebilir veya metinle teslim edebilirsiniz.');
        const opts = { mediaTypes: ['images'] as ImagePicker.MediaType[], quality: 0.8 };
        const r = kind === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
        if (r.canceled || !r.assets[0]) return;
        const a = r.assets[0];
        asset = { uri: a.uri, name: a.fileName ?? 'foto.jpg', mimeType: a.mimeType ?? 'image/jpeg', size: a.fileSize };
      }
      setBusy(true);
      const f = await uploadAsset(asset, q.data!.studentId);
      setFiles((x) => [...x, f]);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const open = async (fileId: string) => Linking.openURL((await api.get<{ url: string }>(`/files/${fileId}/url`)).url);

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorView error={q.error} />;
  const a = q.data!;
  return (
    <Screen>
      <Stack.Screen options={{ title: a.title }} />
      <Card>
        <Row>
          <Badge tone={recTone(a.status)}>{t(`rec.${a.status}`)}</Badge>
          {a.late && <Badge tone="danger">Gecikmiş</Badge>}
        </Row>
        <T>Son tarih: {fmtDateTime(a.dueAt)}</T>
        {a.description && <T>{a.description}</T>}
        {a.links.map((l) => <Button key={l} small title={l} onPress={() => Linking.openURL(l)} />)}
        <Row>{a.files.map((f) => <Button key={f.id} small title={`📎 ${f.name}${f.isAnswerKey ? ' (cevap anahtarı)' : ''}`} onPress={() => open(f.id)} />)}</Row>
        {a.answerKey?.text && <Alert tone="ok">Cevap anahtarı: {a.answerKey.text}</Alert>}
      </Card>
      {a.feedback.length > 0 && (
        <Card>
          <H2>Geri bildirim</H2>
          {a.feedback.map((f) => <Alert key={f.id}>{`${f.feedback ?? '—'}${f.score !== null ? ` · Puan: ${f.score}` : ''}${f.requestedResubmit ? ' · Yeniden teslim istendi' : ''}`}</Alert>)}
        </Card>
      )}
      {a.canSubmit && (
        <Card>
          <H2>{a.submissions.length ? 'Yeni sürüm teslim et' : 'Teslim et'}</H2>
          <Input label="Cevabın" value={text} onChangeText={setText} multiline />
          <Row>
            <Button small title="📷 Fotoğraf çek" onPress={() => pick('camera')} disabled={busy} />
            <Button small title="🖼 Galeriden" onPress={() => pick('photo')} disabled={busy} />
            <Button small title="📄 PDF" onPress={() => pick('pdf')} disabled={busy} />
          </Row>
          {busy && <T muted>Yükleniyor…</T>}
          {files.map((f) => <T key={f.id} size={13}>📎 {f.name}</T>)}
          {(err || submit.error) && <Alert tone="danger">{err ?? errorMessage(submit.error)}</Alert>}
          {submit.isSuccess && <Alert tone="ok">Teslim edildi</Alert>}
          <Button kind="primary" title="Teslim et" onPress={() => submit.mutate()} disabled={submit.isPending || busy || (!text.trim() && files.length === 0)} />
        </Card>
      )}
      <Card>
        <H2>Teslimler</H2>
        {a.submissions.length === 0 && <T muted>Henüz teslim yok</T>}
        {a.submissions.map((s) => (
          <Card key={s.id}>
            <T muted size={13}>Sürüm {s.version} · {fmtDateTime(s.submittedAt)}</T>
            {s.text && <T>{s.text}</T>}
            <Row>{s.files.map((f) => <Button key={f.id} small title={`📎 ${f.name}`} onPress={() => open(f.id)} />)}</Row>
          </Card>
        ))}
      </Card>
    </Screen>
  );
}
