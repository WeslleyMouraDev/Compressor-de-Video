# Especificação de Design: Compressor de Vídeo Premium Desktop

Este documento descreve a arquitetura, interface e lógica de implementação para um aplicativo desktop de compressão de vídeos de alto desempenho. O objetivo principal é reduzir drasticamente o tamanho dos vídeos (ex: de 140MB para 30MB) com o mínimo de perda de qualidade visual perceptível, utilizando aceleração por GPU e processamento em lote rápido.

## 1. Visão Geral do Sistema

O aplicativo será construído usando **Electron** para empacotar a interface desktop e rodar o ambiente Node.js. O processamento dos vídeos será realizado localmente através do utilitário nativo **FFmpeg**, garantindo que nenhum dado do usuário seja enviado para a internet.

### Arquitetura de Processos (Electron)
O projeto seguirá o modelo de segurança e desempenho do Electron, dividindo a execução em três componentes:
1.  **Main Process (`main.js`)**:
    *   Gerencia o ciclo de vida do aplicativo e cria a janela gráfica.
    *   Detecta o hardware disponível (NVIDIA, AMD, Intel GPU ou CPU).
    *   Gerencia a fila de compressão de vídeos em lote.
    *   Interage diretamente com o binário do FFmpeg através da biblioteca `fluent-ffmpeg`.
2.  **Preload Script (`preload.js`)**:
    *   Ponte de comunicação segura (Context Bridge).
    *   Expõe apenas funções essenciais e seguras de I/O do Node.js (seleção de arquivos/pastas locais, início de processos e escuta de eventos de progresso) para a interface visual.
3.  **Renderer Process (`src/renderer/*`)**:
    *   Interface web construída com HTML5 semanticamente estruturado e CSS3 moderno.
    *   Lida com eventos da UI (drag-and-drop, cliques, seletores de perfil).
    *   Recebe os dados de progresso e estatísticas em tempo real e atualiza os componentes visuais.

```mermaid
graph TD
    subgraph Renderer Process [Renderer Process (UI)]
        UI[Interface HTML/CSS/JS]
        DragDrop[Drag & Drop / File Pickers]
        List[Lista de Cards de Progresso]
        UI -->|Ações do Usuário| DragDrop
    end

    subgraph Preload [Preload Script (Bridge)]
        Bridge[Context Bridge API]
    end

    subgraph Main Process [Main Process (Node.js)]
        Main[main.js]
        GPU[Detecção de GPU / Hardware]
        Queue[Fila de Compressão de Vídeos]
        FFmpeg[fluent-ffmpeg Wrapper]
        Nativo[Binários FFmpeg/FFprobe]
    end

    DragDrop -->|IPC Send| Bridge
    Bridge -->|IPC Receive| Main
    Main -->|Inicializa| GPU
    GPU -->|Define Encoders| Queue
    Queue -->|Executa Processos| FFmpeg
    FFmpeg -->|Controle de Processo| Nativo
    FFmpeg -.->|Atualizações de Progresso| Bridge
    Bridge -.->|IPC Reply| UI
```

---

## 2. Requisitos de Interface e Estética Premium

A interface do usuário será projetada seguindo as diretrizes de **Rich Aesthetics**, adotando um tema escuro contemporâneo com características de *glassmorphism*.

### 2.1 Identidade Visual e Estilos (CSS)
*   **Cores principais**:
    *   Background principal: `#0a0b10` (Preto azulado profundo).
    *   Containers/Cards: `#131520` com opacidade, borda sutil em `#ffffff10` e desfoque (`backdrop-filter: blur(12px)`).
    *   Cor de Destaque: Gradiente violeta para ciano (`linear-gradient(135deg, #8a2be2, #00ffff)`).
    *   Indicador de Sucesso: Verde neon sutil (`#10b981`).
    *   Textos: `#f3f4f6` (branco acinzentado) para alta legibilidade e `#9ca3af` para metadados e legendas.
*   **Tipografia**:
    *   Uso da fonte **Outfit** ou **Inter** via Google Fonts, substituindo as fontes padrão do sistema por uma estética limpa e profissional.
*   **Transições e Animações**:
    *   Efeito de *hover* dinâmico com levitação em cards e botões.
    *   Barra de progresso com animação de pulso/brilho no gradiente.

