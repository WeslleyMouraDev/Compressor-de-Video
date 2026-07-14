# Plano de Implementação: Compressor de Vídeo Premium Desktop

> **Para agentes de execução:** HABILIDADE REQUISITADA: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. As etapas usam a sintaxe de caixa de seleção (`- [ ]`) para acompanhamento.

**Objetivo:** Criar um aplicativo desktop em Electron que realiza compressão em lote de vídeos localmente de forma ultra-rápida (utilizando aceleração por GPU se disponível) com feedback visual premium (barra de progresso, ETA e comparativo de tamanhos).

**Arquitetura:** Aplicação Electron com divisão rígida entre Main Process (Node.js/FFmpeg para processamento e fila serial FIFO) e Renderer Process (HTML/CSS/JS para interface gráfica premium), comunicando-se via Preload Script seguro usando IPC.

**Tech Stack:** Electron, fluent-ffmpeg, @ffmpeg-installer/ffmpeg, @ffprobe-installer/ffprobe, Jest (para testes unitários).

## Restrições Globais
*   Todos os códigos criados devem seguir boas práticas de concisão e legibilidade.
*   Os caminhos de arquivos devem ser exatamente os definidos neste plano.
*   Todo processamento pesado deve rodar fora da thread principal de renderização.
*   O design da interface gráfica deve usar CSS moderno com estética dark premium e glassmorphism.

---

### Tarefa 1: Scaffolding e Configuração do Projeto

**Arquivos:**
*   Criar: `package.json`
*   Criar: `.gitignore`
*   Criar: `jest.config.js`

**Interfaces:**
*   Consumes: Nenhuma (Tarefa Inicial)
*   Produces: Estrutura inicial do projeto com dependências instaladas e script de testes funcionando.

- [ ] **Passo 1: Escrever o arquivo `package.json`**
    Criar o arquivo `package.json` com as dependências do Electron, FFmpeg, FFprobe e Jest necessárias para o desenvolvimento.
    ```json
    {
      "name": "compressor-de-video",
      "version": "1.0.0",
      "description": "Compressor de vídeo desktop premium utilizando Electron e FFmpeg",
      "main": "main.js",
      "scripts": {
        "start": "electron .",
        "test": "jest"
      },
      "dependencies": {
        "@ffmpeg-installer/ffmpeg": "^1.1.0",
        "@ffprobe-installer/ffprobe": "^2.1.0",
        "fluent-ffmpeg": "^2.1.2"
      },
      "devDependencies": {
        "electron": "^31.0.0",
        "jest": "^29.7.0"
      }
    }
    ```

- [ ] **Passo 2: Escrever o arquivo `.gitignore`**
    Evitar commitar a pasta `node_modules`, arquivos de log ou compilação e binários gerados.
    ```text
    node_modules/
    dist/
    .DS_Store
    *.log
    ```

- [ ] **Passo 3: Escrever o arquivo `jest.config.js`**
    Configurar o Jest para rodar testes no ambiente Node.js.
    ```javascript
    module.exports = {
      testEnvironment: 'node',
      verbose: true
    };
    ```

- [ ] **Passo 4: Instalar as dependências**
    Instalar localmente usando npm.
    Run: `npm install`
    Expected: Instalação sem erros críticos.

- [ ] **Passo 5: Commit**
    ```bash
    git add package.json .gitignore jest.config.js
    git commit -m "chore: project scaffolding and dependencies configuration"
    ```

---

### Tarefa 2: Lógica de Detecção de GPU e Encoders

**Arquivos:**
*   Criar: `src/main/gpu-detector.js`
*   Criar: `tests/main/gpu-detector.test.js`

**Interfaces:**
*   Consumes: Executável FFmpeg do pacote `@ffmpeg-installer/ffmpeg`
*   Produces: Função `detectGPUEncoders()` que retorna um objeto `{ h264: string, hevc: string, type: 'GPU' | 'CPU' }` indicando os codecs otimizados para a máquina.

