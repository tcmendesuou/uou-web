import React from 'react';
import { Building2, Globe, Mail, Phone, Pencil, Eye } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { auth } from '../firebase';
import { COMPANY_ROLES, canEditCompany, formatCnpj } from '../lib/companies';

const fmtPhone = (v) => {
  const d = String(v || '').replace(/\D/g, '');
  return d.length === 11 ? d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3')
    : d.length === 10 ? d.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3') : v;
};

// Aba "Perfil": mostra à equipe como a empresa aparece para o público.
export default function Empresa() {
  const { company } = useOutletContext() || {};
  const navigate = useNavigate();
  const uid = auth.currentUser?.uid;

  if (!company) return <p style={{ color: '#8a8a95' }}>Nenhuma empresa selecionada.</p>;

  const name = company.tradeName || company.legalName;
  const canEdit = canEditCompany(company, uid);

  return (
    <div style={s.page}>
      <div style={s.previewBar}>
        <Eye size={15} /> É assim que o público vê o perfil da sua empresa
        {canEdit && (
          <button type="button" style={s.editBtn} onClick={() => navigate('/empresa/configuracoes')}>
            <Pencil size={14} /> Editar perfil
          </button>
        )}
      </div>

      <div style={s.card}>
        <div style={{ ...s.banner, ...(company.bannerURL ? { backgroundImage: `url(${company.bannerURL})` } : {}) }}>
          {!company.bannerURL && <span style={s.bannerHint}>Sem banner</span>}
        </div>

        <div style={s.logoWrap}>
          <div style={s.logo}>
            {company.photoURL
              ? <img src={company.photoURL} alt="" style={s.logoImg} />
              : <Building2 size={34} color="#52fa35" />}
          </div>
        </div>

        <div style={s.body}>
          <h1 style={s.name}>{name}</h1>
          <div style={s.badge}>Empresa verificada</div>
          {company.bio
            ? <p style={s.bio}>{company.bio}</p>
            : <p style={s.bioEmpty}>Adicione uma bio em Editar perfil.</p>}

          <div style={s.links}>
            {company.site && <span style={s.link}><Globe size={14} /> {company.site}</span>}
            {company.email && <span style={s.link}><Mail size={14} /> {company.email}</span>}
            {company.phone && <span style={s.link}><Phone size={14} /> {fmtPhone(company.phone)}</span>}
          </div>
        </div>
      </div>

      <div style={s.internal}>
        <strong>Visível só para a equipe:</strong> {company.legalName} · CNPJ {formatCnpj(company.cnpj)} · Seu cargo: {COMPANY_ROLES[company.members?.[uid]] || 'Membro'}
      </div>
      <p style={s.note}>As seções de Lives, Publicações e Promoções aparecem aqui conforme forem criadas.</p>
    </div>
  );
}

const s = {
  page: { maxWidth: 860, margin: '0 auto', color: '#f0f0f0', fontFamily: 'inherit' },
  previewBar: {
    display: 'flex', alignItems: 'center', gap: 8, color: '#8a8a95', fontSize: 13, marginBottom: 12,
  },
  editBtn: {
    marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(82, 250, 53, 0.05)',
    color: '#52fa35', border: '1px solid #52fa35', borderRadius: 10, padding: '7px 14px', fontSize: 13,
    fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },
  card: { background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 16, overflow: 'hidden' },
  banner: {
    width: '100%', aspectRatio: '16 / 5', background: 'linear-gradient(135deg, #0a1a0a, #111)',
    backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  bannerHint: { color: '#3a3a44', fontSize: 13 },
  logoWrap: { padding: '0 28px', marginTop: -44 },
  logo: {
    width: 92, height: 92, borderRadius: 20, background: '#0a1a0a', border: '4px solid #0d0d0d',
    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  logoImg: { width: '100%', height: '100%', objectFit: 'cover' },
  body: { padding: '12px 28px 28px' },
  name: { margin: 0, fontSize: 24, fontWeight: 800 },
  badge: {
    display: 'inline-block', marginTop: 6, color: '#52fa35', background: 'rgba(82,250,53,0.12)',
    borderRadius: 10, padding: '3px 8px', fontSize: 11, fontWeight: 700,
  },
  bio: { color: '#bbb', fontSize: 14, lineHeight: 1.5, margin: '14px 0 0', whiteSpace: 'pre-wrap' },
  bioEmpty: { color: '#555', fontSize: 13, margin: '14px 0 0' },
  links: { display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 14 },
  link: { display: 'flex', alignItems: 'center', gap: 6, color: '#8a8a95', fontSize: 13 },
  internal: {
    marginTop: 16, background: '#0b0b10', border: '1px dashed #26262e', borderRadius: 12,
    padding: '10px 14px', fontSize: 12, color: '#8a8a95',
  },
  note: { color: '#555', fontSize: 12, marginTop: 10 },
};
