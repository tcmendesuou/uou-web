import React from 'react';

// ✅ Placeholder genérico pras telas que ainda vamos construir
// (Lives, Notificações, Carteira, Perfil, Visualização de Perfil, Criar, Chat).
export default function Placeholder({ title }) {
  return (
    <div>
      <h1 style={styles.title}>{title}</h1>
      <p style={styles.subtitle}>Essa tela ainda vai ser construída.</p>
    </div>
  );
}

const styles = {
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#fff',
    margin: 0,
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '15px',
    color: '#999',
    margin: 0,
  },
};
