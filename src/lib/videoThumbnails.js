// ✅ Gera uma tira de miniaturas de um vídeo (local ou remoto) capturando
// frames num <canvas> em pontos igualmente espaçados. Usado pra desenhar a
// timeline visual do editor.
//
// Atenção: pra vídeos remotos (ex: um "bruto" que já está no Firebase
// Storage), o navegador só deixa ler os pixels do frame (toDataURL) se o
// bucket permitir CORS pra esse domínio. Se o bucket não tiver CORS
// configurado, isso falha silenciosamente aqui e a timeline desse clipe
// aparece sem miniaturas (mas o corte por arraste continua funcionando
// normalmente, só sem a prévia visual dos frames).
export function generateThumbnails(url, duration, count = 10) {
  return new Promise((resolve) => {
    if (!duration || duration <= 0) {
      resolve([]);
      return;
    }

    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 114;
    const ctx = canvas.getContext('2d');

    const thumbs = [];
    let index = 0;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(thumbs);
    };

    const seekNext = () => {
      if (index >= count) {
        finish();
        return;
      }
      const t = Math.min(duration * (index / count), Math.max(0, duration - 0.05));
      try {
        video.currentTime = t;
      } catch {
        finish();
      }
    };

    video.addEventListener('loadedmetadata', seekNext);

    video.addEventListener('seeked', () => {
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        thumbs.push(canvas.toDataURL('image/jpeg', 0.55));
      } catch (err) {
        // canvas "tainted" por CORS — para de tentar, mas não quebra o editor
        finish();
        return;
      }
      index++;
      seekNext();
    });

    video.addEventListener('error', finish);

    // Timeout de segurança — nunca deixa o editor travado esperando
    setTimeout(finish, 8000);
  });
}
