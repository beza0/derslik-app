import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DateTime } from 'luxon';
import type { LessonDto, StudentDto } from '@derslik/shared';
import { api } from '../../api';
import { ApiError } from '@derslik/shared';
import { Field, Modal, useToast } from '../../ui';
import { fmtRange } from '../../format';

const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

interface Result {
  lessons: LessonDto[];
  warnings: { displayName: string; dates: string[] }[];
}

/** Ders/seri oluşturma. Çakışmada hiçbir şey kaydedilmez ve çakışan tarihler gösterilir. */
export function LessonForm({ onClose, preset }: { onClose: () => void; preset?: { studentId?: string; groupId?: string; date?: string } }) {
  const qc = useQueryClient();
  const toast = useToast();
  const students = useQuery({ queryKey: ['students', 'active'], queryFn: () => api.get<StudentDto[]>('/students') });
  const groups = useQuery({ queryKey: ['groups'], queryFn: () => api.get<{ id: string; name: string }[]>('/groups') });
  const [target, setTarget] = useState(preset?.groupId ? `g:${preset.groupId}` : preset?.studentId ? `s:${preset.studentId}` : '');
  const [date, setDate] = useState(preset?.date ?? DateTime.now().plus({ days: 1 }).toISODate()!);
  const [startTime, setStartTime] = useState('18:00');
  const [durationMin, setDuration] = useState(60);
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<'in_person' | 'online'>('in_person');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [location, setLocation] = useState('');
  const [repeat, setRepeat] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([DateTime.fromISO(date).weekday]);
  const [endKind, setEndKind] = useState<'count' | 'until'>('count');
  const [count, setCount] = useState(8);
  const [until, setUntil] = useState(DateTime.now().plus({ months: 1 }).toISODate()!);
  const [conflicts, setConflicts] = useState<{ startsAt: string; endsAt: string }[] | null>(null);

  const m = useMutation({
    mutationFn: () =>
      api.post<Result>('/lessons', {
        ...(target.startsWith('g:') ? { groupId: target.slice(2) } : { studentId: target.slice(2) }),
        date,
        startTime,
        durationMin,
        title: title || null,
        mode,
        meetingUrl: mode === 'online' && meetingUrl ? meetingUrl : null,
        location: mode === 'in_person' && location ? location : null,
        recurrence: repeat ? { weekdays, ...(endKind === 'count' ? { count } : { untilDate: until }) } : undefined,
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['calendar'] });
      void qc.invalidateQueries({ queryKey: ['lessons'] });
      toast(r.lessons.length > 1 ? `${r.lessons.length} ders eklendi` : 'Ders eklendi');
      if (r.warnings.length) {
        toast(`Uyarı: ${r.warnings.map((w) => `${w.displayName} için başka bir dersle çakışma (${w.dates.join(', ')})`).join('; ')}`);
      }
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'LESSON_CONFLICT') setConflicts((e.details as { conflicts: { startsAt: string; endsAt: string }[] }).conflicts);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setConflicts(null);
    m.mutate();
  };
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <Modal title="Ders ekle" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Kime" htmlFor="tg">
          <select id="tg" className="input" required value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Seçin…</option>
            <optgroup label="Öğrenciler">
              {students.data?.map((s) => (
                <option key={s.id} value={`s:${s.id}`}>{s.displayName}</option>
              ))}
            </optgroup>
            <optgroup label="Gruplar">
              {groups.data?.map((g) => (
                <option key={g.id} value={`g:${g.id}`}>{g.name}</option>
              ))}
            </optgroup>
          </select>
        </Field>
        <div className="grid grid-3">
          <Field label={repeat ? 'Başlangıç tarihi' : 'Tarih'} htmlFor="d">
            <input id="d" type="date" className="input" required value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Saat" htmlFor="t">
            <input id="t" type="time" className="input" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="Süre (dk)" htmlFor="du">
            <input id="du" type="number" min={5} max={600} step={5} className="input" required value={durationMin} onChange={(e) => setDuration(Number(e.target.value))} />
          </Field>
        </div>
        <Field label="Başlık / branş (isteğe bağlı)" htmlFor="ti">
          <input id="ti" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Örn. Matematik" />
        </Field>
        <div className="row">
          <label className="row"><input type="radio" checked={mode === 'in_person'} onChange={() => setMode('in_person')} /> Yüz yüze</label>
          <label className="row"><input type="radio" checked={mode === 'online'} onChange={() => setMode('online')} /> Online</label>
        </div>
        {mode === 'online' ? (
          <Field label="Görüşme bağlantısı" hint="Google Meet, Zoom vb. (https ile başlamalı)" htmlFor="mu">
            <input id="mu" className="input" type="url" pattern="https://.*" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} />
          </Field>
        ) : (
          <Field label="Konum (isteğe bağlı)" htmlFor="lo">
            <input id="lo" className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
          </Field>
        )}
        <label className="row"><input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} /> Her hafta tekrarla</label>
        {repeat && (
          <div className="card stack" style={{ boxShadow: 'none' }}>
            <div className="row" role="group" aria-label="Günler">
              {DAYS.map((d, i) => {
                const wd = i + 1;
                const on = weekdays.includes(wd);
                return (
                  <button type="button" key={d} aria-pressed={on} className={`btn sm ${on ? 'primary' : ''}`} onClick={() => setWeekdays(on ? weekdays.filter((x) => x !== wd) : [...weekdays, wd].sort())}>
                    {d}
                  </button>
                );
              })}
            </div>
            <div className="row">
              <label className="row"><input type="radio" checked={endKind === 'count'} onChange={() => setEndKind('count')} /> Ders sayısı</label>
              <input type="number" className="input" style={{ width: 90 }} min={1} max={200} value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={endKind !== 'count'} aria-label="Ders sayısı" />
              <label className="row"><input type="radio" checked={endKind === 'until'} onChange={() => setEndKind('until')} /> Bitiş tarihi</label>
              <input type="date" className="input" style={{ width: 170 }} value={until} onChange={(e) => setUntil(e.target.value)} disabled={endKind !== 'until'} aria-label="Bitiş tarihi" />
            </div>
          </div>
        )}
        {conflicts && (
          <div className="alert danger" role="alert">
            Bu saatlerde başka dersiniz var; hiçbir ders kaydedilmedi:
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {conflicts.slice(0, 8).map((c) => (
                <li key={c.startsAt}>{fmtRange(c.startsAt, c.endsAt, zone)}</li>
              ))}
            </ul>
          </div>
        )}
        {m.error && !conflicts && <div className="alert danger">{(m.error as Error).message}</div>}
        <div className="row between">
          <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
          <button className="btn primary" disabled={m.isPending || !target || (repeat && weekdays.length === 0)}>{m.isPending ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </div>
      </form>
    </Modal>
  );
}