- [ ] **Passo 1: Escrever o teste unitário falho para a detecção de GPU**
    Criar o arquivo `tests/main/gpu-detector.test.js` mockando a saída do comando `ffmpeg -encoders` para simular cenários de GPU NVIDIA e fallback para CPU.
    ```javascript
    const { detectGPUEncoders } = require('../../src/main/gpu-detector');
    const { exec } = require('child_process');

    jest.mock('child_process', () => ({
      exec: jest.fn()
    }));

    describe('GPU Detector', () => {
      afterEach(() => {
        jest.clearAllMocks();
      });

      test('deve detectar encoders NVIDIA se disponíveis', async () => {
        exec.mockImplementation((cmd, callback) => {
          callback(null, ' V..... hevc_nvenc           NVIDIA NVENC hevc encoder (codec hevc)\n V..... h264_nvenc           NVIDIA NVENC h264 encoder (codec h264)', '');
        });

        const encoders = await detectGPUEncoders();
        expect(encoders.type).toBe('GPU');
        expect(encoders.hevc).toBe('hevc_nvenc');
        expect(encoders.h264).toBe('h264_nvenc');
      });

      test('deve fazer fallback para CPU se nenhum encoder por hardware for listado', async () => {
        exec.mockImplementation((cmd, callback) => {
          callback(null, ' V..... libx265              libx265 H.265 (codec hevc)\n V..... libx264              libx264 H.264 (codec h264)', '');
        });

        const encoders = await detectGPUEncoders();
        expect(encoders.type).toBe('CPU');
        expect(encoders.hevc).toBe('libx265');
        expect(encoders.h264).toBe('libx264');
      });
    });
    ```

- [ ] **Passo 2: Executar o teste e certificar que falha**
    Run: `npm test tests/main/gpu-detector.test.js`
    Expected: FAIL (Cannot find module '../../src/main/gpu-detector')

- [ ] **Passo 3: Escrever a implementação mínima de `src/main/gpu-detector.js`**
    Criar o arquivo `src/main/gpu-detector.js` com a detecção de encoders chamando o binário do FFmpeg.
    ```javascript
    const { exec } = require('child_process');
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

    function detectGPUEncoders() {
      return new Promise((resolve) => {
        const ffmpegPath = ffmpegInstaller.path;
        exec(`"${ffmpegPath}" -encoders`, (error, stdout) => {
          if (error || !stdout) {
            return resolve({ h264: 'libx264', hevc: 'libx265', type: 'CPU' });
          }

          let type = 'CPU';
          let h264 = 'libx264';
          let hevc = 'libx265';

          // Prioridade 1: NVIDIA
          if (stdout.includes('hevc_nvenc') && stdout.includes('h264_nvenc')) {
            h264 = 'h264_nvenc';
            hevc = 'hevc_nvenc';
            type = 'GPU';
          }
          // Prioridade 2: AMD
          else if (stdout.includes('hevc_amf') && stdout.includes('h264_amf')) {
            h264 = 'h264_amf';
            hevc = 'hevc_amf';
            type = 'GPU';
          }
          // Prioridade 3: Intel QSV
          else if (stdout.includes('hevc_qsv') && stdout.includes('h264_qsv')) {
            h264 = 'h264_qsv';
            hevc = 'hevc_qsv';
            type = 'GPU';
          }
          // Prioridade 4: Apple Silicon / macOS Videotoolbox
          else if (stdout.includes('hevc_videotoolbox') && stdout.includes('h264_videotoolbox')) {
            h264 = 'h264_videotoolbox';
            hevc = 'hevc_videotoolbox';
            type = 'GPU';
          }

          resolve({ h264, hevc, type });
        });
      });
    }

    module.exports = { detectGPUEncoders };
    ```

- [ ] **Passo 4: Executar o teste e verificar se passa**
    Run: `npm test tests/main/gpu-detector.test.js`
    Expected: PASS

- [ ] **Passo 5: Commit**
    ```bash
    git add src/main/gpu-detector.js tests/main/gpu-detector.test.js
    git commit -m "feat: implement GPU and accelerated video encoders detection"
    ```

---

### Terceira Tarefa: Lógica do Gerenciador de Fila de Compressão (Serial FIFO)

**Arquivos:**
*   Criar: `src/main/compression-queue.js`
*   Criar: `tests/main/compression-queue.test.js`

**Interfaces:**
*   Consumes: `detectGPUEncoders` da Tarefa 2, metadados do `ffprobe` e wrapper `fluent-ffmpeg`.
*   Produces: Classe `CompressionQueue` que aceita itens, gerencia a fila serial de processamento, e dispara callbacks de progresso ( individual e global ) e completude.

