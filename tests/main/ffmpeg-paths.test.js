const { getFfmpegPath, getFfprobePath } = require('../../src/main/ffmpeg-paths');
const fs = require('fs');

describe('FFmpeg Paths Utility', () => {
  test('deve retornar um caminho válido para ffmpeg', () => {
    const ffmpegPath = getFfmpegPath();
    expect(typeof ffmpegPath).toBe('string');
    expect(ffmpegPath.length).toBeGreaterThan(0);
  });

  test('deve retornar um caminho válido para ffprobe', () => {
    const ffprobePath = getFfprobePath();
    expect(typeof ffprobePath).toBe('string');
    expect(ffprobePath.length).toBeGreaterThan(0);
  });

  test('deve substituir app.asar por app.asar.unpacked se o arquivo unpacked existir', () => {
    const spyExists = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const { getFfmpegPath } = require('../../src/main/ffmpeg-paths');
    
    // Testamos a lógica interna de correção de asar
    const pathWithAsar = 'C:\\path\\to\\app.asar\\node_modules\\ffmpeg.exe';
    const expectedUnpackedPath = 'C:\\path\\to\\app.asar.unpacked\\node_modules\\ffmpeg.exe';

    // Importamos diretamente a função para validar a substituição
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    const originalPath = ffmpegInstaller.path;
    ffmpegInstaller.path = pathWithAsar;

    const result = getFfmpegPath();
    expect(result).toBe(expectedUnpackedPath);

    // Restaura estado original
    ffmpegInstaller.path = originalPath;
    spyExists.mockRestore();
  });
});
