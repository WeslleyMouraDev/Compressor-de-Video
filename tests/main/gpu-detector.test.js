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
