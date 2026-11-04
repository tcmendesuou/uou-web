import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

// ── Cargos da empresa (o que cada um pode fazer será definido depois) ──
export const COMPANY_ROLES = {
  owner: 'Dono',
  admin: 'Admin',
  manager: 'Gestor',
  production: 'Produção',
  finance: 'Financeiro',
};

// Quem pode editar o perfil da empresa (o que cada cargo faz no resto será definido depois)
export const canEditCompany = (company, uid) =>
  !!company && company.status !== 'suspended' && ['owner', 'admin'].includes(company.members?.[uid]);

export const isSuspended = (company) => company?.status === 'suspended';

// Registro interno de atividades da empresa (quem fez o quê e quando)
export async function logCompanyActivity(companyId, uid, type, extra = {}) {
  try {
    const id = (crypto?.randomUUID?.() || `${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/-/g, '');
    await setDoc(doc(db, 'company_activity', id), {
      companyId, uid, type, at: new Date().toISOString(), ...extra,
    });
  } catch (e) {
    console.warn('[companies] não foi possível registrar a atividade:', e?.code || e?.message);
  }
}

export const REQUEST_STATUS = {
  pending: { label: 'Em análise', color: '#f5c542' },
  approved: { label: 'Aprovado', color: '#52fa35' },
  rejected: { label: 'Recusado', color: '#ff4444' },
  needs_docs: { label: 'Precisa de novo documento', color: '#ff9f43' },
};

export const onlyDigits = (s) => String(s || '').replace(/\D/g, '');

export function formatCnpj(v) {
  const d = onlyDigits(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

// Valida os dígitos verificadores do CNPJ (só formato/dígitos; não consulta a Receita).
export function validCnpj(value) {
  const c = onlyDigits(value);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (len) => {
    let sum = 0;
    let pos = len - 7;
    for (let i = len; i >= 1; i--) {
      sum += Number(c[len - i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}

// ── Empresa ativa (qual perfil está aberto agora) — salva no navegador ──
const ACTIVE_KEY = 'uou_web_company';
export const getActiveCompanyId = () => {
  try { return localStorage.getItem(ACTIVE_KEY) || null; } catch { return null; }
};
export const setActiveCompanyId = (id) => {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch { /* sem localStorage: ignora */ }
};

// Empresas das quais o usuário participa (companies.memberUids contém o uid).
export function useMyCompanies(uid) {
  const [companies, setCompanies] = useState(null); // null = carregando
  useEffect(() => {
    if (!uid) { setCompanies([]); return undefined; }
    const q = query(collection(db, 'companies'), where('memberUids', 'array-contains', uid));
    return onSnapshot(
      q,
      (snap) => setCompanies(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setCompanies([]),
    );
  }, [uid]);
  return companies;
}

// Pedidos de abertura de perfil de empresa feitos por este usuário.
export function useMyCompanyRequests(uid) {
  const [requests, setRequests] = useState([]);
  useEffect(() => {
    if (!uid) return undefined;
    const q = query(collection(db, 'company_requests'), where('uid', '==', uid));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        setRequests(list);
      },
      () => setRequests([]),
    );
  }, [uid]);
  return requests;
}
