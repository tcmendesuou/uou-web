import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Highlights from '../components/Highlights';
import FeedTopBar from '../components/FeedTopBar';
import PostFeed from '../components/PostFeed';

export default function Home() {
  const { isCreator } = useOutletContext();
  const [selectedTab, setSelectedTab] = useState('para-voce');
  const [searchText, setSearchText] = useState('');

  if (isCreator) {
    return (
      <div>
        <h1 style={styles.title}>Dashboard</h1>
        <p style={styles.subtitle}>
          Aqui vamos mostrar o resumo de lives, posts e desempenho do criador.
        </p>
      </div>
    );
  }

  return (
    <div>
      <Highlights />
      <FeedTopBar
        selectedTab={selectedTab}
        onSelectTab={setSelectedTab}
        searchText={searchText}
        onSearchChange={setSearchText}
      />
      <PostFeed selectedTab={selectedTab} searchText={searchText} />
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
