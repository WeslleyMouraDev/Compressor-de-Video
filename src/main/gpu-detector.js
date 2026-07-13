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