- [ ] **Passo 1: Escrever os testes unitários falhos para a fila de compressão**
    Criar `tests/main/compression-queue.test.js` testando a adição de itens à fila, o processamento de itens de forma FIFO e a sinalização de callbacks.
    ```javascript
    const { CompressionQueue } = require('../../src/main/compression-queue');

    describe('CompressionQueue', () => {
      let queue;

      beforeEach(() => {
        queue = new CompressionQueue({
          encoders: { h264: 'libx264', hevc: 'libx265', type: 'CPU' },
          ffmpegPath: 'mock/ffmpeg',
          ffprobePath: 'mock/ffprobe'
        });
      });

      test('deve inicializar vazia e permitir adicionar tarefas', () => {
        queue.addToQueue({ filePath: 'video1.mp4', quality: 'balanced', resolution: 'original' });
        expect(queue.getQueueLength()).toBe(1);
      });

      test('deve processar itens de forma serial emitindo os eventos corretos', (done) => {
        const mockCompress = jest.fn((item, encoders, onProgress, onSuccess) => {
          setTimeout(() => {
            onProgress(50);
            setTimeout(() => {
              onSuccess('video1_compressed.mp4');
            }, 10);
          }, 10);
        });

        queue.compressFunction = mockCompress;
        queue.addToQueue({ filePath: 'video1.mp4', quality: 'balanced', resolution: 'original' });

        queue.onItemSuccess = (item, outputPath) => {
          expect(outputPath).toBe('video1_compressed.mp4');
          expect(queue.getQueueLength()).toBe(0);
          done();
        };

        queue.start();
      });
    });
    ```

- [ ] **Passo 2: Executar o teste e certificar que falha**
    Run: `npm test tests/main/compression-queue.test.js`
    Expected: FAIL (Cannot find module '../../src/main/compression-queue')

- [ ] **Passo 3: Criar a implementação de `src/main/compression-queue.js`**
    Implementar a fila sequencial FIFO, usando o utilitário do FFmpeg e tratando as configurações escolhidas de qualidade e resolução.
    ```javascript
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
        // task = { filePath, quality, resolution }
        const item = {
          id: Math.random().toString(36).substring(2, 9),
          filePath: task.filePath,
          fileName: path.basename(task.filePath),
          quality: task.quality,
          resolution: task.resolution,
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
        this.startTime = Date.now();
        this.processedDuration = 0;

        // Passo A: Obter a duração total de todos os vídeos na fila para cálculo do ETA Global
        await this._loadVideoDurations();

        this._processNext();
      }

      async _loadVideoDurations() {
        this.totalDuration = 0;
        for (const item of this.queue) {
          if (fs.existsSync(item.filePath)) {
            item.duration = await this._getVideoDuration(item.filePath);
            this.totalDuration += item.duration;
          }
        }
      }

      _getVideoDuration(filePath) {
        return new Promise((resolve) => {
          ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err || !metadata || !metadata.format) {
              resolve(0);
            } else {
              resolve(parseFloat(metadata.format.duration) || 0);
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
            if (this.onItemError) this.onItemError(this.currentItem, errMessage);
            this._processNext();
          }
        );
      }

      _realCompress(item, outputPath, onProgress, onSuccess, onError) {
        let command = ffmpeg(item.filePath);

        // 1. Configuração do Codec baseada na GPU ou CPU
        // H.265 (HEVC) é preferido pela taxa de compressão
        const isGPU = this.encoders.type === 'GPU';
        const encoder = this.encoders.hevc;
        command.videoCodec(encoder);

        // 2. Parâmetros de qualidade baseados na seleção do usuário
        if (item.quality === 'high') {
          if (isGPU) {
            command.outputOptions('-cq 19');
          } else {
            command.outputOptions('-crf 19', '-preset veryfast');
          }
        } else if (item.quality === 'low') {
          if (isGPU) {
            command.outputOptions('-cq 28');
          } else {
            command.outputOptions('-crf 28', '-preset veryfast');
          }
        } else { // balanced
          if (isGPU) {
            command.outputOptions('-cq 23');
          } else {
            command.outputOptions('-crf 23', '-preset veryfast');
          }
        }

        // 3. Redimensionamento de Resolução
        if (item.resolution === '1080p') {
          command.videoFilters('scale=1920:-2');
        } else if (item.resolution === '720p') {
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
          onError(err.message);
        });

        command.save(outputPath);
      }
    }

    module.exports = { CompressionQueue };
    ```

- [ ] **Passo 4: Rodar o teste e verificar se passa**
    Run: `npm test tests/main/compression-queue.test.js`
    Expected: PASS

- [ ] **Passo 5: Commit**
    ```bash
    git add src/main/compression-queue.js tests/main/compression-queue.test.js
    git commit -m "feat: implement serial compression queue with metadata extraction"
    ```

---

### Tarefa 4: Processo Main do Electron e Comunicação IPC

**Arquivos:**
*   Criar: `main.js`

**Interfaces:**
*   Consumes: `src/main/gpu-detector.js`, `src/main/compression-queue.js`.
*   Produces: Inicializador da interface gráfica e manipuladores de IPC `select-files`, `select-directory` e `start-compression`.

