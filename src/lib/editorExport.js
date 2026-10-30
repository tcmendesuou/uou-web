// src/lib/editorExport.js
// Exportação do editor de vídeo do UOU: junta os clipes (já cortados) numa linha
// do tempo e gera um MP4 no próprio navegador, usando WebCodecs (hardware).
// Nada é enviado para servidor. Biblioteca: mediabunny (MPL-2.0).
import {
  ALL_FORMATS, AudioBufferSink, AudioBufferSource, BlobSource, BufferTarget, CanvasSink, CanvasSource,
  Input, Mp4OutputFormat, Output, QUALITY_HIGH, UrlSource,
  getFirstEncodableAudioCodec, getFirstEncodableVideoCodec,
} from 'mediabunny';

export const OUTPUT_SIZES = {
  '9:16': { width: 720, height: 1280 },
  '1:1': { width: 720, height: 720 },
  '16:9': { width: 1280, height: 720 },
};

const SAMPLE_RATE = 48000;

// Recorta um AudioBuffer entre [from, to) segundos (relativos ao início do buffer)
function sliceBuffer(buffer, from, to) {
  const start = Math.max(0, Math.round(from * buffer.sampleRate));
  const end = Math.min(buffer.length, Math.round(to * buffer.sampleRate));
  const length = end - start;
  if (length <= 0) return null;
  const out = new AudioBuffer({ length, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    out.copyToChannel(buffer.getChannelData(ch).subarray(start, end), ch);
  }
  return out;
}

/**
 * @param {Array<{ file?: File, url?: string, in: number, out: number, filter?: string }>} clips  clipes na ordem final
 * @param {{ ratio?: string, onProgress?: (p:number)=>void, signal?: { cancelled: boolean } }} opts
 * @returns {Promise<Blob>} MP4
 */
export async function exportTimeline(clips, opts = {}) {
  const { ratio = '9:16', onProgress = () => {}, signal = { cancelled: false } } = opts;
  if (!clips.length) throw new Error('Nenhum clipe para exportar.');
  const { width, height } = OUTPUT_SIZES[ratio] || OUTPUT_SIZES['9:16'];
  const total = clips.reduce((acc, c) => acc + (c.out - c.in), 0);

  const format = new Mp4OutputFormat();
  const videoCodec = await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), { width, height });
  if (!videoCodec) throw new Error('Este navegador não consegue gerar vídeo. Use o Chrome ou o Edge atualizados.');

  const output = new Output({ format, target: new BufferTarget() });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const videoSource = new CanvasSource(canvas, { codec: videoCodec, bitrate: QUALITY_HIGH });
  output.addVideoTrack(videoSource, { frameRate: 30 });

  // Abre as fontes (um Input por arquivo diferente)
  const inputs = new Map();
  const openInput = (clip) => {
    const key = clip.file || clip.url;
    if (!inputs.has(key)) {
      const source = clip.file ? new BlobSource(clip.file) : new UrlSource(clip.url);
      inputs.set(key, new Input({ source, formats: ALL_FORMATS }));
    }
    return inputs.get(key);
  };

  // Áudio: decodifica o trecho de cada clipe e mistura numa única faixa (reamostra para 48 kHz)
  const audioParts = []; // { buffer, at }
  let anyAudio = false;
  let offset = 0;
  for (const clip of clips) {
    const input = openInput(clip);
    const audioTrack = await input.getPrimaryAudioTrack();
    if (audioTrack && (await audioTrack.canDecode())) {
      anyAudio = true;
      const sink = new AudioBufferSink(audioTrack);
      for await (const { buffer, timestamp } of sink.buffers(clip.in, clip.out)) {
        if (signal.cancelled) throw new Error('cancelado');
        const from = clip.in - timestamp;
        const to = clip.out - timestamp;
        const piece = sliceBuffer(buffer, from, to);
        if (piece) audioParts.push({ buffer: piece, at: offset + Math.max(0, timestamp - clip.in) });
      }
    }
    offset += clip.out - clip.in;
  }

  let audioSource = null;
  let mixed = null;
  if (anyAudio) {
    const audioCodec = await getFirstEncodableAudioCodec(format.getSupportedAudioCodecs(), {
      numberOfChannels: 2, sampleRate: SAMPLE_RATE,
    });
    if (audioCodec) {
      const offline = new OfflineAudioContext(2, Math.max(1, Math.ceil(total * SAMPLE_RATE)), SAMPLE_RATE);
      audioParts.forEach(({ buffer, at }) => {
        const node = offline.createBufferSource();
        node.buffer = buffer;
        node.connect(offline.destination);
        node.start(at);
      });
      mixed = await offline.startRendering();
      audioSource = new AudioBufferSource({ codec: audioCodec, bitrate: 128000 });
      output.addAudioTrack(audioSource);
    }
  }

  await output.start();

  // Vídeo: cada quadro de cada clipe é desenhado na tela de saída
  offset = 0;
  for (const clip of clips) {
    const input = openInput(clip);
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error('Um dos arquivos não tem vídeo.');
    if (!(await videoTrack.canDecode())) throw new Error('Este navegador não consegue ler esse formato de vídeo.');
    const sink = new CanvasSink(videoTrack, { width, height, fit: 'contain' });
    const len = clip.out - clip.in;
    for await (const frame of sink.canvases(clip.in, clip.out)) {
      if (signal.cancelled) throw new Error('cancelado');
      const local = Math.max(0, frame.timestamp - clip.in);
      ctx.filter = 'none';
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      ctx.filter = clip.filter || 'none';
      ctx.drawImage(frame.canvas, 0, 0, width, height);
      ctx.filter = 'none';
      const duration = Math.max(0.001, Math.min(frame.duration || 1 / 30, len - local));
      await videoSource.add(offset + local, duration);
      onProgress(Math.min(0.97, (offset + local) / total));
    }
    offset += len;
  }

  if (audioSource && mixed) await audioSource.add(mixed);

  await output.finalize();
  onProgress(1);
  inputs.forEach((input) => input.dispose?.());
  return new Blob([output.target.buffer], { type: 'video/mp4' });
}
