import { describe, expect, it } from "vitest";
import { planVoices } from "../src/lib/voices";

const cat = (voices: any[], extra: any = {}) => ({ models: [{ modelName: "m", isPlatformDefault: true, capabilities: { voices, ...extra } }] });

describe("planVoices", () => {
  it("picks a female curious host and a male expert when available", () => {
    const p = planVoices(cat([{ id: "m1", gender: "male" }, { id: "f1", gender: "female" }, { id: "f2", gender: "female" }]), "en");
    expect(p.voiceA).toBe("f1");
    expect(p.voiceB).toBe("m1");
    expect(p.singleVoice).toBe(false);
  });
  it("filters by language, falling back to all voices", () => {
    const p = planVoices(cat([{ id: "zh1", languages: ["zh"] }, { id: "ar1", languages: ["ar-SA"] }, { id: "multi", languages: ["auto"] }]), "ar");
    expect(p.voices.map((v) => v.id)).toEqual(["ar1", "multi"]);
    const q = planVoices(cat([{ id: "zh1", languages: ["zh"] }]), "fr");
    expect(q.voices.map((v) => v.id)).toEqual(["zh1"]);
  });
  it("prefers the user's preferred model and honours explicit voice choices", () => {
    const c = { models: [{ modelName: "a", isPlatformDefault: true }, { modelName: "b", isUserPreferred: true, capabilities: { voices: [{ id: "x" }, { id: "y" }], maxCharsPerCall: 1000 } }] };
    const p = planVoices(c, "en", { voiceA: "y", voiceB: "x" });
    expect(p.model).toBe("b");
    expect([p.voiceA, p.voiceB]).toEqual(["y", "x"]);
    expect(p.maxCharsPerCall).toBe(1000);
  });
  it("degrades to a single voice or the host default", () => {
    expect(planVoices(cat([{ id: "only" }]), "en")).toMatchObject({ voiceA: "only", voiceB: "only", singleVoice: true });
    expect(planVoices(null, "en")).toMatchObject({ model: undefined, voiceA: undefined, singleVoice: true, voices: [] });
  });
});
