import React from 'react';
import { useOutletContext } from 'react-router-dom';

export default function Home() {
  const { isCreator } = useOutletContext();

  return (
    <div>
      <h1 style={styles.title}>{isCreator ? 'Dashboard' : 'Home'}</h1>
      <p style={styles.subtitle}>
        {isCreator
          ? 'Aqui vamos mostrar o resumo de lives, posts e desempenho do criador.'
          : 'Aqui vai o feed principal do usuário.'}
      </p>
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