- [ ] **Passo 1: Escrever o arquivo `main.js`**
    Criar o arquivo `main.js` com suporte a janelas do Electron, detecção de GPU imediata na inicialização, diálogo nativo de seleção de arquivos/pastas, e pontes IPC conectando o frontend à fila de compressão.
    ```javascript
    const { app, BrowserWindow, ipcMain, dialog } = require('electron');
    const path = require('path');
    const fs = require('fs');
    const { detectGPUEncoders } = require('./src/main/gpu-detector');
    const { CompressionQueue } = require('./src/main/compression-queue');

    let mainWindow;
    let compressionQueue;
    let detectedEncoders = null;

    async function createWindow() {
      mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        titleBarStyle: 'hidden',
        titleBarOverlay: {
          color: '#0a0b10',
          symbolColor: '#f3f4f6',
          height: 35
        },
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false
        }
      });

      mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

      // Detecção de GPU logo na inicialização
      detectedEncoders = await detectGPUEncoders();
      mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('gpu-status', detectedEncoders);
      });
    }

    app.whenReady().then(createWindow);

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });

    // --- MANIPULADORES DE IPC ---

    // 1. Seleção de Arquivos Individuais/Múltiplos
    ipcMain.handle('select-files', async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Vídeos', extensions: ['mp4', 'mkv', 'avi', 'mov', 'flv', 'webm'] }]
      });
      if (result.canceled) return [];
      
      return result.filePaths.map(filePath => ({
        filePath,
        fileName: path.basename(filePath),
        size: fs.statSync(filePath).size
      }));
    });

    // 2. Seleção de Diretório Completo (filtra por vídeos contidos nele)
    ipcMain.handle('select-directory', async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
      });
      if (result.canceled || result.filePaths.length === 0) return [];

      const dirPath = result.filePaths[0];
      const files = fs.readdirSync(dirPath);
      const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.flv', '.webm'];
      const videoFiles = [];

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        if (stat.isFile() && videoExtensions.includes(path.extname(file).toLowerCase())) {
          videoFiles.push({
            filePath,
            fileName: file,
            size: stat.size
          });
        }
      }
      return videoFiles;
    });

    // 3. Início do Processo de Compressão
    ipcMain.handle('start-compression', async (event, { tasks, quality, resolution }) => {
      if (compressionQueue && compressionQueue.active) {
        return { success: false, error: 'Uma compressão já está em andamento.' };
      }

      compressionQueue = new CompressionQueue({ encoders: detectedEncoders });

      // Configuração dos hooks de progresso e repasse via IPC ao Renderer
      compressionQueue.onItemProgress = (item, percent, etaSeconds, globalPercent, globalEtaSeconds) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('compression-progress', {
            itemId: item.id,
            percent,
            etaSeconds,
            globalPercent,
            globalEtaSeconds
          });
        }
      };

      compressionQueue.onItemSuccess = (item, outputSize, outputPath) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('compression-success', {
            itemId: item.id,
            outputSize,
            outputPath
          });
        }
      };

      compressionQueue.onItemError = (item, errorMessage) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('compression-error', {
            itemId: item.id,
            error: errorMessage
          });
        }
      };

      compressionQueue.onQueueFinished = () => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('compression-finished');
        }
      };

      // Adicionando todas as tarefas enviadas pelo frontend
      const queuedItems = [];
      for (const task of tasks) {
        const item = compressionQueue.addToQueue({
          filePath: task.filePath,
          quality,
          resolution
        });
        queuedItems.push(item);
      }

      compressionQueue.start();
      return { success: true, items: queuedItems };
    });
    ```

- [ ] **Passo 2: Commit**
    ```bash
    git add main.js
    git commit -m "feat: implement Electron main process and IPC message handlers"
    ```

---

### Tarefa 5: Preload Script de Segurança

**Arquivos:**
*   Criar: `preload.js`

**Interfaces:**
*   Consumes: `contextBridge` e `ipcRenderer` do Electron.
*   Produces: Objeto `window.api` seguro disponível no Renderer.

