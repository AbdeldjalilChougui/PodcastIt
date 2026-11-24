/** Audio byte utilities: base64, format sniffing, exact durations, MP3/WAV joining. */

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(bin);
}

export type AudioFormat = "mp3" | "wav" | "unknown";

export function sniffFormat(bytes: Uint8Array): AudioFormat {
  if (bytes.length >= 12 && str(bytes, 0, 4) === "RIFF" && str(bytes, 8, 4) === "WAVE") return "wav";
  if (bytes.length >= 3 && str(bytes, 0, 3) === "ID3") return "mp3";
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "mp3";
  return "unknown";
}

export function mimeFor(format: AudioFormat): string {
  return format === "wav" ? "audio/wav" : "audio/mpeg";
}

function str(b: Uint8Array, off: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(b[off + i]);
  return s;
}

function u32(b: Uint8Array, off: number): number {
  return (b[off] | (b[off + 1] << 8) | (b[off + 2] << 16) | (b[off + 3] << 24)) >>> 0;
}
function u16(b: Uint8Array, off: number): number {
  return b[off] | (b[off + 1] << 8);
}

// ------------------------------------------------------------------ WAV --

export interface WavInfo {
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  byteRate: number;
  blockAlign: number;
  audioFormat: number;
  dataOffset: number;
  dataLength: number;
}

export function parseWav(bytes: Uint8Array): WavInfo | null {
  if (sniffFormat(bytes) !== "wav") return null;
  let off = 12;
  let fmt: Omit<WavInfo, "dataOffset" | "dataLength"> | null = null;
  while (off + 8 <= bytes.length) {
    const id = str(bytes, off, 4);
    let size = u32(bytes, off + 4);
    const body = off + 8;
    if (id === "fmt ") {
      fmt = {
        audioFormat: u16(bytes, body),
        channels: u16(bytes, body + 2),
        sampleRate: u32(bytes, body + 4),
        byteRate: u32(bytes, body + 8),
        blockAlign: u16(bytes, body + 12),
        bitsPerSample: u16(bytes, body + 14),
      };
    } else if (id === "data") {
      if (!fmt) return null;
      // streaming encoders sometimes write 0 / 0xFFFFFFFF as the data size
      if (size === 0 || size === 0xffffffff || body + size > bytes.length) size = bytes.length - body;
      return { ...fmt, dataOffset: body, dataLength: size };
    }
    off = body + size + (size & 1);
  }
  return null;
}

