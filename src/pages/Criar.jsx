import React from 'react';
import { Film } from 'lucide-react';

// Reservado pro Editor de Vídeo do criador — parte do plano de longo prazo
// de empacotar a Web em Electron pra dar acesso nativo (GPU/ffmpeg) e
// permitir edição pesada de vídeo direto por aqui.
export default function Criar() {
  return (
    <div style={styles.container}>
      <div style={styles.iconWrap}>
        <Film size={40} color="#52fa35" />
      </div>
      <h1 style={styles.title}>Editor de Vídeo</h1>
      <p style={styles.subtitle}>
        Em breve você vai poder editar seus vídeos direto por aqui — cortar,
        juntar clipes, adicionar texto e exportar pronto pra postar.
      </p>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '80px 20px',
    fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: '50%',
    backgroundColor: 'rgba(82,250,53,0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    color: '#f0f0f0',
    fontSize: 22,
    fontWeight: 700,
    margin: '0 0 10px 0',
  },
  subtitle: {
    color: '#999',
    fontSize: 14,
    lineHeight: 1.6,
    maxWidth: 380,
    margin: 0,
  },
};
