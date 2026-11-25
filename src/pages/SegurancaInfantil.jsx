import React from 'react';

// Página pública (sem login) exigida pela Google Play para apps sociais:
// padrões contra abuso e exploração sexual infantil (CSAE). Rota: /seguranca-infantil
const CONTACT_EMAIL = 'thiago@uoulive.com';
const MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Segurança infantil UOU')}`;

export default function SegurancaInfantil() {
  return (
    <div style={styles.page}>
      <main style={styles.card}>
        <h1 style={styles.title}>Padrões de segurança infantil do UOU</h1>
        <p style={styles.text}>
          O <strong>UOU</strong> tem tolerância zero com abuso e exploração sexual infantil
          (CSAE), incluindo material de abuso sexual infantil (CSAM).
        </p>

        <h2 style={styles.subtitle}>O que é proibido</h2>
        <ul style={styles.list}>
          <li>Qualquer imagem, vídeo, áudio, texto ou transmissão ao vivo que sexualize crianças e adolescentes.</li>
          <li>Aliciamento, assédio ou tentativa de contato sexual com menores de idade.</li>
          <li>Extorsão sexual e qualquer forma de exploração de crianças e adolescentes.</li>
        </ul>

        <h2 style={styles.subtitle}>Como denunciar</h2>
        <ul style={styles.list}>
          <li>
            Envie um e-mail para <a style={styles.link} href={MAILTO}>{CONTACT_EMAIL}</a> com o
            link ou o nome do perfil, post ou live e uma breve descrição.
          </li>
        </ul>

        <h2 style={styles.subtitle}>O que fazemos</h2>
        <ul style={styles.list}>
          <li>Analisamos as denúncias recebidas.</li>
          <li>Removemos o conteúdo que viola estas regras e podemos suspender ou banir as contas envolvidas.</li>
          <li>Casos de material de abuso sexual infantil são comunicados às autoridades competentes, conforme a legislação.</li>
        </ul>

        <h2 style={styles.subtitle}>Contato para assuntos de segurança infantil</h2>
        <p style={styles.text}>
          <a style={styles.link} href={MAILTO}>{CONTACT_EMAIL}</a>
        </p>
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#010208',
    color: '#ffffff',
    fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
    display: 'flex',
    justifyContent: 'center',
    padding: '48px 16px',
    boxSizing: 'border-box',
  },
  card: {
    width: '100%',
    maxWidth: 640,
    backgroundColor: '#0d0e14',
    border: '1px solid #1e2030',
    borderRadius: 16,
    padding: '32px 28px',
    boxSizing: 'border-box',
    alignSelf: 'flex-start',
  },
  title: { margin: '0 0 12px', fontSize: 26, color: '#52fa35' },
  subtitle: { margin: '28px 0 8px', fontSize: 18 },
  text: { margin: '0 0 8px', fontSize: 15, lineHeight: 1.6, color: '#c9cbd6' },
  list: { margin: '0 0 12px', paddingLeft: 20, fontSize: 15, lineHeight: 1.7, color: '#c9cbd6' },
  link: { color: '#52fa35' },
};
