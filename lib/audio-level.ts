export const AUDIO_LEVEL_PUBLISH_INTERVAL_MS = 50;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function normalizeFloatRms(samples: ArrayLike<number>, gain = 3.4): number {
  if (samples.length === 0) return 0;

  let sumSquares = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Number(samples[index]) || 0;
    sumSquares += sample * sample;
  }

  return clamp01(Math.sqrt(sumSquares / samples.length) * gain);
}

export function normalizeByteRms(samples: Uint8Array, gain = 3.4): number {
  if (samples.length === 0) return 0;

  let sumSquares = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = (samples[index] - 128) / 128;
    sumSquares += sample * sample;
  }

  return clamp01(Math.sqrt(sumSquares / samples.length) * gain);
}

export function smoothAudioLevel(previous: number, next: number): number {
  const weight = next > previous ? 0.48 : 0.16;
  return clamp01(previous + (next - previous) * weight);
}
