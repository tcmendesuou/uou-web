import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, User, X, Plus, ChevronRight } from 'lucide-react';
import { COMPANY_ROLES } from '../lib/companies';

// Ícone do header: no perfil pessoal abre a lista de empresas; dentro de uma empresa vira "Perfil pessoal".
export default function CompanySwitcher({ uid, companies, activeCompany, onEnter, onLeave }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Sem empresas e no perfil pessoal: o ícone nem aparece (o pedido fica em Configurações).
  if (!activeCompany && (!companies || companies.length === 0)) return null;

  const handleClick = () => {
    if (activeCompany) { onLeave(); return; }
    setOpen(true);
  };

  const pick = (c) => { setOpen(false); onEnter(c); };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        style={s.iconBtn}
        title={activeCompany ? 'Voltar ao perfil pessoal' : 'Empresas'}
        aria-label={activeCompany ? 'Voltar ao perfil pessoal' : 'Empresas'}
      >
        {activeCompany ? <User size={20} /> : <Building2 size={20} />}
        <span style={s.iconLabel}>{activeCompany ? 'Perfil pessoal' : 'Empresas'}</span>
      </button>

      {open && (
        <div style={s.overlay} onClick={() => setOpen(false)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalHead}>
              <h3 style={s.modalTitle}>Suas empresas</h3>
              <button type="button" style={s.close} onClick={() => setOpen(false)} aria-label="Fechar">
                <X size={20} />
              </button>
            </div>
            <p style={s.hint}>Escolha uma empresa para entrar no perfil dela.</p>

            <div style={s.list}>
              {companies.map((c) => (
                <button key={c.id} type="button" style={s.row} onClick={() => pick(c)}>
                  <div style={s.avatar}>
                    {c.photoURL
                      ? <img src={c.photoURL} alt="" style={s.avatarImg} />
                      : <Building2 size={20} color="#52fa35" />}
                  </div>
                  <div style={s.rowText}>
                    <strong style={s.rowName}>{c.tradeName || c.legalName}</strong>
                    <span style={s.rowRole}>{COMPANY_ROLES[c.members?.[uid]] || 'Membro'}{c.status === 'suspended' ? ' · Suspensa' : ''}</span>
                  </div>
                  <ChevronRight size={18} color="#666" />
                </button>
              ))}
            </div>

            <button
              type="button"
              style={s.newBtn}
              onClick={() => { setOpen(false); navigate('/configuracoes'); }}
            >
              <Plus size={16} /> Solicitar outro perfil de empresa
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const s = {
  iconBtn: {
    display: 'flex', alignItems: 'center', gap: 8, marginRight: 18,
    background: '#0f0f14', border: '1px solid #26262e', color: '#f0f0f0',
    borderRadius: 20, padding: '7px 14px', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
  },
  iconLabel: { whiteSpace: 'nowrap' },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  modal: {
    width: '100%', maxWidth: 420, background: '#0b0b10', border: '1px solid #1f1f27',
    borderRadius: 16, padding: 20, color: '#f0f0f0', fontFamily: 'inherit',
  },
  modalHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { margin: 0, fontSize: 18, fontWeight: 700 },
  close: { background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer' },
  hint: { color: '#8a8a95', fontSize: 13, margin: '6px 0 14px' },
  list: { display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' },
  row: {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
    background: '#12121a', border: '1px solid #20202a', borderRadius: 12, padding: 12,
    color: 'inherit', cursor: 'pointer', fontFamily: 'inherit',
  },
  avatar: {
    width: 40, height: 40, borderRadius: 10, background: '#0a1a0a', border: '1px solid #1d3a1d',
    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  rowText: { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 },
  rowName: { fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowRole: { fontSize: 12, color: '#52fa35' },
  newBtn: {
    marginTop: 14, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    background: 'transparent', border: '1px dashed #333', color: '#bbb', borderRadius: 12,
    padding: 11, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
  },
};
