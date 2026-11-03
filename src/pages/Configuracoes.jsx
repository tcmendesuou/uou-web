import React, { useState } from 'react';
import { Building2, BadgeCheck, Plus, Upload, FileText, X } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from '../firebase';
import {
  COMPANY_ROLES, REQUEST_STATUS, formatCnpj, onlyDigits, validCnpj,
  useMyCompanies, useMyCompanyRequests,
} from '../lib/companies';

const MAX_FILE = 10 * 1024 * 1024; // 10 MB
const ACCEPT = '.pdf,.jpg,.jpeg,.png';
const EMPTY = {
  legalName: '', tradeName: '', cnpj: '', email: '', phone: '', site: '', relation: 'partner',
};

export default function Configuracoes() {
  const uid = auth.currentUser?.uid;
  const companies = useMyCompanies(uid);
  const requests = useMyCompanyRequests(uid);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [files, setFiles] = useState({ cnpjCard: null, idDoc: null, authLetter: null });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setFile = (k) => (e) => {
    const file = e.target.files?.[0] || null;
    if (file && file.size > MAX_FILE) { setError('Cada arquivo pode ter no máximo 10 MB.'); return; }
    setError('');
    setFiles((f) => ({ ...f, [k]: file }));
  };

  const openForm = () => { setForm(EMPTY); setFiles({ cnpjCard: null, idDoc: null, authLetter: null }); setError(''); setDone(false); setShowForm(true); };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const cnpj = onlyDigits(form.cnpj);
    const email = form.email.trim().toLowerCase();
    if (form.legalName.trim().length < 3) return setError('Informe a razão social.');
    if (!validCnpj(cnpj)) return setError('CNPJ inválido. Confira os números.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return setError('Informe um e-mail válido da empresa.');
    if (onlyDigits(form.phone).length < 10) return setError('Informe o telefone com DDD.');
    if (!files.cnpjCard) return setError('Anexe o Cartão CNPJ.');
    if (!files.idDoc) return setError('Anexe um documento com foto (RG ou CNH).');
    if (form.relation === 'authorized' && !files.authLetter) return setError('Anexe a carta de autorização da empresa.');
    if (requests.some((r) => r.cnpj === cnpj && r.status === 'pending')) {
      return setError('Você já tem um pedido em análise para esse CNPJ.');
    }
    if (companies?.some((c) => c.cnpj === cnpj)) return setError('Você já participa dessa empresa.');

    setSending(true);
    try {
      const id = (crypto?.randomUUID?.() || `${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/-/g, '');
      const paths = {};
      for (const [key, file] of Object.entries(files)) {
        if (!file) continue;
        if (key === 'authLetter' && form.relation !== 'authorized') continue;
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
        const path = `company_docs/${uid}/${id}/${key}.${ext}`;
        await uploadBytes(ref(storage, path), file);
        paths[key] = path;
      }
      await setDoc(doc(db, 'company_requests', id), {
        uid,
        legalName: form.legalName.trim(),
        tradeName: form.tradeName.trim(),
        cnpj,
        email,
        phone: onlyDigits(form.phone),
        site: form.site.trim(),
        relation: form.relation,
        docs: paths,
        status: 'pending',
        reason: '',
        createdAt: new Date().toISOString(),
      });
      setDone(true);
      setShowForm(false);
    } catch (err) {
      console.error('[Configuracoes] pedido de empresa falhou:', err);
      setError('Não foi possível enviar o pedido agora. Tente novamente. (' + (err?.code || err?.message || 'erro') + ')');
    } finally {
      setSending(false);
    }
  };

  const openRequests = requests.filter((r) => r.status !== 'approved');

  return (
    <div style={s.page}>
      <h2 style={s.title}>Configurações</h2>

      {/* ── Perfil profissional (virá depois) ── */}
      <section style={s.card}>
        <div style={s.cardHead}>
          <BadgeCheck size={22} color="#52fa35" />
          <div style={{ flex: 1 }}>
            <h3 style={s.h3}>Perfil profissional</h3>
            <p style={s.muted}>Transforme este perfil em profissional e ganhe ferramentas para criadores.</p>
          </div>
          <button type="button" style={s.btnDisabled} disabled>Em breve</button>
        </div>
      </section>

      {/* ── Empresas ── */}
      <section style={s.card}>
        <div style={s.cardHead}>
          <Building2 size={22} color="#52fa35" />
          <div style={{ flex: 1 }}>
            <h3 style={s.h3}>EMPRESAS</h3>
            <p style={s.muted}>Perfis de empresa dos quais você participa.</p>
          </div>
          {!showForm && (
            <button type="button" style={s.btn} onClick={openForm}>
              <Plus size={16} /> Solicitar perfil de empresa
            </button>
          )}
        </div>

        {companies === null && <p style={s.muted}>Carregando…</p>}
        {companies?.length === 0 && openRequests.length === 0 && !showForm && !done && (
          <p style={s.muted}>Você ainda não participa de nenhuma empresa.</p>
        )}

        {companies?.map((c) => (
          <div key={c.id} style={s.row}>
            <strong>{c.tradeName || c.legalName}</strong>
            <span style={s.role}>{COMPANY_ROLES[c.members?.[uid]] || 'Membro'}</span>
          </div>
        ))}

        {openRequests.map((r) => {
          const st = REQUEST_STATUS[r.status] || REQUEST_STATUS.pending;
          return (
            <div key={r.id} style={s.row}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{r.tradeName || r.legalName}</strong>
                <div style={s.muted}>CNPJ {formatCnpj(r.cnpj)}</div>
                {r.reason && <div style={{ ...s.muted, color: st.color }}>{r.reason}</div>}
              </div>
              <span style={{ ...s.badge, color: st.color, borderColor: st.color }}>{st.label}</span>
            </div>
          );
        })}

        {done && (
          <p style={s.ok}>Pedido enviado! Nossa equipe vai analisar os documentos e você verá o resultado aqui.</p>
        )}

        {showForm && (
          <form onSubmit={submit} style={s.form}>
            <div style={s.formHead}>
              <strong>Novo pedido de perfil de empresa</strong>
              <button type="button" style={s.x} onClick={() => setShowForm(false)} aria-label="Cancelar"><X size={18} /></button>
            </div>

            <label style={s.label}>Razão social *
              <input style={s.input} value={form.legalName} onChange={set('legalName')} maxLength={120} />
            </label>
            <label style={s.label}>Nome fantasia (como aparecerá no UOU)
              <input style={s.input} value={form.tradeName} onChange={set('tradeName')} maxLength={80} />
            </label>
            <label style={s.label}>CNPJ *
              <input
                style={s.input}
                value={form.cnpj}
                onChange={(e) => setForm((f) => ({ ...f, cnpj: formatCnpj(e.target.value) }))}
                placeholder="00.000.000/0000-00"
                inputMode="numeric"
              />
            </label>
            <div style={s.two}>
              <label style={s.label}>E-mail da empresa *
                <input style={s.input} type="email" value={form.email} onChange={set('email')} />
              </label>
              <label style={s.label}>Telefone com DDD *
                <input style={s.input} value={form.phone} onChange={set('phone')} inputMode="tel" />
              </label>
            </div>
            <label style={s.label}>Site (opcional)
              <input style={s.input} value={form.site} onChange={set('site')} placeholder="https://" />
            </label>

            <label style={s.label}>Qual é a sua relação com a empresa? *
              <select style={s.input} value={form.relation} onChange={set('relation')}>
                <option value="partner">Sou sócio(a) ou representante legal</option>
                <option value="authorized">Tenho autorização da empresa</option>
              </select>
            </label>

            <p style={{ ...s.muted, margin: '14px 0 6px' }}>Documentos (PDF, JPG ou PNG, até 10 MB cada)</p>
            <FileField label="Cartão CNPJ *" file={files.cnpjCard} onChange={setFile('cnpjCard')} />
            <FileField label="Documento com foto de quem está pedindo (RG ou CNH) *" file={files.idDoc} onChange={setFile('idDoc')} />
            {form.relation === 'authorized' && (
              <FileField label="Carta de autorização da empresa *" file={files.authLetter} onChange={setFile('authLetter')} />
            )}
            <p style={s.privacy}>
              Os documentos ficam em área privada, só a equipe do UOU vê e eles são apagados depois da análise.
            </p>

            {error && <p style={s.err}>{error}</p>}
            <button type="submit" style={s.send} disabled={sending}>
              {sending ? 'Enviando…' : 'Enviar pedido'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

function FileField({ label, file, onChange }) {
  return (
    <label style={s.file}>
      <span style={s.fileIcon}>{file ? <FileText size={18} color="#52fa35" /> : <Upload size={18} />}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13 }}>{label}</span>
        <span style={s.fileName}>{file ? file.name : 'Escolher arquivo'}</span>
      </span>
      <input type="file" accept={ACCEPT} onChange={onChange} style={{ display: 'none' }} />
    </label>
  );
}

const s = {
  page: { maxWidth: 760, margin: '0 auto', color: '#f0f0f0', fontFamily: 'inherit' },
  title: { fontSize: 24, fontWeight: 800, margin: '0 0 20px' },
  card: { background: '#0b0b10', border: '1px solid #1f1f27', borderRadius: 16, padding: 20, marginBottom: 18 },
  cardHead: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 },
  h3: { margin: 0, fontSize: 15, fontWeight: 800, letterSpacing: 0.5 },
  muted: { color: '#8a8a95', fontSize: 13, margin: '2px 0 0' },
  btn: {
    display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(82, 250, 53, 0.05)', color: '#52fa35',
    border: '1px solid #52fa35', borderRadius: 10, padding: '9px 14px', fontWeight: 700, fontSize: 13,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  btnDisabled: {
    background: '#16161d', color: '#666', border: '1px solid #26262e', borderRadius: 10,
    padding: '9px 14px', fontWeight: 600, fontSize: 13, fontFamily: 'inherit',
  },
  row: {
    display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between',
    background: '#12121a', border: '1px solid #20202a', borderRadius: 12, padding: 12, marginTop: 10,
  },
  role: { color: '#52fa35', fontSize: 12 },
  badge: { border: '1px solid', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' },
  ok: { color: '#52fa35', fontSize: 13, marginTop: 12 },
  form: { marginTop: 16, borderTop: '1px solid #1f1f27', paddingTop: 16 },
  formHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  x: { background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer' },
  label: { display: 'block', fontSize: 13, color: '#bbb', marginTop: 12 },
  input: {
    display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 5, background: '#12121a',
    border: '1px solid #26262e', borderRadius: 10, padding: '10px 12px', color: '#fff',
    fontSize: 14, fontFamily: 'inherit', outline: 'none',
  },
  two: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  file: {
    display: 'flex', alignItems: 'center', gap: 12, background: '#12121a', border: '1px dashed #333',
    borderRadius: 10, padding: '10px 12px', marginTop: 8, cursor: 'pointer', color: '#ddd',
  },
  fileIcon: { display: 'flex', color: '#888' },
  fileName: { display: 'block', fontSize: 12, color: '#8a8a95', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  privacy: { color: '#8a8a95', fontSize: 12, marginTop: 12 },
  err: { color: '#ff6b6b', fontSize: 13, marginTop: 10 },
  send: {
    marginTop: 14, width: '100%', background: 'rgba(82, 250, 53, 0.05)', color: '#52fa35',
    border: '1px solid #52fa35', borderRadius: 10,
    padding: 12, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
  },
};
