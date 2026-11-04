import { useEffect, useState, useCallback } from 'react';
import {
  doc, getDoc, setDoc, deleteDoc, updateDoc, increment, collection, addDoc, query, orderBy, onSnapshot,
} from 'firebase/firestore';
import { auth, db } from '../firebase';

// Mesmos documentos e contadores do app (hooks/useLike.js e components/CommentsModal.js)
const NOTIF_BY_TYPE = { video: 'curtiu seu vídeo', carousel: 'curtiu seu carrossel' };

export const postLink = (postId) => `${window.location.origin}/p/${postId}`;

async function myProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.data() || {};
}

// Curtir / descurtir: likes/{uid_postId} + contador posts.likes + notificação
export function usePostLike(post) {
  const uid = auth.currentUser?.uid;
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(post?.likes || 0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (!uid || !post?.id) return undefined;
    getDoc(doc(db, 'likes', `${uid}_${post.id}`))
      .then((s) => { if (active) setLiked(s.exists()); })
      .catch(() => {});
    return () => { active = false; };
  }, [uid, post?.id]);

  useEffect(() => {
    if (post?.likes !== undefined) setCount(post.likes);
  }, [post?.likes]);

  const toggle = useCallback(async () => {
    if (!uid || !post?.id || busy) return;
    setBusy(true);
    const likeRef = doc(db, 'likes', `${uid}_${post.id}`);
    const postRef = doc(db, 'posts', post.id);
    // Atualiza a tela UMA vez, com valor fixo (o feed também atualiza o contador sozinho
    // quando o Firestore grava; somar de novo aqui contava em dobro).
    const next = Math.max(0, count + (liked ? -1 : 1));
    try {
      if (liked) {
        setLiked(false);
        setCount(next);
        await deleteDoc(likeRef);
        await updateDoc(postRef, { likes: increment(-1) });
      } else {
        setLiked(true);
        setCount(next);
        await setDoc(likeRef, {
          userId: uid, postId: post.id, postOwnerId: post.userId, createdAt: new Date().toISOString(),
        });
        await updateDoc(postRef, { likes: increment(1) });
        if (post.userId !== uid) {
          const u = await myProfile(uid);
          await addDoc(collection(db, 'notifications'), {
            userId: post.userId,
            type: 'like',
            message: NOTIF_BY_TYPE[post.mediaType] || 'curtiu seu post',
            fromUserId: uid,
            fromUserName: u.name || 'Usuário',
            fromUserPhoto: u.photoURL || null,
            postId: post.id,
            read: false,
            createdAt: new Date().toISOString(),
          });
        }
      }
    } catch (e) {
      console.error('Erro ao curtir:', e);
      setLiked(liked);
      setCount(count);
    } finally {
      setBusy(false);
    }
  }, [uid, post, liked, count, busy]);

  return { liked, count, toggle };
}

// Comentários em tempo real (só escuta quando "enabled")
export function usePostComments(postId, enabled) {
  const [comments, setComments] = useState(null);
  useEffect(() => {
    if (!enabled || !postId) return undefined;
    const q = query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (s) => setComments(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setComments([]));
  }, [postId, enabled]);
  return comments;
}

export async function sendPostComment(post, text) {
  const uid = auth.currentUser?.uid;
  const clean = text.trim().slice(0, 500);
  if (!uid || !clean) return;
  const u = await myProfile(uid);
  await addDoc(collection(db, 'posts', post.id, 'comments'), {
    userId: uid, userName: u.name || 'Usuário', userPhoto: u.photoURL || null, text: clean,
    createdAt: new Date().toISOString(),
  });
  await updateDoc(doc(db, 'posts', post.id), { commentsCount: increment(1) });
  if (post.userId && post.userId !== uid) {
    await addDoc(collection(db, 'notifications'), {
      userId: post.userId,
      type: 'comment',
      message: `comentou: "${clean.substring(0, 30)}${clean.length > 30 ? '...' : ''}"`,
      fromUserId: uid,
      fromUserName: u.name || 'Usuário',
      fromUserPhoto: u.photoURL || null,
      postId: post.id,
      read: false,
      createdAt: new Date().toISOString(),
    });
  }
}

export async function deletePostComment(postId, commentId) {
  await deleteDoc(doc(db, 'posts', postId, 'comments', commentId));
  await updateDoc(doc(db, 'posts', postId), { commentsCount: increment(-1) });
}

export function commentTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return 'Agora';
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  if (m < 10080) return `${Math.floor(m / 1440)}d`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
