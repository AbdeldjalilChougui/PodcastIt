import { describe, expect, it } from "vitest";
import { audioDuration, base64ToBytes, bytesToBase64, concat, groupBySize, joinAudio, mp3Frames, parseWav, sniffFormat } from "../src/lib/audio";
import { tinyWav } from "./helpers";

/** Build a fake MPEG-1 Layer III CBR stream: 128 kbps, 44.1 kHz → 417-byte frames of 1152 samples. */
function fakeMp3(frames: number, { id3 = false, tag = false } = {}): Uint8Array {
  const frame = new Uint8Array(417);
  frame[0] = 0xff;
  frame[1] = 0xfb; // MPEG1, Layer III, no CRC
  frame[2] = 0x90; // bitrate idx 9 (128k), 44.1 kHz, no padding
  frame[3] = 0x64;
  const parts: Uint8Array[] = [];
  if (id3) {
    const h = new Uint8Array(10 + 20);
    h.set([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 20]);
    parts.push(h);
  }
  for (let i = 0; i < frames; i++) parts.push(frame);
  if (tag) {
    const t = new Uint8Array(128);
    t.set([0x54, 0x41, 0x47]);
    parts.push(t);
  }
  return concat(parts);
}

describe("audio bytes", () => {
  it("base64 round-trips large buffers", () => {
    const b = new Uint8Array(200_000).map((_, i) => i % 251);
    expect(base64ToBytes(bytesToBase64(b))).toEqual(b);
    expect(base64ToBytes("data:audio/mpeg;base64,AAEC")).toEqual(new Uint8Array([0, 1, 2]));
  });

  it("sniffs formats", () => {
    expect(sniffFormat(tinyWav(0.1))).toBe("wav");
    expect(sniffFormat(fakeMp3(2))).toBe("mp3");
    expect(sniffFormat(fakeMp3(2, { id3: true }))).toBe("mp3");
    expect(sniffFormat(new Uint8Array([1, 2, 3]))).toBe("unknown");
  });

  it("computes exact WAV and MP3 durations", () => {
    expect(audioDuration(tinyWav(1.5))).toBeCloseTo(1.5, 3);
    // 100 frames * 1152 / 44100
    expect(audioDuration(fakeMp3(100, { id3: true, tag: true }))).toBeCloseTo((100 * 1152) / 44100, 4);
    expect(audioDuration(new Uint8Array(10))).toBeNull();
  });

  it("mp3Frames strips ID3v2 header and ID3v1 tail", () => {
    const f = mp3Frames(fakeMp3(3, { id3: true, tag: true }));
    expect(f.frames.length).toBe(3 * 417);
    expect(f.frames[0]).toBe(0xff);
  });

  it("joins MP3 clips frame-exactly", () => {
    const j = joinAudio([fakeMp3(10, { id3: true }), fakeMp3(5, { tag: true })])!;
    expect(j.format).toBe("mp3");
    expect(audioDuration(j.bytes)).toBeCloseTo((15 * 1152) / 44100, 4);
  });

  it("joins WAV clips into one valid WAV", () => {
    const j = joinAudio([tinyWav(1), tinyWav(0.5)])!;
    expect(j.format).toBe("wav");
    const info = parseWav(j.bytes)!;
    expect(info.dataLength).toBe(1.5 * 8000 * 2);
    expect(audioDuration(j.bytes)).toBeCloseTo(1.5, 3);
  });

  it("refuses to join mixed or incompatible formats", () => {
    expect(joinAudio([tinyWav(1), fakeMp3(2)])).toBeNull();
    expect(joinAudio([tinyWav(1, 8000), tinyWav(1, 16000)])).toBeNull();
    expect(joinAudio([])).toBeNull();
  });

  it("groups clips by byte size", () => {
    expect(groupBySize([4, 4, 4, 9, 1], 8)).toEqual([[0, 1], [2], [3], [4]]);
    expect(groupBySize([], 8)).toEqual([]);
  });
});
