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
