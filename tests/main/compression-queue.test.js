jest.mock('@ffmpeg-installer/ffmpeg', () => ({ path: '/mock/ffmpeg/path' }));
jest.mock('@ffprobe-installer/ffprobe', () => ({ path: '/mock/ffprobe/path' }));
jest.mock('fs');
jest.mock('fluent-ffmpeg');

const { CompressionQueue } = require('../../src/main/compression-queue');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');

describe('CompressionQueue', () => {
  let queue;

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    fs.statSync.mockReturnValue({ size: 1000 });
    fs.promises = {
      unlink: jest.fn().mockResolvedValue()
    };
    queue = new CompressionQueue({
      encoders: { h264: 'libx264', hevc: 'libx265', type: 'CPU' }
    });
  });

  test('deve inicializar vazia e permitir adicionar tarefas', () => {
    queue.addToQueue({ filePath: 'video1.mp4', quality: 'balanced', resolution: 'original' });
    expect(queue.getQueueLength()).toBe(1);
    
    const items = queue.queue;
    expect(items[0]).toMatchObject({
      filePath: 'video1.mp4',
      quality: 'balanced',
      resolution: 'original',
      status: 'pending'
    });
    expect(items[0].id).toBeDefined();
    expect(items[0].fileName).toBe('video1.mp4');
  });

  test('deve processar itens de forma serial emitindo os eventos corretos', (done) => {
    const mockCompress = jest.fn((item, outputPath, onProgress, onSuccess, onError) => {
      setTimeout(() => {
        onProgress(50, 5);
        setTimeout(() => {
          onSuccess(outputPath);
        }, 10);
      }, 10);
    });

    queue.compressFunction = mockCompress;
    queue.addToQueue({ filePath: 'video1.mp4', quality: 'balanced', resolution: 'original' });

    queue.onItemSuccess = (item, outputSize, outputPath) => {
      expect(outputPath).toContain('video1_comprimido_');
      expect(queue.getQueueLength()).toBe(0);
      done();
    };

    queue.start();
  });

  test('deve calcular progresso e ETA global corretamente', async () => {
    fs.existsSync.mockImplementation((filePath) => {
      // Retorna true para arquivos de entrada, false para arquivos comprimidos se necessário
      return !filePath.includes('comprimido');
    });

    ffmpeg.ffprobe.mockImplementation((filePath, cb) => {
      cb(null, { format: { duration: 100 } });
    });

    const progressEvents = [];
    queue.onItemProgress = (item, percent, eta, globalPercent, globalEta) => {
      progressEvents.push({ percent, eta, globalPercent, globalEta });
    };

    // Mock Date.now
    const baseTime = Date.now();
    let dateSpy = jest.spyOn(Date, 'now').mockReturnValue(baseTime);

    queue.compressFunction = (item, outputPath, onProgress, onSuccess) => {
      // Simula tempo decorrido de 2 segundos antes de enviar o progresso
      dateSpy.mockReturnValue(baseTime + 2000);
      onProgress(50, 2);
      onSuccess(outputPath);
    };

    queue.addToQueue({ filePath: 'video1.mp4', quality: 'balanced', resolution: 'original' });
    queue.addToQueue({ filePath: 'video2.mp4', quality: 'balanced', resolution: 'original' });

    await queue.start();

    expect(progressEvents[0]).toEqual({
      percent: 50,
      eta: 2,
      globalPercent: 25,
      globalEta: 6
    });

    dateSpy.mockRestore();
  });

  test('deve lidar com erro no processamento do item', (done) => {
    queue.compressFunction = (item, outputPath, onProgress, onSuccess, onError) => {
      setTimeout(() => {
        onError('Erro de compressão simulado');
      }, 10);
    };

    queue.addToQueue({ filePath: 'video1.mp4', quality: 'balanced', resolution: 'original' });

    queue.onItemError = (item, errMessage) => {
      expect(item.status).toBe('error');
      expect(errMessage).toBe('Erro de compressão simulado');
      expect(queue.getQueueLength()).toBe(0);
      done();
    };

    queue.start();
  });

  test('deve disparar onQueueFinished quando todos os itens forem processados', (done) => {
    queue.compressFunction = (item, outputPath, onProgress, onSuccess, onError) => {
      setTimeout(() => {
        onSuccess(outputPath);
      }, 10);
    };

    queue.addToQueue({ filePath: 'video1.mp4', quality: 'balanced', resolution: 'original' });
    queue.addToQueue({ filePath: 'video2.mp4', quality: 'balanced', resolution: 'original' });

    queue.onQueueFinished = () => {
      expect(queue.active).toBe(false);
      expect(queue.currentItem).toBeNull();
      done();
    };

    queue.start();
  });

  test('deve configurar fluent-ffmpeg corretamente para compressão em CPU com qualidade alta e resolução 1080p', () => {
    const mockFfmpegCmd = {
      videoCodec: jest.fn().mockReturnThis(),
      outputOptions: jest.fn().mockReturnThis(),
      videoFilters: jest.fn().mockReturnThis(),
      audioCodec: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      save: jest.fn().mockReturnThis()
    };
    ffmpeg.mockReturnValue(mockFfmpegCmd);

    const item = {
      filePath: 'input.mp4',
      quality: 'high',
      resolution: '1080p',
      height: 1081,
      startTime: Date.now()
    };

    queue.encoders = { h264: 'libx264', hevc: 'libx265', type: 'CPU' };
    queue._realCompress(item, 'output.mp4', () => {}, () => {}, () => {});

    expect(ffmpeg).toHaveBeenCalledWith('input.mp4');
    expect(mockFfmpegCmd.videoCodec).toHaveBeenCalledWith('libx265');
    expect(mockFfmpegCmd.outputOptions).toHaveBeenCalledWith(['-crf', '19', '-preset', 'veryfast']);
    expect(mockFfmpegCmd.videoFilters).toHaveBeenCalledWith('scale=1920:-2');
    expect(mockFfmpegCmd.audioCodec).toHaveBeenCalledWith('copy');
    expect(mockFfmpegCmd.save).toHaveBeenCalledWith('output.mp4');
  });

  test('deve configurar fluent-ffmpeg corretamente para compressão em GPU com qualidade balanceada e resolução 720p', () => {
    const mockFfmpegCmd = {
      videoCodec: jest.fn().mockReturnThis(),
      outputOptions: jest.fn().mockReturnThis(),
      videoFilters: jest.fn().mockReturnThis(),
      audioCodec: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      save: jest.fn().mockReturnThis()
    };
    ffmpeg.mockReturnValue(mockFfmpegCmd);

    const item = {
      filePath: 'input.mp4',
      quality: 'balanced',
      resolution: '720p',
      height: 721,
      startTime: Date.now()
    };

    queue.encoders = { h264: 'h264_nvenc', hevc: 'hevc_nvenc', type: 'GPU' };
    queue._realCompress(item, 'output.mp4', () => {}, () => {}, () => {});

    expect(ffmpeg).toHaveBeenCalledWith('input.mp4');
    expect(mockFfmpegCmd.videoCodec).toHaveBeenCalledWith('hevc_nvenc');
    expect(mockFfmpegCmd.outputOptions).toHaveBeenCalledWith(['-cq', '23']);
    expect(mockFfmpegCmd.videoFilters).toHaveBeenCalledWith('scale=1280:-2');
    expect(mockFfmpegCmd.audioCodec).toHaveBeenCalledWith('copy');
    expect(mockFfmpegCmd.save).toHaveBeenCalledWith('output.mp4');
  });

  test('não deve aplicar filtro de escala (upscale artificial) se a altura do vídeo for menor ou igual à resolução de saída configurada', () => {
    const mockFfmpegCmd = {
      videoCodec: jest.fn().mockReturnThis(),
      outputOptions: jest.fn().mockReturnThis(),
      videoFilters: jest.fn().mockReturnThis(),
      audioCodec: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      save: jest.fn().mockReturnThis()
    };
    ffmpeg.mockReturnValue(mockFfmpegCmd);

    const item = {
      filePath: 'input.mp4',
      quality: 'high',
      resolution: '1080p',
      height: 720,
      startTime: Date.now()
    };

    queue.encoders = { h264: 'libx264', hevc: 'libx265', type: 'CPU' };
    queue._realCompress(item, 'output.mp4', () => {}, () => {}, () => {});

    expect(mockFfmpegCmd.videoFilters).not.toHaveBeenCalled();
  });

  test('deve configurar fluent-ffmpeg corretamente para codec H.264 em CPU', () => {
    const mockFfmpegCmd = {
      videoCodec: jest.fn().mockReturnThis(),
      outputOptions: jest.fn().mockReturnThis(),
      videoFilters: jest.fn().mockReturnThis(),
      audioCodec: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      save: jest.fn().mockReturnThis()
    };
    ffmpeg.mockReturnValue(mockFfmpegCmd);

    const item = {
      filePath: 'input.mp4',
      quality: 'high',
      resolution: 'original',
      codec: 'h264',
      startTime: Date.now()
    };

    queue.encoders = { h264: 'libx264', hevc: 'libx265', type: 'CPU' };
    queue._realCompress(item, 'output.mp4', () => {}, () => {}, () => {});

    expect(mockFfmpegCmd.videoCodec).toHaveBeenCalledWith('libx264');
    expect(mockFfmpegCmd.outputOptions).toHaveBeenCalledWith(['-crf', '19', '-preset', 'veryfast']);
  });

  test('deve configurar fluent-ffmpeg corretamente para codec H.264 em GPU', () => {
    const mockFfmpegCmd = {
      videoCodec: jest.fn().mockReturnThis(),
      outputOptions: jest.fn().mockReturnThis(),
      videoFilters: jest.fn().mockReturnThis(),
      audioCodec: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      save: jest.fn().mockReturnThis()
    };
    ffmpeg.mockReturnValue(mockFfmpegCmd);

    const item = {
      filePath: 'input.mp4',
      quality: 'balanced',
      resolution: 'original',
      codec: 'h264',
      startTime: Date.now()
    };

    queue.encoders = { h264: 'h264_nvenc', hevc: 'hevc_nvenc', type: 'GPU' };
    queue._realCompress(item, 'output.mp4', () => {}, () => {}, () => {});

    expect(mockFfmpegCmd.videoCodec).toHaveBeenCalledWith('h264_nvenc');
    expect(mockFfmpegCmd.outputOptions).toHaveBeenCalledWith(['-cq', '23']);
  });

  test('deve disparar os callbacks corretos ao receber eventos do fluent-ffmpeg', () => {
    const eventHandlers = {};
    const mockFfmpegCmd = {
      videoCodec: jest.fn().mockReturnThis(),
      outputOptions: jest.fn().mockReturnThis(),
      videoFilters: jest.fn().mockReturnThis(),
      audioCodec: jest.fn().mockReturnThis(),
      on: jest.fn().mockImplementation((event, handler) => {
        eventHandlers[event] = handler;
        return mockFfmpegCmd;
      }),
      save: jest.fn().mockReturnThis()
    };
    ffmpeg.mockReturnValue(mockFfmpegCmd);

    const item = {
      filePath: 'input.mp4',
      quality: 'low',
      resolution: 'original',
      startTime: Date.now()
    };

    const onProgress = jest.fn();
    const onSuccess = jest.fn();
    const onError = jest.fn();

    queue._realCompress(item, 'output.mp4', onProgress, onSuccess, onError);

    // Test progress event
    eventHandlers['progress']({ percent: 35 });
    expect(onProgress).toHaveBeenCalledWith(35, expect.any(Number));

    // Test end event
    eventHandlers['end']();
    expect(onSuccess).toHaveBeenCalledWith('output.mp4');

    // Test error event
    eventHandlers['error'](new Error('Erro no FFmpeg'));
    expect(onError).toHaveBeenCalledWith('Erro no FFmpeg');
  });

  test('deve excluir arquivo de saída parcial em caso de erro', () => {
    const eventHandlers = {};
    const mockFfmpegCmd = {
      videoCodec: jest.fn().mockReturnThis(),
      outputOptions: jest.fn().mockReturnThis(),
      videoFilters: jest.fn().mockReturnThis(),
      audioCodec: jest.fn().mockReturnThis(),
      on: jest.fn().mockImplementation((event, handler) => {
        eventHandlers[event] = handler;
        return mockFfmpegCmd;
      }),
      save: jest.fn().mockReturnThis()
    };
    ffmpeg.mockReturnValue(mockFfmpegCmd);

    const item = {
      filePath: 'input.mp4',
      quality: 'low',
      resolution: 'original',
      startTime: Date.now()
    };

    const onProgress = jest.fn();
    const onSuccess = jest.fn();
    const onError = jest.fn();

    queue._realCompress(item, 'output.mp4', onProgress, onSuccess, onError);

    // Dispara o erro
    eventHandlers['error'](new Error('Erro no FFmpeg'));

    expect(fs.promises.unlink).toHaveBeenCalledWith('output.mp4');
    expect(onError).toHaveBeenCalledWith('Erro no FFmpeg');
  });

  test('deve acumular duration de itens com falha em processedDuration para manter consistência', async () => {
    fs.existsSync.mockImplementation((filePath) => !filePath.includes('comprimido'));
    ffmpeg.ffprobe.mockImplementation((filePath, cb) => cb(null, { format: { duration: 120 } }));

    queue.compressFunction = (item, outputPath, onProgress, onSuccess, onError) => {
      onError('Erro de compressão simulado');
    };

    queue.addToQueue({ filePath: 'video1.mp4', quality: 'balanced', resolution: 'original' });
    
    await queue.start();
    
    expect(queue.processedDuration).toBe(120);
  });

  test('deve setar startTime somente após carregar as durações dos vídeos', async () => {
    fs.existsSync.mockImplementation((filePath) => !filePath.includes('comprimido'));
    ffmpeg.ffprobe.mockImplementation((filePath, cb) => {
      expect(queue.startTime).toBeNull();
      cb(null, { format: { duration: 10 } });
    });

    queue.compressFunction = (item, outputPath, onProgress, onSuccess) => {
      onSuccess(outputPath);
    };

    queue.addToQueue({ filePath: 'video1.mp4', quality: 'balanced', resolution: 'original' });
    
    expect(queue.startTime).toBeNull();
    await queue.start();
    expect(queue.startTime).not.toBeNull();
  });

  test('deve capturar exceções síncronas na compressão e tratar como falha de item', (done) => {
    fs.existsSync.mockImplementation((filePath) => !filePath.includes('comprimido'));
    ffmpeg.ffprobe.mockImplementation((filePath, cb) => cb(null, { format: { duration: 50 } }));

    queue.compressFunction = () => {
      throw new Error('Erro síncrono na compressão');
    };

    queue.addToQueue({ filePath: 'video1.mp4', quality: 'balanced', resolution: 'original' });

    queue.onItemError = (item, errMessage) => {
      expect(item.status).toBe('error');
      expect(errMessage).toBe('Erro síncrono na compressão');
      expect(queue.processedDuration).toBe(50);
    };

    queue.onQueueFinished = () => {
      expect(queue.active).toBe(false);
      done();
    };

    queue.start();
  });

  test('deve carregar durações de vídeos em paralelo usando Promise.all', async () => {
    let activeCalls = 0;
    let maxConcurrentCalls = 0;

    ffmpeg.ffprobe.mockImplementation((filePath, cb) => {
      activeCalls++;
      maxConcurrentCalls = Math.max(maxConcurrentCalls, activeCalls);
      setTimeout(() => {
        activeCalls--;
        cb(null, { format: { duration: 10 } });
      }, 10);
    });

    fs.existsSync.mockReturnValue(true);

    queue.addToQueue({ filePath: 'video1.mp4', quality: 'balanced', resolution: 'original' });
    queue.addToQueue({ filePath: 'video2.mp4', quality: 'balanced', resolution: 'original' });
    queue.addToQueue({ filePath: 'video3.mp4', quality: 'balanced', resolution: 'original' });

    await queue._loadVideoDurations();

    expect(maxConcurrentCalls).toBe(3);
  });
});
