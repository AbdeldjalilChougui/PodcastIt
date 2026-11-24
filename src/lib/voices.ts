/** Choose a TTS model and two distinct host voices from the host catalogue. */
import type { CatalogModel, CatalogResult, TtsVoice } from "../host/types";

export interface VoicePlan {
  model?: string;
  modelLabel?: string;
  voiceA?: string;
  voiceB?: string;
  /** Voices usable for the chosen language (for the picker). */
  voices: TtsVoice[];
  maxCharsPerCall?: number;
  cuPer1kChars?: number;
  /** True when the model offers a single voice, so both hosts sound alike. */
  singleVoice: boolean;
}

export function pickModel(catalog: CatalogResult | null | undefined): CatalogModel | undefined {
  const models = catalog?.models ?? [];
  return models.find((m) => m.isUserPreferred) ?? models.find((m) => m.isPlatformDefault) ?? models[0];
}

function supports(v: TtsVoice, lang: string): boolean {
  if (!v.languages || !v.languages.length) return true;
  return v.languages.some((l) => {
    const x = l.toLowerCase();
    return x === "auto" || x === "multilingual" || x === lang || x.startsWith(`${lang}-`) || x.startsWith(`${lang}_`);
  });
}

function genderOf(v: TtsVoice): "f" | "m" | "?" {
  const g = (v.gender ?? "").toLowerCase();
  if (g.startsWith("f") || g === "woman") return "f";
  if (g.startsWith("m") || g === "man") return "m";
  return "?";
}

export function planVoices(
  catalog: CatalogResult | null | undefined,
  lang: string,
  prefs?: { voiceA?: string; voiceB?: string },
): VoicePlan {
  const model = pickModel(catalog);
  const all = model?.capabilities?.voices ?? [];
  const forLang = all.filter((v) => supports(v, lang));
  const voices = forLang.length ? forLang : all;
  const ids = new Set(voices.map((v) => v.id));

  let voiceA = prefs?.voiceA && ids.has(prefs.voiceA) ? prefs.voiceA : undefined;
  let voiceB = prefs?.voiceB && ids.has(prefs.voiceB) ? prefs.voiceB : undefined;

  if (!voiceA) {
    const def = model?.capabilities?.defaultVoice;
    voiceA =
      voices.find((v) => genderOf(v) === "f")?.id ??
      (def && ids.has(def) ? def : undefined) ??
      voices[0]?.id;
  }
  if (!voiceB) {
    const a = voices.find((v) => v.id === voiceA);
    const want = a && genderOf(a) === "f" ? "m" : a && genderOf(a) === "m" ? "f" : "?";
    voiceB =
      voices.find((v) => v.id !== voiceA && want !== "?" && genderOf(v) === want)?.id ??
      voices.find((v) => v.id !== voiceA)?.id ??
      voiceA;
  }

  return {
    model: model?.modelName,
    modelLabel: model?.displayName ?? model?.modelName,
    voiceA,
    voiceB,
    voices,
    maxCharsPerCall: model?.capabilities?.maxCharsPerCall,
    cuPer1kChars: model?.pricing?.cuPer1kChars,
    singleVoice: !voiceA || voiceA === voiceB,
  };
}
