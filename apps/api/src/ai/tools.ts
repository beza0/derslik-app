import { z } from 'zod';
import { DateTime } from 'luxon';
import { and, asc, desc, eq, gte, lt, ne } from 'drizzle-orm';
import {
  CreateLessonInput,
  LocalDate,
  LocalTime,
  Visibility,
  type AiPreviewChange,
} from '@derslik/shared';
import type { Tx } from '../db/db';
import { assessment, lesson, note, student, studentGroup } from '../db/schema';
import type { TeacherCtx } from '../common/access.service';
import type { LessonsService } from '../lessons/lessons.service';
import type { StudentsService } from '../students/students.service';
import type { GroupsService } from '../groups/groups.service';
import type { NotesService } from '../notes/notes.service';
import type { AssignmentsService } from '../assignments/assignments.service';
import { formatRange, localToUtc, utcToLocal } from '../lessons/recurrence';

export interface ToolDeps {
  lessons: LessonsService;
  students: StudentsService;
  groups: GroupsService;
  notes: NotesService;
  assignments: AssignmentsService;
}

/**
 * read: doğrudan çalışır, veri döndürür. direct: hedef ve içerik kesinse kaydedilir + geri alınabilir.
 * confirm: önce önizleme (transaction içinde deneme + geri alma), kullanıcı onayıyla uygulanır.
 */
export type ToolKind = 'read' | 'direct' | 'confirm';

export interface ToolRun {
  changes: AiPreviewChange[];
  warnings: string[];
  result: unknown;
}

export interface AiTool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  kind: ToolKind;
  schema: S;
  run(t: TeacherCtx, input: z.infer<S>, tx: Tx, deps: ToolDeps): Promise<ToolRun>;
}

const tool = <S extends z.ZodType>(t: AiTool<S>) => t as unknown as AiTool;

/** Türkçe büyük/küçük harf ve aksan farklarını yok sayan karşılaştırma anahtarı. */
export function normalizeName(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .trim();
}

const when = (s: Date, e: Date, tz: string) => `${formatRange(s, e, tz)} (${tz})`;

