import React from 'react';
import { Building2 } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { auth } from '../firebase';
import { COMPANY_ROLES, formatCnpj } from '../lib/companies';

// Perfil da empresa — por enquanto só a base (as abas serão definidas no próximo passo).
export default function Empresa() {
  const { company } = useOutletContext() || {};
  const uid = auth.currentUser?.uid;

  if (!company) {
    return <p style={{ color: '#8a8a95' }}>Nenhuma empresa selecionada.</p>;
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', color: '#f0f0f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{
          width: 72, height: 72, borderRadius: 16, background: '#0a1a0a', border: '1px solid #1d3a1d',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
          {company.photoURL
            ? <img src={company.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <Building2 size={32} color="#52fa35" />}
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{company.tradeName || company.legalName}</h2>
          <div style={{ color: '#8a8a95', fontSize: 13, marginTop: 4 }}>
            {company.legalName} · CNPJ {formatCnpj(company.cnpj)}
          </div>
          <div style={{ color: '#52fa35', fontSize: 13, marginTop: 2 }}>
            Seu cargo: {COMPANY_ROLES[company.members?.[uid]] || 'Membro'}
          </div>
        </div>
      </div>
      <p style={{ color: '#8a8a95', fontSize: 14, marginTop: 28 }}>
        O perfil da empresa será montado aqui nos próximos passos.
      </p>
    </div>
  );
}
