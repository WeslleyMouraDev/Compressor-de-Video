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

  try {
    const result = await window.api.startCompression({
      tasks: videoQueue,
      quality,
      resolution
    });

    if (result && result.success) {
      result.items.forEach((item, index) => {
        if (videoQueue[index]) {
          videoQueue[index].id = item.id;
        }
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
    } else {
      throw new Error((result && result.error) || 'Erro desconhecido ao iniciar compressão.');
    }
  } catch (error) {
    alert(`Erro ao iniciar a compressão: ${error.message}`);
    // Restaurar a interface em caso de falha
    btnStart.disabled = false;
    btnStart.textContent = 'Iniciar Compressão';
    dropZone.style.display = 'block';
    configPanel.classList.remove('hidden');
    globalProgress.classList.add('hidden');
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
  const bar = document.getElementById(`bar-${itemId}`);
  const pct = document.getElementById(`pct-${itemId}`);
  if (bar) bar.style.width = `${percent.toFixed(1)}%`;
  if (pct) pct.textContent = `${percent.toFixed(0)}%`;

  globalProgressBar.style.width = `${globalPercent}%`;
  globalStatusText.textContent = `Comprimindo vídeos... (${globalPercent.toFixed(0)}%)`;
  globalEtaText.textContent = `Tempo Restante Total: ${formatTime(globalEtaSeconds)}`;
});

window.api.onSuccess(({ itemId, outputSize, outputPath }) => {
  const card = document.getElementById(`card-${itemId}`);
  const wrapper = document.getElementById(`progress-wrapper-${itemId}`);
  
  if (card) card.classList.add('completed');
  
  if (wrapper) {
    const file = videoQueue.find(f => f.id === itemId);
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
  
  const newBtn = btnStart.cloneNode(true);
  newBtn.textContent = 'Reiniciar Compressor';
  newBtn.disabled = false;
  btnStart.replaceWith(newBtn);
  newBtn.addEventListener('click', () => {
    window.location.reload();
  });
});
