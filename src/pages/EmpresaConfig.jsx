import React, { useEffect, useState } from 'react';
import { Camera, Building2 } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useOutletContext } from 'react-router-dom';
import { auth, db, storage } from '../firebase';
import { canEditCompany, formatCnpj, logCompanyActivity } from '../lib/companies';
import ImageCropper from '../components/ImageCropper';

const MAX_IMG = 5 * 1024 * 1024; // 5 MB

export default function EmpresaConfig() {
  const { company } = useOutletContext() || {};
  const uid = auth.currentUser?.uid;
  const canEdit = canEditCompany(company, uid);

  const [form, setForm] = useState({ tradeName: '', bio: '', site: '', email: '', phone: '' });
  const [logo, setLogo] = useState(null);   // { file, preview }
  const [banner, setBanner] = useState(null);
  const [cropping, setCropping] = useState(null); // { kind: 'logo' | 'banner', file }
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  useEffect(() => {
    if (!company) return;
    setForm({
      tradeName: company.tradeName || company.legalName || '',
      bio: company.bio || '',
      site: company.site || '',
      email: company.email || '',
      phone: company.phone || '',
    });
  }, [company?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!company) return <p style={{ color: '#8a8a95' }}>Nenhuma empresa selecionada.</p>;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pick = (kind) => (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setMsg({ type: 'err', text: 'Escolha um arquivo de imagem.' }); return; }
    if (file.size > MAX_IMG) { setMsg({ type: 'err', text: 'A imagem pode ter no máximo 5 MB.' }); return; }
    setMsg({ type: '', text: '' });
    setCropping({ kind, file }); // abre o ajuste de tamanho/posição
  };

  const cropped = (file) => {
    const item = { file, preview: URL.createObjectURL(file) };
    if (cropping?.kind === 'logo') setLogo(item); else setBanner(item);
    setCropping(null);
  };

  const upload = async (item, kind) => {
    const ext = (item.file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const r = ref(storage, `company_assets/${company.id}/${kind}_${Date.now()}.${ext}`);
    await uploadBytes(r, item.file);
    return getDownloadURL(r);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!canEdit) return;
    if (form.tradeName.trim().length < 2) return setMsg({ type: 'err', text: 'Informe o nome da empresa.' });
    setSaving(true);
    setMsg({ type: '', text: '' });
    try {
      const data = {
        tradeName: form.tradeName.trim(),
        bio: form.bio.trim().slice(0, 500),
        site: form.site.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.replace(/\D/g, ''),
      };
      if (logo) data.photoURL = await upload(logo, 'logo');
      if (banner) data.bannerURL = await upload(banner, 'banner');
      await updateDoc(doc(db, 'companies', company.id), data);
      logCompanyActivity(company.id, uid, 'profile_update', { fields: Object.keys(data) });
      setLogo(null); setBanner(null);
      setMsg({ type: 'ok', text: 'Perfil da empresa atualizado.' });
    } catch (err) {
      console.error('[EmpresaConfig]', err);
      setMsg({ type: 'err', text: 'Não foi possível salvar agora. (' + (err?.code || err?.message || 'erro') + ')' });
    } finally {
      setSaving(false);
    }
  };

  const bannerSrc = banner?.preview || company.bannerURL;
  const logoSrc = logo?.preview || company.photoURL;

  return (
    <form onSubmit={save} style={s.page}>
      {cropping && (
        <ImageCropper
          file={cropping.file}
          aspect={cropping.kind === 'logo' ? 1 : 16 / 5}
          outW={cropping.kind === 'logo' ? 512 : 1600}
          round={cropping.kind === 'logo'}
          title={cropping.kind === 'logo' ? 'Ajustar logo' : 'Ajustar banner'}
          onCancel={() => setCropping(null)}
          onDone={cropped}
        />
      )}
      <h2 style={s.title}>Configurações da empresa</h2>
      {!canEdit && <p style={s.warn}>Só o Dono e o Admin da empresa podem editar estes dados.</p>}

      <label style={s.bannerPick}>
        <div style={{ ...s.banner, ...(bannerSrc ? { backgroundImage: `url(${bannerSrc})` } : {}) }}>
          <span style={s.pickHint}><Camera size={16} /> {bannerSrc ? 'Trocar banner' : 'Adicionar banner'} (proporção 16:5)</span>
        </div>
        {canEdit && <input type="file" accept="image/*" onChange={pick('banner')} style={{ display: 'none' }} />}
      </label>

      <label style={s.logoPick}>
        <div style={s.logo}>
          {logoSrc ? <img src={logoSrc} alt="" style={s.logoImg} /> : <Building2 size={30} color="#52fa35" />}
          {canEdit && <span style={s.logoCam}><Camera size={13} color="#000" /></span>}
        </div>
        {canEdit && <input type="file" accept="image/*" onChange={pick('logo')} style={{ display: 'none' }} />}
      </label>

      <label style={s.label}>Nome da empresa
        <input style={s.input} value={form.tradeName} onChange={set('tradeName')} maxLength={80} disabled={!canEdit} />
      </label>
      <label style={s.label}>Bio
        <textarea style={{ ...s.input, minHeight: 90, resize: 'vertical' }} value={form.bio} onChange={set('bio')} maxLength={500} disabled={!canEdit} />
      </label>
      <label style={s.label}>Site
        <input style={s.input} value={form.site} onChange={set('site')} placeholder="https://" disabled={!canEdit} />
      </label>
      <div style={s.two}>
        <label style={s.label}>E-mail de contato
          <input style={s.input} type="email" value={form.email} onChange={set('email')} disabled={!canEdit} />
        </label>
        <label style={s.label}>Telefone
          <input style={s.input} value={form.phone} onChange={set('phone')} inputMode="tel" disabled={!canEdit} />
        </label>
      </div>

      <div style={s.locked}>
        <div><span style={s.lockLabel}>Razão social</span><br />{company.legalName}</div>
        <div><span style={s.lockLabel}>CNPJ</span><br />{formatCnpj(company.cnpj)}</div>
        <p style={s.lockNote}>Razão social e CNPJ só podem ser alterados pela equipe do UOU.</p>
      </div>

      {msg.text && <p style={msg.type === 'ok' ? s.ok : s.err}>{msg.text}</p>}
      {canEdit && (
        <button type="submit" style={s.save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar alterações'}</button>
      )}
    </form>
  );
}

const s = {
  page: { maxWidth: 760, margin: '0 auto', color: '#f0f0f0', fontFamily: 'inherit', paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: 800, margin: '0 0 16px' },
  warn: { color: '#ff9f43', fontSize: 13, marginBottom: 12 },
  bannerPick: { display: 'block', cursor: 'pointer' },
  banner: {
    width: '100%', aspectRatio: '16 / 5', borderRadius: 14, border: '1px dashed #333', background: '#12121a',
    backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
  },
  pickHint: {
    display: 'flex', alignItems: 'center', gap: 6, margin: 10, background: 'rgba(0,0,0,0.65)', color: '#fff',
    borderRadius: 10, padding: '6px 10px', fontSize: 12,
  },
  logoPick: { display: 'inline-block', marginTop: -40, marginLeft: 24, cursor: 'pointer' },
  logo: {
    position: 'relative', width: 84, height: 84, borderRadius: 18, background: '#0a1a0a', border: '4px solid #010208',
    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  logoImg: { width: '100%', height: '100%', objectFit: 'cover' },
  logoCam: {
    position: 'absolute', right: 4, bottom: 4, width: 22, height: 22, borderRadius: 11, background: '#52fa35',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  label: { display: 'block', fontSize: 13, color: '#bbb', marginTop: 14 },
  input: {
    display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 5, background: '#12121a',
    border: '1px solid #26262e', borderRadius: 10, padding: '10px 12px', color: '#fff', fontSize: 14,
    fontFamily: 'inherit', outline: 'none',
  },
  two: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  locked: {
    marginTop: 20, background: '#0b0b10', border: '1px solid #1f1f27', borderRadius: 12, padding: 14,
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 14,
  },
  lockLabel: { color: '#8a8a95', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  lockNote: { gridColumn: '1 / -1', color: '#666', fontSize: 12, margin: 0 },
  ok: { color: '#52fa35', fontSize: 13, marginTop: 14 },
  err: { color: '#ff6b6b', fontSize: 13, marginTop: 14 },
  save: {
    marginTop: 16, width: '100%', background: 'rgba(82, 250, 53, 0.05)', color: '#52fa35',
    border: '1px solid #52fa35', borderRadius: 10, padding: 12, fontWeight: 800, fontSize: 14,
    cursor: 'pointer', fontFamily: 'inherit',
  },
};