### 2.2 Componentes da UI
1.  **Zona de Soltura (Drag & Drop Zone)**:
    *   Área centralizada com bordas tracejadas estilizadas.
    *   Exibe ícones modernos e botões dedicados: `[Selecionar Arquivos]` e `[Selecionar Pasta]`.
    *   Suporte a drag-and-drop nativo do HTML5 integrado com a API do Electron para ler caminhos absolutos de arquivos e diretórios recursivamente.
2.  **Painel de Configuração Rápida**:
    *   **Nível de Qualidade**: Botões do tipo *pill* para selecionar:
        *   `Alta Qualidade` (Menor taxa de compressão, qualidade original intocável).
        *   `Balanceado` (Redução ideal de ~70-80% de tamanho, qualidade excelente).
        *   `Máxima Compressão` (Menor tamanho possível).
    *   **Resolução de Saída**: Opções: `Manter Original`, `Forçar 1080p (FHD)` e `Forçar 720p (HD)`.
    *   **Indicador de Status do Hardware**: Badge luminosa no topo da janela exibindo `GPU ACELERADA` ou `PROCESSAMENTO VIA CPU` baseado na verificação técnica inicial.
3.  **Visualizador de Fila e Progresso**:
    *   Exibição do progresso global com uma barra de carregamento proeminente, indicando a contagem de vídeos concluídos (ex: `Vídeo 2 de 5`) e o tempo estimado total (ETA Total).
    *   Grade de cards individuais para cada arquivo na fila. Cada card mostra:
        *   Nome do vídeo, duração e tamanho original (ex: `140 MB`).
        *   Indicador de progresso individual (barra com porcentagem, velocidade em fps/multiplicador ex: `2.8x`, e tempo estimado restante do arquivo).
        *   Ao concluir, a interface substitui a barra de progresso individual por uma estatística clara: `140.2 MB → 28.5 MB (-79.6% de economia)`.

---

## 3. Lógica de Compressão e Processamento

### 3.1 Detecção de Hardware (GPU)
Durante o bootstrap da aplicação, o Main Process executa a linha de comando do FFmpeg para listar os encoders suportados pelo sistema (`ffmpeg -encoders`).
O parser procurará as seguintes strings para definir os encoders prioritários:

| Marca de GPU | Codec H.264 | Codec H.265/HEVC |
| :--- | :--- | :--- |
| **NVIDIA (NVENC)** | `h264_nvenc` | `hevc_nvenc` |
| **AMD (AMF)** | `h264_amf` | `hevc_amf` |
| **Intel (QSV)** | `h264_qsv` | `hevc_qsv` |
| **Apple Silicon (macOS)** | `h264_videotoolbox` | `hevc_videotoolbox` |

Caso nenhum encoder acelerado por hardware seja encontrado, o sistema marcará o estado como `CPU` e usará os encoders tradicionais por software: `libx264` (para H.264) e `libx265` (para H.265).

### 3.2 Perfis e Parâmetros de Compressão
A compressão padrão usará o codec **H.265 (HEVC)** devido à sua eficiência superior (consegue reduzir arquivos à metade do tamanho do H.264 com a mesma qualidade visual). Caso um dispositivo antigo do usuário não suporte reprodução de H.265, o app terá um fallback ou opção para exportar em H.264.

Os parâmetros padrão para cada perfil de qualidade são:

1.  **Alta Qualidade (Preservação Detalhada)**:
    *   *GPU:* HEVC com Constant Quality `-cq 19` (ou equivalente de qualidade do encoder da GPU).
    *   *CPU:* `libx265` com `-crf 19`, preset `veryfast`.
2.  **Balanceado (Recomendado)**:
    *   *GPU:* HEVC com Constant Quality `-cq 23`.
    *   *CPU:* `libx265` com `-crf 23`, preset `veryfast` (garante ótimo equilíbrio de velocidade, qualidade e economia).
3.  **Máxima Compressão**:
    *   *GPU:* HEVC com Constant Quality `-cq 28`.
    *   *CPU:* `libx265` com `-crf 28`, preset `veryfast`.

