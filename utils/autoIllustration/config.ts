import type { APIConfig } from '../../types';
import type { NovelAiResolvedConfig } from './types';

export const DEFAULT_NOVEL_AI_MODEL = 'nai-diffusion-4-5-full';
export const DEFAULT_NOVEL_AI_RESOLUTION = '1024x1024';
export const DEFAULT_NOVEL_AI_STEPS = 28;
export const DEFAULT_NOVEL_AI_CFG_SCALE = 5;
export const DEFAULT_NOVEL_AI_SAMPLER = 'k_euler_ancestral';
export const DEFAULT_NOVEL_AI_SEED = -1;
export const DEFAULT_NOVEL_AI_UC_PRESET = 1;
export const DEFAULT_NOVEL_AI_POSITIVE_PROMPT = 'best quality, amazing quality, very aesthetic, anime illustration';
export const DEFAULT_NOVEL_AI_NEGATIVE_PROMPT = 'lowres, bad anatomy, bad hands, text, watermark, logo, speech bubble, ui, cropped';

export const stripBearerPrefix = (value: string | undefined): string =>
    String(value || '').trim().replace(/^Authorization:\s*/i, '').replace(/^Bearer\s+/i, '').trim();

export const parseResolution = (value: string | undefined): { width: number; height: number; resolution: string } => {
    const raw = String(value || DEFAULT_NOVEL_AI_RESOLUTION).trim();
    const match = raw.match(/^(\d{3,4})\s*x\s*(\d{3,4})$/i);
    const width = match ? Number(match[1]) : 1024;
    const height = match ? Number(match[2]) : 1024;
    const safeWidth = Number.isFinite(width) ? Math.min(1536, Math.max(512, width)) : 1024;
    const safeHeight = Number.isFinite(height) ? Math.min(1536, Math.max(512, height)) : 1024;
    return { width: safeWidth, height: safeHeight, resolution: `${safeWidth}x${safeHeight}` };
};

const finiteNumber = (value: unknown, fallback: number, min: number, max: number): number => {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
};

export const isNovelAiAutoIllustrationReady = (apiConfig: APIConfig): boolean =>
    apiConfig.novelAiEnabled !== false
    && apiConfig.autoIllustrationEnabled !== false
    && !!stripBearerPrefix(apiConfig.novelAiApiKey);

export const resolveNovelAiConfig = (apiConfig: APIConfig): NovelAiResolvedConfig => {
    const resolution = parseResolution(apiConfig.novelAiResolution);
    return {
        apiKey: stripBearerPrefix(apiConfig.novelAiApiKey),
        model: String(apiConfig.novelAiModel || DEFAULT_NOVEL_AI_MODEL).trim() || DEFAULT_NOVEL_AI_MODEL,
        resolution: resolution.resolution,
        width: resolution.width,
        height: resolution.height,
        steps: Math.round(finiteNumber(apiConfig.novelAiSteps, DEFAULT_NOVEL_AI_STEPS, 1, 50)),
        cfgScale: finiteNumber(apiConfig.novelAiCfgScale, DEFAULT_NOVEL_AI_CFG_SCALE, 1, 20),
        sampler: String(apiConfig.novelAiSampler || DEFAULT_NOVEL_AI_SAMPLER).trim() || DEFAULT_NOVEL_AI_SAMPLER,
        seed: Math.round(finiteNumber(apiConfig.novelAiSeed, DEFAULT_NOVEL_AI_SEED, -1, 4294967295)),
        ucPreset: Math.round(finiteNumber(apiConfig.novelAiUcPreset, DEFAULT_NOVEL_AI_UC_PRESET, 0, 4)),
        positivePrompt: String(apiConfig.novelAiPositivePrompt || DEFAULT_NOVEL_AI_POSITIVE_PROMPT).trim(),
        negativePrompt: String(apiConfig.novelAiNegativePrompt || DEFAULT_NOVEL_AI_NEGATIVE_PROMPT).trim(),
    };
};
