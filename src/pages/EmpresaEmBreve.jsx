import React from 'react';
import { useParams } from 'react-router-dom';

const TITLES = {
  dashboard: 'Dashboard',
  parceiros: 'Parceiros',
  marketing: 'Marketing',
  posts: 'Posts',
  loja: 'Loja',
  financeiro: 'Financeiro',
  equipe: 'Equipe',
};

// Espaço reservado das abas que ainda vão ser construídas, uma por vez.
export default function EmpresaEmBreve() {
  const { tab } = useParams();
  return (
    <div style={{ maxWidth: 760, margin: '60px auto', textAlign: 'center', color: '#f0f0f0' }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 800 }}>{TITLES[tab] || 'Em breve'}</h2>
      <p style={{ color: '#8a8a95', fontSize: 14 }}>Esta área está sendo construída e chega em breve.</p>
    </div>
  );
}