- [ ] **Passo 1: Escrever o arquivo `preload.js`**
    Criar o script de preload que expõe apenas os canais e ações do IPC autorizadas.
    ```javascript
    const { contextBridge, ipcRenderer } = require('electron');

    contextBridge.exposeInMainWorld('api', {
      selectFiles: () => ipcRenderer.invoke('select-files'),
      selectDirectory: () => ipcRenderer.invoke('select-directory'),
      startCompression: (data) => ipcRenderer.invoke('start-compression', data),
      
      // Escutadores de Eventos do Main Process
      onGPUStatus: (callback) => ipcRenderer.on('gpu-status', (event, data) => callback(data)),
      onProgress: (callback) => ipcRenderer.on('compression-progress', (event, data) => callback(data)),
      onSuccess: (callback) => ipcRenderer.on('compression-success', (event, data) => callback(data)),
      onError: (callback) => ipcRenderer.on('compression-error', (event, data) => callback(data)),
      onFinished: (callback) => ipcRenderer.on('compression-finished', (event) => callback())
    });
    ```

- [ ] **Passo 2: Commit**
    ```bash
    git add preload.js
    git commit -m "feat: configure preload script for safe IPC context bridging"
    ```

---

### Tarefa 6: Frontend da Interface Gráfica Premium

**Arquivos:**
*   Criar: `src/renderer/index.html`
*   Criar: `src/renderer/style.css`
*   Criar: `src/renderer/renderer.js`

**Interfaces:**
*   Consumes: `window.api` (Preload)
*   Produces: Visual de drag and drop, controles de qualidade, progresso em tempo real e exibição comparativa antes/depois.

- [ ] **Passo 1: Criar o layout HTML (`src/renderer/index.html`)**
    Estruturar a UI com seções semânticas e referências ao CSS e Google Fonts (Outfit).
    ```html
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Compressor de Vídeo Premium</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
      <link rel="stylesheet" href="style.css">
    </head>
    <body>
      <header class="app-header">
        <div class="logo">🚀 VideoSqueeze</div>
        <div id="gpu-badge" class="badge">Detectando Hardware...</div>
      </header>

      <main class="app-container">
        <!-- ZONA DE IMPORTAÇÃO -->
        <section id="drop-zone" class="drop-zone">
          <div class="drop-content">
            <span class="icon">📥</span>
            <h2>Arraste seus vídeos aqui</h2>
            <p>ou use as opções de seleção abaixo</p>
            <div class="btn-group">
              <button id="btn-select-files" class="btn primary">Selecionar Arquivos</button>
              <button id="btn-select-dir" class="btn secondary">Selecionar Pasta</button>
            </div>
          </div>
        </section>

        <!-- PAINEL DE CONFIGURAÇÕES -->
        <section id="config-panel" class="config-panel hidden">
          <h3>Configurações de Compressão</h3>
          <div class="settings">
            <div class="setting-group">
              <label>Perfil de Qualidade</label>
              <div class="pill-selector" id="quality-selector">
                <button class="pill" data-value="high">Alta Qualidade</button>
                <button class="pill active" data-value="balanced">Balanceado</button>
                <button class="pill" data-value="low">Máxima Compressão</button>
              </div>
            </div>
            <div class="setting-group">
              <label>Resolução de Saída</label>
              <div class="pill-selector" id="resolution-selector">
                <button class="pill active" data-value="original">Manter Original</button>
                <button class="pill" data-value="1080p">Forçar 1080p</button>
                <button class="pill" data-value="720p">Forçar 720p</button>
              </div>
            </div>
          </div>
          <button id="btn-start" class="btn action-btn">Iniciar Compressão</button>
        </section>

        <!-- PROGRESSO GLOBAL -->
        <section id="global-progress" class="global-progress hidden">
          <div class="progress-info">
            <span id="global-status-text">Processando vídeo 1 de 5...</span>
            <span id="global-eta-text">Tempo estimado: calculando...</span>
          </div>
          <div class="progress-bar-container">
            <div id="global-progress-bar" class="progress-bar" style="width: 0%;"></div>
          </div>
        </section>

        <!-- FILA DE VÍDEOS -->
        <section id="queue-section" class="queue-section hidden">
          <h3>Fila de Processamento</h3>
          <div id="video-queue-list" class="queue-list"></div>
        </section>
      </main>
    </body>
    </html>
    ```