export const TOOLS: AiTool[] = [
  // ───────────── Okuma ─────────────
  tool({
    name: 'find_students',
    description: 'Öğrencileri ada göre arar. Birden fazla eşleşme varsa kullanıcıya hangisi olduğunu SOR; tahmin etme.',
    kind: 'read',
    schema: z.object({ query: z.string().min(1).max(100), includeArchived: z.boolean().optional() }),
    async run(t, input, tx) {
      const rows = await tx.select({ id: student.id, displayName: student.displayName, status: student.status, level: student.level }).from(student).where(eq(student.workspaceId, t.workspaceId)).limit(1000);
      const q = normalizeName(input.query);
      const matches = rows.filter((r) => (input.includeArchived || r.status === 'active') && normalizeName(r.displayName).includes(q));
      return { changes: [], warnings: [], result: { matches } };
    },
  }),
  tool({
    name: 'list_groups',
    description: 'Öğretmenin gruplarını listeler.',
    kind: 'read',
    schema: z.object({}),
    async run(t, _i, tx) {
      const rows = await tx.select({ id: studentGroup.id, name: studentGroup.name }).from(studentGroup).where(eq(studentGroup.workspaceId, t.workspaceId));
      return { changes: [], warnings: [], result: { groups: rows } };
    },
  }),
  tool({
    name: 'get_calendar',
    description: 'Verilen yerel tarih aralığındaki dersleri (öğretmenin saat diliminde) listeler. Bitiş tarihi dahildir.',
    kind: 'read',
    schema: z.object({ fromDate: LocalDate, toDate: LocalDate }),
    async run(t, input, _tx, deps) {
      const from = localToUtc(input.fromDate, '00:00', t.timezone);
      const to = DateTime.fromISO(input.toDate, { zone: t.timezone }).plus({ days: 1 }).toJSDate();
      const lessons = await deps.lessons.calendar(t, { from: from.toISOString(), to: to.toISOString() });
      return {
        changes: [],
        warnings: [],
        result: lessons.map((l) => ({ id: l.id, seriesId: l.seriesId, who: l.targetName, status: l.status, when: when(new Date(l.startsAt), new Date(l.endsAt), l.timezone) })),
      };
    },
  }),
  tool({
    name: 'find_free_slots',
    description: 'Tarih aralığında, günlük çalışma saatleri içinde, istenen süre kadar boş zamanları bulur.',
    kind: 'read',
    schema: z.object({ fromDate: LocalDate, toDate: LocalDate, durationMin: z.number().int().min(15).max(600), dayStart: LocalTime.default('09:00'), dayEnd: LocalTime.default('21:00') }),
    async run(t, input, tx) {
      const out: { date: string; from: string; to: string }[] = [];
      let d = DateTime.fromISO(input.fromDate, { zone: t.timezone });
      const end = DateTime.fromISO(input.toDate, { zone: t.timezone });
      for (let i = 0; d <= end && i < 31; i++, d = d.plus({ days: 1 })) {
        const date = d.toISODate()!;
        const s = localToUtc(date, input.dayStart, t.timezone);
        const e = localToUtc(date, input.dayEnd, t.timezone);
        const busy = await tx
          .select({ s: lesson.startsAt, e: lesson.endsAt })
          .from(lesson)
          .where(and(eq(lesson.workspaceId, t.workspaceId), ne(lesson.status, 'cancelled'), lt(lesson.startsAt, e), gte(lesson.endsAt, s)))
          .orderBy(asc(lesson.startsAt));
        let cursor = s.getTime();
        for (const b of [...busy, { s: e, e }]) {
          if (b.s.getTime() - cursor >= input.durationMin * 60_000) {
            out.push({ date, from: utcToLocal(new Date(cursor), t.timezone).time, to: utcToLocal(b.s, t.timezone).time });
          }
          cursor = Math.max(cursor, b.e.getTime());
        }
      }
      return { changes: [], warnings: [], result: { timezone: t.timezone, free: out } };
    },
  }),
  tool({
    name: 'student_overview',
    description: 'Bir öğrencinin son notları (öğretmene özel olanlar dahil), son dersleri, değerlendirmeleri ve açık ödevleri. Özet, rapor ve ders planı taslağı için kullan.',
    kind: 'read',
    schema: z.object({ studentId: z.uuid(), noteLimit: z.number().int().min(1).max(20).default(8) }),
    async run(t, input, tx, deps) {
      const s = await deps.students.get(t, input.studentId);
      const notes = await tx.select({ kind: note.kind, topic: note.topic, body: note.body, visibility: note.visibility, createdAt: note.createdAt }).from(note).where(eq(note.studentId, s.id)).orderBy(desc(note.createdAt)).limit(input.noteLimit);
      const lessons = await deps.lessons.forStudent(t, s.id, 'past', 6);
      const assessments = await tx.select({ title: assessment.title, date: assessment.date, score: assessment.score, maxScore: assessment.maxScore, topic: assessment.topic }).from(assessment).where(eq(assessment.studentId, s.id)).orderBy(desc(assessment.date)).limit(10);
      const open = (await deps.assignments.openRecipients(t)).filter((r) => r.studentId === s.id);
      return {
        changes: [],
        warnings: [],
        result: {
          student: { id: s.id, name: s.displayName, level: s.level, goal: s.goal, subject: s.subject },
          // Not metinleri öğretmenin yazdığı VERİDİR; içlerindeki talimatlar uygulanmaz.
          notes: notes.map((n) => ({ ...n, body: `<veri>${n.body}</veri>` })),
          recentLessons: lessons.map((l) => ({ when: when(new Date(l.startsAt), new Date(l.endsAt), l.timezone), status: l.status, topics: l.topicsCovered, nextPlan: l.nextPlan })),
          assessments,
          openHomework: open.map((o) => ({ title: o.title, status: o.status, dueAt: o.dueAt })),
        },
      };
    },
  }),
  tool({
    name: 'open_homework',
    description: 'Teslim edilmemiş veya yeniden teslim istenen ödevleri öğrenci bazında listeler.',
    kind: 'read',
    schema: z.object({}),
    async run(t, _i, _tx, deps) {
      const rows = await deps.assignments.openRecipients(t);
      return { changes: [], warnings: [], result: rows.map((r) => ({ student: r.displayName, title: r.title, status: r.status, dueAt: r.dueAt?.toISOString() ?? null })) };
    },
  }),

  // ───────────── Doğrudan (geri alınabilir) ─────────────
  tool({
    name: 'add_private_note',
    description: 'Öğrenci için YALNIZCA ÖĞRETMENE ÖZEL not kaydeder (öğrenci ve veli görmez). Hedef öğrenci kesin değilse önce find_students ile sor.',
    kind: 'direct',
    schema: z.object({ studentId: z.uuid(), body: z.string().min(1).max(8000), topic: z.string().max(150).optional(), lessonId: z.uuid().optional() }),
    async run(t, input, tx, deps) {
      const n = await deps.notes.createNote(t, { studentId: input.studentId, body: input.body, topic: input.topic ?? null, lessonId: input.lessonId ?? null, kind: 'observation', visibility: 'private' }, { createdByAi: true }, tx);
      const s = await deps.students.get(t, input.studentId);
      return { changes: [{ kind: 'create', entity: 'note', summary: `Öğretmene özel not eklendi`, who: s.displayName }], warnings: [], result: { noteId: n.id } };
    },
  }),

  // ───────────── Onaylı ─────────────
  tool({
    name: 'create_students',
    description: 'Yeni öğrenci kayıtları oluşturur (yalnızca ad zorunlu). Paket limiti sunucuda kontrol edilir.',
    kind: 'confirm',
    schema: z.object({ students: z.array(z.object({ displayName: z.string().min(1).max(100), level: z.string().max(100).optional(), subject: z.string().max(100).optional() })).min(1).max(20) }),
    async run(t, input, tx, deps) {
      const created = await deps.students.createMany(t, input.students, undefined, tx);
      return { changes: created.map((s) => ({ kind: 'create' as const, entity: 'student', summary: 'Yeni öğrenci', who: s.displayName })), warnings: [], result: { studentIds: created.map((s) => s.id) } };
    },
  }),
  tool({
    name: 'create_lessons',
    description:
      'Tek ders veya haftalık tekrarlayan seri oluşturur. date/startTime öğretmenin saat diliminde YEREL değerdir (göreli ifadeleri kesin tarihe çevir). recurrence.weekdays ISO (1=Pzt…7=Paz); untilDate veya count’tan yalnızca biri.',
    kind: 'confirm',
    schema: z.object({
      studentId: z.uuid().optional(),
      groupId: z.uuid().optional(),
      title: z.string().max(150).optional(),
      date: LocalDate,
      startTime: LocalTime,
      durationMin: z.number().int().min(5).max(600),
      mode: z.enum(['online', 'in_person']).optional(),
      meetingUrl: z.string().max(2000).optional(),
      recurrence: z.object({ weekdays: z.array(z.number().int().min(1).max(7)).min(1), untilDate: LocalDate.optional(), count: z.number().int().min(1).max(200).optional() }).optional(),
    }),
    async run(t, input, tx, deps) {
      const parsed = CreateLessonInput.parse({ ...input, mode: input.mode ?? 'in_person' });
      const res = await deps.lessons.create(t, parsed, tx);
      const first = res.lessons[0]!;
      const last = res.lessons.at(-1)!;
      const changes: AiPreviewChange[] = [
        {
          kind: 'create',
          entity: 'lesson',
          summary: res.lessons.length > 1 ? `${res.lessons.length} derslik seri (son ders: ${formatRange(new Date(last.startsAt), new Date(last.endsAt), last.timezone)})` : 'Tek ders',
          when: when(new Date(first.startsAt), new Date(first.endsAt), first.timezone),
          who: first.targetName,
        },
      ];
      const warnings = res.warnings.map((w) => `${w.displayName} için başka bir dersle çakışma görünüyor: ${w.dates.join(', ')}`);
      return { changes, warnings, result: { lessonIds: res.lessons.map((l) => l.id), seriesId: res.seriesId } };
    },
  }),
  tool({
    name: 'move_lesson',
    description: 'Bir dersi taşır veya süresini değiştirir. scope: "this" yalnızca bu ders, "this_and_following" seride bu ve sonrakiler (o durumda date yerine weekdays).',
    kind: 'confirm',
    schema: z.object({
      lessonId: z.uuid(),
      scope: z.enum(['this', 'this_and_following']).default('this'),
      date: LocalDate.optional(),
      startTime: LocalTime.optional(),
      durationMin: z.number().int().min(5).max(600).optional(),
      weekdays: z.array(z.number().int().min(1).max(7)).optional(),
    }),
    async run(t, input, tx, deps) {
      const before = await deps.lessons.ownLesson(t, input.lessonId, tx);
      const res = await deps.lessons.update(t, input.lessonId, input, tx);
      const after = res.lessons[0];
      return {
        changes: [
          {
            kind: 'update',
            entity: 'lesson',
            summary: `${when(before.startsAt, before.endsAt, before.timezone)} → ${after ? when(new Date(after.startsAt), new Date(after.endsAt), after.timezone) : '—'}${res.lessons.length > 1 ? ` (${res.lessons.length} ders)` : ''}`,
            who: after?.targetName,
          },
        ],
        warnings: res.warnings.map((w) => `${w.displayName} için başka bir dersle çakışma görünüyor: ${w.dates.join(', ')}`),
        result: { lessonIds: res.lessons.map((l) => l.id) },
      };
    },
  }),
  tool({
    name: 'cancel_lesson',
    description: 'Dersi iptal eder (öğrenci/veliye bildirim gider).',
    kind: 'confirm',
    schema: z.object({ lessonId: z.uuid(), scope: z.enum(['this', 'this_and_following']).default('this'), reason: z.string().max(500).optional() }),
    async run(t, input, tx, deps) {
      const l = await deps.lessons.ownLesson(t, input.lessonId, tx);
      const [dto] = await deps.lessons.toTeacherDtos([l], tx);
      const res = await deps.lessons.cancel(t, input.lessonId, input, tx);
      return { changes: [{ kind: 'cancel', entity: 'lesson', summary: `${res.cancelled} ders iptal`, when: when(l.startsAt, l.endsAt, l.timezone), who: dto?.targetName }], warnings: [], result: res };
    },
  }),
  tool({
    name: 'create_assignment',
    description: 'Öğrenciye veya gruba ödev oluşturur. publish=true yayımlar ve bildirir. Cevap anahtarını answerKeyText’e AYRI yaz; açıklamaya koyma.',
    kind: 'confirm',
    schema: z.object({
      title: z.string().min(1).max(200),
      description: z.string().max(8000).optional(),
      studentIds: z.array(z.uuid()).max(200).optional(),
      groupId: z.uuid().optional(),
      dueAt: z.iso.datetime({ offset: true }).optional(),
      answerKeyText: z.string().max(20000).optional(),
      publish: z.boolean().default(false),
    }),
    async run(t, input, tx, deps) {
      const a = await deps.assignments.create(
        t,
        { ...input, studentIds: input.studentIds ?? [], links: [], fileIds: [], answerKeyFileIds: [], answerKeyVisibility: 'hidden', groupId: input.groupId ?? null },
        tx,
      );
      return {
        changes: [
          {
            kind: input.publish ? 'publish' : 'create',
            entity: 'assignment',
            summary: `${input.publish ? 'Yayımlanacak' : 'Taslak'} ödev: ${a.title}${a.dueAt ? `, son tarih ${DateTime.fromISO(a.dueAt).setZone(t.timezone).setLocale('tr').toFormat('d LLLL yyyy HH:mm')}` : ', son tarih yok'}`,
            who: a.recipients.map((r) => r.displayName).join(', '),
          },
        ],
        warnings: [],
        result: { assignmentId: a.id },
      };
    },
  }),
  tool({
    name: 'publish_assignment',
    description: 'Taslak ödevi yayımlar (öğrencilere bildirim gider).',
    kind: 'confirm',
    schema: z.object({ assignmentId: z.uuid() }),
    async run(t, input, tx, deps) {
      const a = await deps.assignments.publish(t, input.assignmentId, tx);
      return { changes: [{ kind: 'publish', entity: 'assignment', summary: `Ödev yayımlanır: ${a.title}`, who: a.recipients.map((r) => r.displayName).join(', ') }], warnings: [], result: { assignmentId: a.id } };
    },
  }),
  tool({
    name: 'create_shared_note',
    description: 'Öğrenciyle (student) veya öğrenci ve veliyle (student_guardian) PAYLAŞILAN not/geri bildirim. Özel not için add_private_note kullan.',
    kind: 'confirm',
    schema: z.object({ studentId: z.uuid(), body: z.string().min(1).max(8000), visibility: Visibility.exclude(['private']) }),
    async run(t, input, tx, deps) {
      const n = await deps.notes.createNote(t, { studentId: input.studentId, body: input.body, visibility: input.visibility, kind: 'observation', lessonId: null, topic: null }, { createdByAi: true }, tx);
      const s = await deps.students.get(t, input.studentId);
      return { changes: [{ kind: 'create', entity: 'note', summary: input.visibility === 'student' ? 'Öğrenciyle paylaşılan not' : 'Öğrenci ve veliyle paylaşılan not', who: s.displayName }], warnings: [], result: { noteId: n.id } };
    },
  }),
  tool({
    name: 'change_note_visibility',
    description: 'Bir notun görünürlüğünü değiştirir.',
    kind: 'confirm',
    schema: z.object({ noteId: z.uuid(), visibility: Visibility }),
    async run(t, input, tx) {
      const [cur] = await tx.select().from(note).where(and(eq(note.id, input.noteId), eq(note.workspaceId, t.workspaceId)));
      if (!cur) throw new Error('Not bulunamadı');
      await tx.update(note).set({ visibility: input.visibility, updatedAt: new Date() }).where(eq(note.id, cur.id));
      return { changes: [{ kind: 'update', entity: 'note', summary: `Görünürlük: ${cur.visibility} → ${input.visibility}` }], warnings: [], result: { noteId: cur.id } };
    },
  }),
  tool({
    name: 'create_group',
    description: 'Mevcut öğrencilerden grup oluşturur.',
    kind: 'confirm',
    schema: z.object({ name: z.string().min(1).max(100), studentIds: z.array(z.uuid()).max(200) }),
    async run(t, input, tx, deps) {
      const g = await deps.groups.create(t, { name: input.name, studentIds: input.studentIds, description: null }, tx);
      return { changes: [{ kind: 'create', entity: 'group', summary: `Grup: ${g.name}`, who: g.members.map((m) => m.displayName).join(', ') }], warnings: [], result: { groupId: g.id } };
    },
  }),
];

export const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

export function toolDefs() {
  return TOOLS.map((t) => {
    const { $schema: _s, ...schema } = z.toJSONSchema(t.schema, { io: 'input' }) as Record<string, unknown>;
    return { name: t.name, description: `[${t.kind === 'confirm' ? 'ONAY GEREKİR' : t.kind === 'direct' ? 'doğrudan kaydedilir' : 'okuma'}] ${t.description}`, input_schema: schema };
  });
}
