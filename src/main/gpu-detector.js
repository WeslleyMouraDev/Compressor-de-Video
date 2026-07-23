const { exec } = require('child_process');
const { getFfmpegPath } = require('./ffmpeg-paths');

function detectGPUEncoders() {
  return new Promise((resolve) => {
    const ffmpegPath = getFfmpegPath();
    exec(`"${ffmpegPath}" -encoders`, (error, stdout) => {
      if (error || !stdout) {
        return resolve({ h264: 'libx264', hevc: 'libx265', type: 'CPU' });
      }

      let type = 'CPU';
      let h264 = 'libx264';
      let hevc = 'libx265';

      // Prioridade 1: NVIDIA
      if (stdout.includes('h264_nvenc') || stdout.includes('hevc_nvenc')) {
        if (stdout.includes('h264_nvenc')) h264 = 'h264_nvenc';
        if (stdout.includes('hevc_nvenc')) hevc = 'hevc_nvenc';
        type = 'GPU';
      }
      // Prioridade 2: AMD
      else if (stdout.includes('h264_amf') || stdout.includes('hevc_amf')) {
        if (stdout.includes('h264_amf')) h264 = 'h264_amf';
        if (stdout.includes('hevc_amf')) hevc = 'hevc_amf';
        type = 'GPU';
      }
      // Prioridade 3: Intel QSV
      else if (stdout.includes('h264_qsv') || stdout.includes('hevc_qsv')) {
        if (stdout.includes('h264_qsv')) h264 = 'h264_qsv';
        if (stdout.includes('hevc_qsv')) hevc = 'hevc_qsv';
        type = 'GPU';
      }
      // Prioridade 4: Apple Silicon / macOS Videotoolbox
      else if (stdout.includes('h264_videotoolbox') || stdout.includes('hevc_videotoolbox')) {
        if (stdout.includes('h264_videotoolbox')) h264 = 'h264_videotoolbox';
        if (stdout.includes('hevc_videotoolbox')) hevc = 'hevc_videotoolbox';
        type = 'GPU';
      }

      resolve({ h264, hevc, type });
    });
  });
}

module.exports = { detectGPUEncoders };