- [ ] **Passo 2: Criar a estilização CSS premium (`src/renderer/style.css`)**
    Aplicar o visual Dark / Glassmorphism elegante e transições fluidas.
    ```css
    :root {
      --bg-dark: #0a0b10;
      --card-bg: rgba(19, 21, 32, 0.7);
      --border-color: rgba(255, 255, 255, 0.08);
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --accent: linear-gradient(135deg, #8a2be2, #00ffff);
      --accent-solid: #8a2be2;
      --success: #10b981;
      --error: #ef4444;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-dark);
      color: var(--text-main);
      font-family: 'Outfit', sans-serif;
      height: 100vh;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      user-select: none;
    }

    /* Cabeçalho do App */
    .app-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 30px;
      border-bottom: 1px solid var(--border-color);
      -webkit-app-region: drag; /* Permite arrastar a janela por aqui */
    }

    .logo {
      font-size: 1.5rem;
      font-weight: 800;
      background: var(--accent);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .badge {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-color);
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-muted);
    }

    .badge.gpu-active {
      color: var(--success);
      border-color: rgba(16, 185, 129, 0.4);
      background: rgba(16, 185, 129, 0.05);
    }

    /* Layout principal */
    .app-container {
      flex: 1;
      padding: 30px;
      display: flex;
      flex-direction: column;
      gap: 25px;
      overflow-y: auto;
    }

    /* Drag & Drop */
    .drop-zone {
      background: var(--card-bg);
      border: 2px dashed rgba(255, 255, 255, 0.15);
      border-radius: 16px;
      padding: 50px 30px;
      text-align: center;
      transition: all 0.3s ease;
      backdrop-filter: blur(12px);
    }

    .drop-zone.dragover {
      border-color: #00ffff;
      background: rgba(0, 255, 255, 0.03);
      transform: scale(0.99);
    }

    .drop-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 15px;
    }

    .drop-content .icon {
      font-size: 3.5rem;
    }

    .drop-content h2 {
      font-weight: 600;
    }

    .drop-content p {
      color: var(--text-muted);
    }

    /* Botões */
    .btn-group {
      display: flex;
      gap: 12px;
      margin-top: 10px;
    }

    .btn {
      padding: 10px 20px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      font-family: inherit;
      font-weight: 600;
      transition: all 0.2s ease;
    }

    .btn.primary {
      background: var(--accent);
      color: #000;
    }

    .btn.secondary {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-main);
      border: 1px solid var(--border-color);
    }

    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 15px rgba(138, 43, 226, 0.2);
    }

    .action-btn {
      width: 100%;
      background: var(--accent);
      color: #000;
      padding: 14px;
      border-radius: 10px;
      font-size: 1rem;
    }

    /* Configurações */
    .config-panel {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      backdrop-filter: blur(12px);
    }

    .config-panel.hidden, .global-progress.hidden, .queue-section.hidden {
      display: none !important;
    }

    .settings {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }

    .setting-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .setting-group label {
      font-size: 0.9rem;
      color: var(--text-muted);
      font-weight: 600;
    }

    .pill-selector {
      display: flex;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 8px;
      padding: 4px;
      border: 1px solid var(--border-color);
    }

    .pill {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 8px;
      border-radius: 6px;
      cursor: pointer;
      font-family: inherit;
      font-weight: 600;
      font-size: 0.85rem;
      transition: all 0.2s ease;
    }

    .pill.active {
      background: rgba(255, 255, 255, 0.1);
      color: var(--text-main);
    }

    /* Progresso Global */
    .global-progress {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      padding: 20px;
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .progress-info {
      display: flex;
      justify-content: space-between;
      font-size: 0.9rem;
      font-weight: 600;
    }

    .progress-bar-container {
      background: rgba(255, 255, 255, 0.05);
      height: 10px;
      border-radius: 5px;
      overflow: hidden;
    }

    .progress-bar {
      background: var(--accent);
      height: 100%;
      border-radius: 5px;
      transition: width 0.3s ease;
      box-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
    }

    /* Lista de Fila */
    .queue-section {
      display: flex;
      flex-direction: column;
      gap: 15px;
    }

    .queue-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .video-card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 16px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: all 0.2s ease;
    }

    .video-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
    }

    .video-name {
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 400px;
    }

    .video-meta {
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .video-progress-wrapper {
      display: flex;
      align-items: center;
      gap: 15px;
      width: 250px;
    }

    .video-progress-bar-container {
      flex: 1;
      height: 6px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 3px;
      overflow: hidden;
    }

    .video-progress-bar {
      background: var(--accent);
      height: 100%;
      width: 0%;
      transition: width 0.2s ease;
    }

    .video-pct {
      font-size: 0.85rem;
      font-weight: 600;
      min-width: 40px;
      text-align: right;
    }

    .video-card.completed {
      border-color: rgba(16, 185, 129, 0.3);
      background: rgba(16, 185, 129, 0.02);
    }

    .compare-size {
      font-size: 0.9rem;
      font-weight: 600;
    }

    .savings-badge {
      background: rgba(16, 185, 129, 0.15);
      color: var(--success);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.8rem;
      margin-left: 8px;
    }

    .video-card.error {
      border-color: rgba(239, 68, 68, 0.3);
    }

    .error-text {
      color: var(--error);
      font-size: 0.85rem;
      font-weight: 600;
    }
    ```

