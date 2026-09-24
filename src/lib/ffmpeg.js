import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

// ✅ Core single-thread do ffmpeg.wasm, carregado via CDN (jsdelivr) como
// blob URL — evita precisar configurar headers COOP/COEP no Vercel/Vite
// (que só são exigidos pela versão multi-thread).
const CORE_BASE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';

let ffmpegInstance = null;
let loadingPromise = null;

// ✅ Carrega o ffmpeg uma única vez e reaproveita a instância entre edições
// (o download do .wasm tem alguns MB, não vale a pena repetir).
export async function getFFmpeg(onLog) {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const ffmpeg = new FFmpeg();
    if (onLog) {
      ffmpeg.on('log', ({ message }) => onLog(message));
    }
    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return loadingPromise;
}
