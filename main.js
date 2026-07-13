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