- [ ] **Passo 3: Criar a lógica do frontend (`src/renderer/renderer.js`)**
    Controlar o drag-and-drop, clique de botões, e atualização dos elementos em tempo real com eventos recebidos via API exposta no Preload.
    ```javascript
    const dropZone = document.getElementById('drop-zone');
    const btnSelectFiles = document.getElementById('btn-select-files');
    const btnSelectDir = document.getElementById('btn-select-dir');
    const configPanel = document.getElementById('config-panel');
    const btnStart = document.getElementById('btn-start');
    const globalProgress = document.getElementById('global-progress');
    const globalProgressBar = document.getElementById('global-progress-bar');
    const globalStatusText = document.getElementById('global-status-text');
    const globalEtaText = document.getElementById('global-eta-text');
    const queueSection = document.getElementById('queue-section');
    const videoQueueList = document.getElementById('video-queue-list');
    const gpuBadge = document.getElementById('gpu-badge');

    let videoQueue = [];

    // Formata o tamanho de Bytes para legível (MB, GB)
    function formatBytes(bytes, decimals = 1) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const dm = decimals < 0 ? 0 : decimals;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    // Formata segundos para minutos/segundos de forma amigável
    function formatTime(seconds) {
      if (!isFinite(seconds) || seconds <= 0) return 'calculando...';
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return mins > 0 ? `~${mins}m ${secs}s` : `~${secs}s`;
    }

    // 1. Escutar status da GPU
    window.api.onGPUStatus((status) => {
      gpuBadge.textContent = status.type === 'GPU' 
        ? `GPU ATIVA (${status.hevc})` 
        : 'CPU ATIVA';
      if (status.type === 'GPU') {
        gpuBadge.classList.add('gpu-active');
      }
    });

    // 2. Drag & Drop Eventos
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      
      const files = [];
      const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.flv', '.webm'];

      for (const file of e.dataTransfer.files) {
        const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        if (videoExtensions.includes(fileExt)) {
          files.push({
            filePath: file.path,
            fileName: file.name,
            size: file.size
          });
        }
      }

      if (files.length > 0) {
        addFilesToQueue(files);
      }
    });

    // 3. Clique nos botões de importação
    btnSelectFiles.addEventListener('click', async () => {
      const files = await window.api.selectFiles();
      if (files && files.length > 0) {
        addFilesToQueue(files);
      }
    });

    btnSelectDir.addEventListener('click', async () => {
      const files = await window.api.selectDirectory();
      if (files && files.length > 0) {
        addFilesToQueue(files);
      }
    });

    function addFilesToQueue(files) {
      videoQueue = [...videoQueue, ...files];
      renderQueueList();
      configPanel.classList.remove('hidden');
      queueSection.classList.remove('hidden');
    }

    function renderQueueList() {
      videoQueueList.innerHTML = '';
      videoQueue.forEach((file, index) => {
        const card = document.createElement('div');
        card.className = 'video-card';
        card.id = `card-${index}`;
        card.innerHTML = `
          <div class="video-info">
            <span class="video-name">${file.fileName}</span>
            <span class="video-meta">${formatBytes(file.size)} • Aguardando</span>
          </div>
          <div class="video-progress-wrapper" id="progress-wrapper-${index}">
            <div class="video-progress-bar-container">
              <div class="video-progress-bar" id="bar-${index}"></div>
            </div>
            <span class="video-pct" id="pct-${index}">0%</span>
          </div>
        `;
        videoQueueList.appendChild(card);
      });
    }

    // 4. Iniciar Compressão
    btnStart.addEventListener('click', async () => {
      const qualitySelector = document.getElementById('quality-selector');
      const resolutionSelector = document.getElementById('resolution-selector');

      const quality = qualitySelector.querySelector('.pill.active').dataset.value;
      const resolution = resolutionSelector.querySelector('.pill.active').dataset.value;

      btnStart.disabled = true;
      btnStart.textContent = 'Processando...';

      // Esconder seletor e painel drop
      dropZone.style.display = 'none';
      configPanel.classList.add('hidden');
      globalProgress.classList.remove('hidden');

      const result = await window.api.startCompression({
        tasks: videoQueue,
        quality,
        resolution
      });

      if (result.success) {
        // Redefine IDs dos cards com base nos IDs reais gerados pela fila
        result.items.forEach((item, index) => {
          const card = document.getElementById(`card-${index}`);
          if (card) {
            card.id = `card-${item.id}`;
            const bar = document.getElementById(`bar-${index}`);
            if (bar) bar.id = `bar-${item.id}`;
            const pct = document.getElementById(`pct-${index}`);
            if (pct) pct.id = `pct-${item.id}`;
            const wrapper = document.getElementById(`progress-wrapper-${index}`);
            if (wrapper) wrapper.id = `progress-wrapper-${item.id}`;
          }
        });
      }
    });

    // 5. Configurar Seletores Pill
    setupPillSelectors();

    function setupPillSelectors() {
      const selectors = document.querySelectorAll('.pill-selector');
      selectors.forEach(selector => {
        const pills = selector.querySelectorAll('.pill');
        pills.forEach(pill => {
          pill.addEventListener('click', () => {
            selector.querySelector('.pill.active').classList.remove('active');
            pill.classList.add('active');
          });
        });
      });
    }

    // --- ESCUTADORES DE PROGRESSO IPC ---

    window.api.onProgress(({ itemId, percent, etaSeconds, globalPercent, globalEtaSeconds }) => {
      // 1. Atualizar progresso individual do card
      const bar = document.getElementById(`bar-${itemId}`);
      const pct = document.getElementById(`pct-${itemId}`);
      if (bar) bar.style.width = `${percent.toFixed(1)}%`;
      if (pct) pct.textContent = `${percent.toFixed(0)}%`;

      // 2. Atualizar progresso global
      globalProgressBar.style.width = `${globalPercent}%`;
      globalStatusText.textContent = `Comprimindo vídeos... (${globalPercent.toFixed(0)}%)`;
      globalEtaText.textContent = `Tempo Restante Total: ${formatTime(globalEtaSeconds)}`;
    });

    window.api.onSuccess(({ itemId, outputSize, outputPath }) => {
      const card = document.getElementById(`card-${itemId}`);
      const wrapper = document.getElementById(`progress-wrapper-${itemId}`);
      
      if (card) card.classList.add('completed');
      
      if (wrapper) {
        const file = videoQueue.find((_, i) => document.getElementById(`card-${itemId}`) ? true : false); // fallback
        const originalSize = file ? file.size : 1; 
        const savings = ((originalSize - outputSize) / originalSize) * 100;

        wrapper.innerHTML = `
          <div class="compare-size">
            <span>${formatBytes(outputSize)}</span>
            <span class="savings-badge">-${savings.toFixed(1)}%</span>
          </div>
        `;
      }
    });

    window.api.onError(({ itemId, error }) => {
      const card = document.getElementById(`card-${itemId}`);
      const wrapper = document.getElementById(`progress-wrapper-${itemId}`);
      
      if (card) card.classList.add('error');
      if (wrapper) {
        wrapper.innerHTML = `<span class="error-text">Erro</span>`;
      }
      console.error(`Erro no vídeo ${itemId}:`, error);
    });

    window.api.onFinished(() => {
      globalStatusText.textContent = 'Concluído!';
      globalProgressBar.style.width = '100%';
      globalEtaText.textContent = 'Todos os vídeos foram comprimidos.';
      btnStart.textContent = 'Reiniciar Compressor';
      btnStart.disabled = false;
      btnStart.addEventListener('click', () => {
        window.location.reload();
      });
    });
    ```

