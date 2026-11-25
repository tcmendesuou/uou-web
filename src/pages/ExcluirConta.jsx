import React from 'react';

// Página pública (sem login) exigida pela Google Play: como pedir a exclusão
// da conta e dos dados. Rota: /excluir-conta
const CONTACT_EMAIL = 'thiago@uoulive.com';
const MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Excluir conta UOU')}`;

export default function ExcluirConta() {
  return (
    <div style={styles.page}>
      <main style={styles.card}>
        <h1 style={styles.title}>Excluir conta do UOU</h1>
        <p style={styles.text}>
          Aqui você pede a exclusão da sua conta no aplicativo <strong>UOU</strong> e dos dados
          associados a ela.
        </p>

        <h2 style={styles.subtitle}>Como pedir</h2>
        <ol style={styles.list}>
          <li>
            Envie um e-mail para{' '}
            <a style={styles.link} href={MAILTO}>{CONTACT_EMAIL}</a>, a partir do e-mail
            cadastrado no UOU.
          </li>
          <li>Use o assunto <strong>"Excluir conta UOU"</strong>.</li>
          <li>
            Após confirmarmos que a conta é sua, excluímos o cadastro e o perfil em até
            15 dias.
          </li>
        </ol>

        <a style={styles.button} href={MAILTO}>Pedir exclusão por e-mail</a>

        <h2 style={styles.subtitle}>O que é excluído</h2>
        <p style={styles.text}>
          Sua conta de acesso e o seu perfil (nome, foto, biografia e demais dados do cadastro).
        </p>

        <h2 style={styles.subtitle}>O que pode ser mantido</h2>
        <p style={styles.text}>
          Registros de transações financeiras (compras, doações e saques) podem ser mantidos
          pelo prazo exigido pela legislação.
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
  title: { margin: '0 0 12px', fontSize: 28, color: '#52fa35' },
  subtitle: { margin: '28px 0 8px', fontSize: 18 },
  text: { margin: '0 0 8px', fontSize: 15, lineHeight: 1.6, color: '#c9cbd6' },
  list: { margin: '0 0 20px', paddingLeft: 20, fontSize: 15, lineHeight: 1.7, color: '#c9cbd6' },
  link: { color: '#52fa35' },
  button: {
    display: 'inline-block',
    backgroundColor: '#52fa35',
    color: '#010208',
    fontWeight: 700,
    fontSize: 15,
    textDecoration: 'none',
    padding: '12px 20px',
    borderRadius: 10,
  },
};
