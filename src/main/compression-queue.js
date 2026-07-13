const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');

// Configurando caminhos padrão dos binários nativos instalados
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

class CompressionQueue {
  constructor(options = {}) {
    this.queue = [];
    this.active = false;
    this.currentItem = null;
    this.encoders = options.encoders || { h264: 'libx264', hevc: 'libx265', type: 'CPU' };
    
    // Hooks de eventos definidos por quem consome a fila
    this.onItemProgress = null; // (item, percent, etaSeconds, globalPercent, globalEtaSeconds)
    this.onItemSuccess = null; // (item, outputSize, outputPath)
    this.onItemError = null; // (item, errorMessage)
    this.onQueueFinished = null; // ()

    // Estatísticas Globais
    this.totalDuration = 0;
    this.processedDuration = 0;
    this.startTime = null;

    // Permite mockar a execução nos testes unitários
    this.compressFunction = this._realCompress.bind(this);
  }

  addToQueue(task) {
    // task = { filePath, quality, resolution, codec }
    const item = {
      id: Math.random().toString(36).substring(2, 9),
      filePath: task.filePath,
      fileName: path.basename(task.filePath),
      quality: task.quality,
      resolution: task.resolution,
      codec: task.codec || 'hevc',
      originalSize: fs.existsSync(task.filePath) ? fs.statSync(task.filePath).size : 0,
      duration: 0,
      status: 'pending'
    };
    this.queue.push(item);
    return item;
  }

  getQueueLength() {
    return this.queue.length;
  }

  async start() {
    if (this.active || this.queue.length === 0) return;
    this.active = true;
    this.processedDuration = 0;

    // Passo A: Obter a duração total de todos os vídeos na fila para cálculo do ETA Global
    await this._loadVideoDurations();

    this.startTime = Date.now();
    this._processNext();
  }

  async _loadVideoDurations() {
    this.totalDuration = 0;
    const promises = this.queue.map(async (item) => {
      if (fs.existsSync(item.filePath)) {
        const meta = await this._getVideoMetadata(item.filePath);
        item.duration = meta.duration;
        item.width = meta.width;
        item.height = meta.height;
        return meta.duration;
      }
      return 0;
    });
    const durations = await Promise.all(promises);
    this.totalDuration = durations.reduce((acc, curr) => acc + curr, 0);
  }

  _getVideoMetadata(filePath) {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err || !metadata) {
          resolve({ duration: 0, width: 0, height: 0 });
        } else {
          const duration = parseFloat(metadata.format ? metadata.format.duration : 0) || 0;
          let width = 0;
          let height = 0;
          if (metadata.streams) {
            const videoStream = metadata.streams.find(s => s.codec_type === 'video');
            if (videoStream) {
              width = parseInt(videoStream.width, 10) || 0;
              height = parseInt(videoStream.height, 10) || 0;
            }
          }
          resolve({ duration, width, height });
        }
      });
    });
  }

  _processNext() {
    if (this.queue.length === 0) {
      this.active = false;
      this.currentItem = null;
      if (this.onQueueFinished) this.onQueueFinished();
      return;
    }

    this.currentItem = this.queue.shift();
    this.currentItem.status = 'processing';
    this.currentItem.startTime = Date.now();

    const outputDir = path.dirname(this.currentItem.filePath);
    const ext = path.extname(this.currentItem.filePath);
    const nameWithoutExt = path.basename(this.currentItem.filePath, ext);
    const outputPath = path.join(outputDir, `${nameWithoutExt}_comprimido_${this.currentItem.id}${ext}`);

    try {
      this.compressFunction(
        this.currentItem,
        outputPath,
        (percent, eta) => {
          // Callback de progresso
          if (this.onItemProgress) {
            const currentProcessed = (percent / 100) * this.currentItem.duration;
            const globalProcessed = this.processedDuration + currentProcessed;
            const globalPercent = this.totalDuration > 0 ? (globalProcessed / this.totalDuration) * 100 : percent;

            const totalElapsedTime = (Date.now() - this.startTime) / 1000;
            const globalEta = globalPercent > 0 
              ? (totalElapsedTime / (globalPercent / 100)) - totalElapsedTime 
              : 0;

            this.onItemProgress(this.currentItem, percent, eta, globalPercent, globalEta);
          }
        },
        (finalPath) => {
          // Callback de Sucesso
          this.processedDuration += this.currentItem.duration;
          this.currentItem.status = 'completed';
          const outputSize = fs.existsSync(finalPath) ? fs.statSync(finalPath).size : 0;
          if (this.onItemSuccess) this.onItemSuccess(this.currentItem, outputSize, finalPath);
          this._processNext();
        },
        (errMessage) => {
          // Callback de Erro
          this.currentItem.status = 'error';
          this.processedDuration += this.currentItem.duration;
          if (this.onItemError) this.onItemError(this.currentItem, errMessage);
          this._processNext();
        }
      );
    } catch (err) {
      this.currentItem.status = 'error';
      this.processedDuration += this.currentItem.duration;
      if (this.onItemError) this.onItemError(this.currentItem, err.message || String(err));
      this._processNext();
    }
  }

  _realCompress(item, outputPath, onProgress, onSuccess, onError) {
    let command = ffmpeg(item.filePath);

    // 1. Configuração do Codec baseada na GPU ou CPU
    let encoder;
    if (item.codec === 'h264') {
      encoder = this.encoders.h264 || 'libx264';
    } else {
      encoder = this.encoders.hevc || 'libx265';
    }
    command.videoCodec(encoder);

    // 2. Parâmetros de qualidade baseados na seleção do usuário
    const isEncoderGPU = encoder !== 'libx264' && encoder !== 'libx265';

    if (item.quality === 'high') {
      if (isEncoderGPU) {
        command.outputOptions('-cq 19');
      } else {
        command.outputOptions('-crf 19', '-preset veryfast');
      }
    } else if (item.quality === 'low') {
      if (isEncoderGPU) {
        command.outputOptions('-cq 28');
      } else {
        command.outputOptions('-crf 28', '-preset veryfast');
      }
    } else { // balanced
      if (isEncoderGPU) {
        command.outputOptions('-cq 23');
      } else {
        command.outputOptions('-crf 23', '-preset veryfast');
      }
    }

    // 3. Redimensionamento de Resolução (Evitar Upscale Artificial)
    if (item.resolution === '1080p' && item.height > 1080) {
      command.videoFilters('scale=1920:-2');
    } else if (item.resolution === '720p' && item.height > 720) {
      command.videoFilters('scale=1280:-2');
    }

    // Evita travar os metadados de áudio, mantendo cópia sem re-encoding para velocidade
    command.audioCodec('copy');

    // Monitoramento de Progresso
    command.on('progress', (progress) => {
      // ETA do arquivo individual calculada no fluent-ffmpeg
      // Ou gerando via progresso percentual e tempo decorrido do arquivo
      const elapsed = (Date.now() - item.startTime) / 1000;
      const percent = progress.percent || 0;
      const eta = percent > 0 ? (elapsed / (percent / 100)) - elapsed : 0;
      onProgress(percent, eta);
    });

    command.on('end', () => {
      onSuccess(outputPath);
    });

    command.on('error', (err) => {
      fs.promises.unlink(outputPath).catch(() => {});
      onError(err.message);
    });

    command.save(outputPath);
  }
}

module.exports = { CompressionQueue };