- [ ] **Passo 4: Commit**
    ```bash
    git add src/renderer/index.html src/renderer/style.css src/renderer/renderer.js
    git commit -m "feat: design and implement premium HTML/CSS/JS frontend UI"
    ```

---

### Tarefa 7: Validação e Testes E2E (End-to-End)

**Arquivos:**
*   Nenhum (Somente validação e testes manuais integrados)

**Interfaces:**
*   Consumes: Aplicativo final montado.
*   Produces: Confirmação de funcionamento de todo o pipeline de compressão.

- [ ] **Passo 1: Rodar a aplicação para checar inicialização**
    Run: `npm start`
    Expected: Janela do Electron abre exibindo "Detectando Hardware..." no topo e depois alterando para "GPU ATIVA" ou "CPU ATIVA".

- [ ] **Passo 2: Validar compressão real**
    1. Importar um arquivo mp4 de teste.
    2. Selecionar Perfil "Balanceado".
    3. Clicar em "Iniciar Compressão".
    4. Confirmar que a barra de carregamento anda e a velocidade e ETA são exibidos.
    5. No sucesso, verificar a redução percentual exibida e a existência do arquivo `*_comprimido_*.mp4` no mesmo diretório do arquivo original.

- [ ] **Passo 3: Commit final**
    ```bash
    git commit --allow-empty -m "test: verify end-to-end integration and batch compression functionality"
    ```