### 3.3 Tratamento de Resolução (Filtros de Vídeo)
Caso o usuário selecione a opção de alterar a resolução, o script verificará os metadados do vídeo com o FFprobe:
*   Se a resolução de destino for maior ou igual à resolução atual do vídeo (ex: vídeo original é 720p e a opção selecionada é `Forçar 1080p`), o redimensionamento é desativado para aquele vídeo a fim de evitar upscale artificial e degradação desnecessária.
*   Se o vídeo precisar ser reduzido, o FFmpeg aplicará o filtro: `-vf scale=1920:-2` (para 1080p) ou `-vf scale=1280:-2` (para 720p). O parâmetro `-2` instrui o FFmpeg a calcular a altura automaticamente mantendo o aspecto original da imagem, forçando-a a ser um número par (requisito de codificação de blocos de coluro YUV).

---

## 4. Gerenciamento de Fila e Cálculos Visuais

### 4.1 Processamento Serial da Fila (Fila FIFO)
Para não sobrecarregar o hardware e garantir estabilidade, a compressão do lote de vídeos selecionados será feita de forma **serial** (um vídeo por vez). Se o usuário importar 10 vídeos, eles serão inseridos em uma fila FIFO (First In, First Out).

### 4.2 Cálculos de Tempo Estimado (ETA)
1.  **ETA do Arquivo Atual**:
    À medida que o FFmpeg envia eventos de progresso contendo a porcentagem concluída, calculamos o tempo restante para o arquivo atual usando a taxa de velocidade real e o tempo decorrido individual:
    $$\text{Tempo Restante Individual (s)} = \left( \frac{\text{Tempo Decorrido Individual (s)}}{\text{Progresso \%}} \times 100 \right) - \text{Tempo Decorrido Individual (s)}$$

2.  **ETA Global do Lote**:
    Para evitar oscilações severas baseadas no tamanho de cada vídeo individual, usaremos a **duração total acumulada em segundos** de todos os vídeos da fila (via FFprobe):
    *   $\text{Duração Total do Lote (s)} = \sum \text{Duração de todos os vídeos}$
    *   $\text{Duração Processada Acumulada (s)} = \sum \text{Duração dos vídeos já comprimidos} + \text{Duração processada do vídeo atual}$
    *   $\text{Progresso Global \%} = \frac{\text{Duração Processada Acumulada}}{\text{Duração Total do Lote}} \times 100$
    *   $$\text{ETA Global (s)} = \left( \frac{\text{Tempo Decorrido Total da Sessão (s)}}{\text{Progresso Global \%}} \times 100 \right) - \text{Tempo Decorrido Total da Sessão (s)}$$

---

## 5. Plano de Verificação e Testes

A verificação do sistema focará em três pilares principais:

### 5.1 Testes de Integração e Sistema de Fila
*   **Caso de Teste 1 (Múltiplos Arquivos)**: Importação de 3 arquivos MP4 de tamanhos diferentes. Verificar se a fila inicia e processa um após o outro de forma estável, gerando arquivos de saída válidos e com a economia esperada.
*   **Caso de Teste 2 (Importação de Diretório)**: Seleção de uma pasta contendo 2 arquivos de vídeo e subarquivos não relacionados (imagens ou arquivos de texto). Verificar se o sistema filtra e adiciona apenas os arquivos de vídeo para a fila.

### 5.2 Testes de Detecção de Hardware (GPU)
*   Executar em máquina de desenvolvimento com GPU dedicada (Windows com Nvidia/AMD). Validar se o console e a interface gráfica detectam a placa (`GPU ACELERADA` ativa) e se a velocidade de frames processados por segundo (FPS) confirma o uso do codificador de hardware (valores típicos de GPU dedicada são acima de 150 FPS para 1080p, enquanto CPU fica abaixo de 60 FPS).
*   Simular fallback de hardware desabilitando via código a detecção de GPU para verificar se a conversão ocorre normalmente via processamento em CPU (software).

### 5.3 Validação de Economia e Qualidade
*   Comprimir um arquivo de teste de ~140MB usando o perfil "Balanceado".
*   Verificar se o arquivo gerado possui tamanho entre 20MB e 45MB (redução significativa).
*   Efetuar teste visual subjetivo side-by-side do vídeo original e do vídeo comprimido em monitor Full HD para verificar ausência de artefatos de compressão grosseiros (pixelamento, macroblocos ou desbotamento de cor).
