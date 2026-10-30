// src/pages/EditorTeste.jsx
// Página de teste do editor (sem biblioteca): abre o editor vazio e baixa o MP4 ao exportar.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import VideoEditor from '../components/VideoEditor';

export default function EditorTeste() {
  const navigate = useNavigate();
  return <VideoEditor onClose={() => navigate(-1)} />;
}
