import React from 'react';

// ⚠️ Placeholder — ainda não está ligado aos Stories reais.
// Assim que tivermos o componente de Stories/Highlights do App (pra saber
// certinho os campos da coleção 'stories'/'highlights'), a gente troca isso
// pela versão real com dados do Firestore.
export default function Highlights() {
  return (
    <div style={styles.container}>
      <p style={styles.placeholderText}>Stories em breve aqui</p>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    paddingBottom: '20px',
    marginBottom: '20px',
    borderBottom: '1px solid #1a1a1a',
    overflowX: 'auto',
    minHeight: '48px',
  },
  placeholderText: {
    fontSize: '13px',
    color: '#555',
    margin: 0,
  },
};