export function writeWav(pcm: Uint8Array, info: Pick<WavInfo, "channels" | "sampleRate" | "bitsPerSample" | "audioFormat">): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const v = new DataView(out.buffer);
  const blockAlign = (info.channels * info.bitsPerSample) / 8;
  const w = (o: number, s: string) => [...s].forEach((c, i) => (out[o + i] = c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + pcm.length, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, info.audioFormat || 1, true);
  v.setUint16(22, info.channels, true);
  v.setUint32(24, info.sampleRate, true);
  v.setUint32(28, info.sampleRate * blockAlign, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, info.bitsPerSample, true);
  w(36, "data");
  v.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

// ------------------------------------------------------------------ MP3 --

const BITRATES: Record<string, number[]> = {
  // [versionBit][layer] → kbps table (index 0 = free, 15 = bad)
  "1-3": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  "1-2": [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  "1-1": [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  "2-3": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  "2-2": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  "2-1": [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
};
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG1
  2: [22050, 24000, 16000], // MPEG2
  0: [11025, 12000, 8000], // MPEG2.5
};

interface Mp3Frame {
  length: number;
  samples: number;
  sampleRate: number;
}

function readMp3Frame(b: Uint8Array, off: number): Mp3Frame | null {
  if (off + 4 > b.length) return null;
  if (b[off] !== 0xff || (b[off + 1] & 0xe0) !== 0xe0) return null;
  const version = (b[off + 1] >> 3) & 3; // 0=2.5, 2=2, 3=1
  const layerBits = (b[off + 1] >> 1) & 3; // 1=III, 2=II, 3=I
  if (version === 1 || layerBits === 0) return null;
  const layer = 4 - layerBits; // 1,2,3
  const brIdx = (b[off + 2] >> 4) & 15;
  const srIdx = (b[off + 2] >> 2) & 3;
  const padding = (b[off + 2] >> 1) & 1;
  if (brIdx === 0 || brIdx === 15 || srIdx === 3) return null;
  const v1 = version === 3;
  const bitrate = BITRATES[`${v1 ? 1 : 2}-${layer}`][brIdx] * 1000;
  const sampleRate = SAMPLE_RATES[version][srIdx];
  let length: number;
  let samples: number;
  if (layer === 1) {
    length = (Math.floor((12 * bitrate) / sampleRate) + padding) * 4;
    samples = 384;
  } else {
    samples = layer === 3 && !v1 ? 576 : 1152;
    length = Math.floor(((samples / 8) * bitrate) / sampleRate) + padding;
  }
  return length > 4 ? { length, samples, sampleRate } : null;
}

function id3v2Size(b: Uint8Array): number {
  if (b.length < 10 || str(b, 0, 3) !== "ID3") return 0;
  const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f);
  const footer = b[5] & 0x10 ? 10 : 0;
  return 10 + size + footer;
}

/** Return the MPEG audio frames only (ID3v2 header / ID3v1 tail / junk removed) and their duration. */
export function mp3Frames(bytes: Uint8Array): { frames: Uint8Array; duration: number } {
  let off = id3v2Size(bytes);
  let end = bytes.length;
  if (end - off >= 128 && str(bytes, end - 128, 3) === "TAG") end -= 128;
  let start = -1;
  let duration = 0;
  let last = off;
  while (off < end) {
    const f = readMp3Frame(bytes, off);
    if (!f || off + f.length > end) {
      if (start >= 0 && f && off + f.length > end) {
        // truncated final frame: keep it, browsers tolerate it
        duration += f.samples / f.sampleRate;
        last = end;
        break;
      }
      off++;
      continue;
    }
    if (start < 0) start = off;
    duration += f.samples / f.sampleRate;
    off += f.length;
    last = off;
  }
  if (start < 0) return { frames: new Uint8Array(0), duration: 0 };
  return { frames: bytes.subarray(start, last), duration };
}

/** Exact duration in seconds for MP3/WAV bytes; null when the format is unknown. */
export function audioDuration(bytes: Uint8Array): number | null {
  const fmt = sniffFormat(bytes);
  if (fmt === "wav") {
    const info = parseWav(bytes);
    return info && info.byteRate ? info.dataLength / info.byteRate : null;
  }
  if (fmt === "mp3") {
    const d = mp3Frames(bytes).duration;
    return d > 0 ? d : null;
  }
  return null;
}

/**
 * Join clips into one playable file. All MP3 → concatenated frames; all WAV with an
 * identical PCM format → one WAV. Anything else → null (caller keeps clips separate).
 */
export function joinAudio(clips: readonly Uint8Array[]): { bytes: Uint8Array; format: AudioFormat } | null {
  if (!clips.length) return null;
  const formats = new Set(clips.map(sniffFormat));
  if (formats.size !== 1) return null;
  const fmt = [...formats][0];
  if (fmt === "mp3") {
    const parts = clips.map((c) => mp3Frames(c).frames);
    return { bytes: concat(parts), format: "mp3" };
  }
  if (fmt === "wav") {
    const infos = clips.map(parseWav);
    if (infos.some((i) => !i)) return null;
    const first = infos[0]!;
    const same = infos.every(
      (i) =>
        i!.channels === first.channels &&
        i!.sampleRate === first.sampleRate &&
        i!.bitsPerSample === first.bitsPerSample &&
        i!.audioFormat === first.audioFormat,
    );
    if (!same) return null;
    const pcm = concat(clips.map((c, k) => c.subarray(infos[k]!.dataOffset, infos[k]!.dataOffset + infos[k]!.dataLength)));
    return { bytes: writeWav(pcm, first), format: "wav" };
  }
  return null;
}

export function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Group consecutive clip indexes so each group's byte size stays ≤ maxBytes. */
export function groupBySize(sizes: readonly number[], maxBytes: number): number[][] {
  const groups: number[][] = [];
  let cur: number[] = [];
  let acc = 0;
  sizes.forEach((s, i) => {
    if (cur.length && acc + s > maxBytes) {
      groups.push(cur);
      cur = [];
      acc = 0;
    }
    cur.push(i);
    acc += s;
  });
  if (cur.length) groups.push(cur);
  return groups;
}
