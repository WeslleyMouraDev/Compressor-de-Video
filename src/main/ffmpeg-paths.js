const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
const fs = require('fs');

function fixAsarPath(rawPath) {
  if (!rawPath) return rawPath;
  if (rawPath.includes('app.asar')) {
    const unpackedPath = rawPath.replace('app.asar', 'app.asar.unpacked');
    if (fs.existsSync(unpackedPath)) {
      return unpackedPath;
    }
  }
  return rawPath;
}

function getFfmpegPath() {
  return fixAsarPath(ffmpegInstaller.path);
}

function getFfprobePath() {
  return fixAsarPath(ffprobeInstaller.path);
}

module.exports = { getFfmpegPath, getFfprobePath };
