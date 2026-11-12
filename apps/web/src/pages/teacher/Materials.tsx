import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, FolderOpen, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../api';
import { Empty, Field, Modal, PageHeader, Q } from '../../ui';
import { FilePicker } from './Assignments';

interface Material {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  fileId: string | null;
  tags: string[];
}

/** Öğretmene özel, tekrar kullanılabilir materyal arşivi (öğretmenler arası paylaşım yok). */
export function Materials() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['materials'], queryFn: () => api.get<Material[]>('/materials') });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: '', description: '', url: '', tags: '' });
  const [file, setFile] = useState<{ id: string; name: string } | null>(null);
  const create = useMutation({
    mutationFn: () => api.post('/materials', { title: f.title, description: f.description || null, url: f.url || null, fileId: file?.id ?? null, tags: f.tags.split(',').map((x) => x.trim()).filter(Boolean) }),
    onSuccess: () => {
      setOpen(false);
      setF({ title: '', description: '', url: '', tags: '' });
      setFile(null);
      void qc.invalidateQueries({ queryKey: ['materials'] });
    },
  });
  const del = useMutation({ mutationFn: (id: string) => api.del(`/materials/${id}`), onSuccess: () => void qc.invalidateQueries({ queryKey: ['materials'] }) });
  return (
    <>
      <PageHeader title="Materyaller" subtitle="Yalnızca size özel arşiv" actions={<button className="btn primary" onClick={() => setOpen(true)}><Plus size={18} /> Materyal</button>} />
      <div className="card">
        <Q q={q} empty={(d) => d.length === 0 && <Empty title="Materyal yok" icon={<FolderOpen size={36} />} />}>
          {(d) => (
            <div className="list">
              {d.map((m) => (
                <div key={m.id} className="list-item">
                  <FileText size={20} aria-hidden />
                  <div className="grow">
                    <div className="title">{m.title}</div>
                    <div className="small muted">{m.description}</div>
                    <div className="row">{m.tags.map((x) => <span key={x} className="badge">{x}</span>)}</div>
                  </div>
                  {m.url && <a className="btn sm" href={m.url} target="_blank" rel="noopener noreferrer">Aç</a>}
                  {m.fileId && <button className="btn sm" onClick={async () => window.open((await api.get<{ url: string }>(`/files/${m.fileId}/url`)).url, '_blank', 'noopener')}>Dosya</button>}
                  <button className="btn sm ghost" aria-label="Sil" onClick={() => del.mutate(m.id)}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          )}
        </Q>
      </div>
      {open && (
        <Modal title="Yeni materyal" onClose={() => setOpen(false)}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
            <Field label="Başlık" htmlFor="mt"><input id="mt" className="input" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <Field label="Açıklama" htmlFor="md"><textarea id="md" className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
            <Field label="Bağlantı" htmlFor="mu"><input id="mu" type="url" pattern="https://.*" className="input" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></Field>
            <Field label="Etiketler (virgülle)" htmlFor="mg"><input id="mg" className="input" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></Field>
            {file ? <span className="badge"><FileText size={12} /> {file.name}</span> : <FilePicker purpose="material" onUploaded={setFile} />}
            {create.error && <div className="alert danger">{errorMessage(create.error)}</div>}
            <button className="btn primary" disabled={create.isPending}>Kaydet</button>
          </form>
        </Modal>
      )}
    </>
  );
}
