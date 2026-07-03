import JSZip from 'jszip';
import type { APIConfig } from '../../types';
import { getProxyWorkerUrl } from '../proxyWorker';
import { resolveNovelAiConfig } from './config';
import type { NovelAiResolvedConfig } from './types';

export const NOVEL_AI_V4_ENDPOINT = 'https://image.novelai.net/ai/generate-image-stream';
export const NOVEL_AI_LEGACY_ENDPOINT = 'https://image.novelai.net/ai/generate-image';
export const NOVEL_AI_PROXY_ENDPOINT = '/api/novelai/generate-image';

const isV4Model = (model: string): boolean => model.includes('nai-diffusion-4');

const randomSeed = (): number => Math.floor(Math.random() * 9999999999);

export const buildNovelAiRequestBody = (prompt: string, config: NovelAiResolvedConfig): Record<string, unknown> => {
    const finalPositivePrompt = [prompt, config.positivePrompt].map(s => s.trim()).filter(Boolean).join(', ');
    const seed = config.seed === -1 ? randomSeed() : config.seed;

    if (isV4Model(config.model)) {
        return {
            input: finalPositivePrompt,
            model: config.model,
            action: 'generate',
            parameters: {
                params_version: 3,
                width: config.width,
                height: config.height,
                scale: config.cfgScale,
                sampler: config.sampler,
                steps: config.steps,
                seed,
                n_samples: 1,
                ucPreset: config.ucPreset,
                qualityToggle: true,
                add_original_image: true,
                noise_schedule: 'karras',
                v4_prompt: {
                    caption: {
                        base_caption: finalPositivePrompt,
                        char_captions: [],
                    },
                    use_coords: false,
                    use_order: true,
                },
                v4_negative_prompt: {
                    caption: {
                        base_caption: config.negativePrompt,
                        char_captions: [],
                    },
                    legacy_uc: false,
                },
                negative_prompt: config.negativePrompt,
                autoSmea: false,
                dynamic_thresholding: false,
                controlnet_strength: 1,
                legacy: false,
                cfg_rescale: 0,
                legacy_v3_extend: false,
                skip_cfg_above_sigma: null,
                use_coords: false,
                legacy_uc: false,
                normalize_reference_strength_multiple: true,
                inpaintImg2ImgStrength: 1,
                characterPrompts: [],
                deliberate_euler_ancestral_bug: false,
                prefer_brownian: true,
            },
        };
    }

    return {
        input: finalPositivePrompt,
        model: config.model,
        action: 'generate',
        parameters: {
            width: config.width,
            height: config.height,
            scale: config.cfgScale,
            sampler: config.sampler,
            steps: config.steps,
            seed,
            n_samples: 1,
            ucPreset: config.ucPreset,
            qualityToggle: true,
            sm: false,
            sm_dyn: false,
            negative_prompt: config.negativePrompt,
            dynamic_thresholding: false,
            controlnet_strength: 1,
            legacy: false,
            add_original_image: false,
            cfg_rescale: 0,
            noise_schedule: 'native',
        },
    };
};

export const getNovelAiEndpointForModel = (model: string): string =>
    isV4Model(model) ? NOVEL_AI_V4_ENDPOINT : NOVEL_AI_LEGACY_ENDPOINT;

const detectMimeFromBase64 = (base64: string): string => {
    if (base64.startsWith('iVBORw0KGgo')) return 'image/png';
    if (base64.startsWith('/9j/')) return 'image/jpeg';
    if (base64.startsWith('UklGR')) return 'image/webp';
    return 'application/octet-stream';
};

const normalizeBase64Image = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('data:image/')) return trimmed;
    const mime = detectMimeFromBase64(trimmed);
    if (!mime.startsWith('image/')) return null;
    return `data:${mime};base64,${trimmed}`;
};

const base64ToBlob = (base64: string): Blob => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes]);
};

const blobToDataUrl = async (blob: Blob): Promise<string> => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const bufferCtor = (globalThis as any).Buffer;
    let base64: string;
    if (bufferCtor) {
        base64 = bufferCtor.from(bytes).toString('base64');
    } else {
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        base64 = btoa(binary);
    }
    return `data:${blob.type || 'image/png'};base64,${base64}`;
};

export const parseNovelAiSseImage = (text: string): { imageDataUrl?: string; zipBlob?: Blob } => {
    const lines = text.trim().split(/\r?\n/);
    let base64Data: string | null = null;
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        const line = lines[i].trim();
        if (!line.startsWith('data:') || line === 'data: [DONE]') continue;
        const dataContent = line.replace(/^data:\s*/, '').trim();
        if (!dataContent) continue;
        try {
            const parsed = JSON.parse(dataContent);
            if (parsed?.event_type === 'final' && parsed.image) {
                base64Data = String(parsed.image);
                break;
            }
            if (parsed?.data) {
                base64Data = String(parsed.data);
                break;
            }
            if (parsed?.image) {
                base64Data = String(parsed.image);
                break;
            }
        } catch {
            base64Data = dataContent;
            break;
        }
    }
    if (!base64Data) return {};
    const imageDataUrl = normalizeBase64Image(base64Data);
    if (imageDataUrl) return { imageDataUrl };
    return { zipBlob: base64ToBlob(base64Data) };
};

export const extractImageDataUrlFromZip = async (zipBlob: Blob): Promise<string> => {
    const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());
    const imageFile = Object.values(zip.files).find(file => /\.(png|jpe?g|webp)$/i.test(file.name));
    if (!imageFile) throw new Error('NovelAI response did not contain an image file.');
    const bytes = await imageFile.async('uint8array');
    const lowerName = imageFile.name.toLowerCase();
    const mime = lowerName.endsWith('.webp')
        ? 'image/webp'
        : lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')
            ? 'image/jpeg'
            : 'image/png';
    const imageBlob = new Blob([bytes], { type: mime });
    return blobToDataUrl(imageBlob);
};

export const parseNovelAiImageResponse = async (response: Response): Promise<string> => {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
        const parsed = parseNovelAiSseImage(await response.text());
        if (parsed.imageDataUrl) return parsed.imageDataUrl;
        if (parsed.zipBlob) return extractImageDataUrlFromZip(parsed.zipBlob);
        throw new Error('NovelAI stream did not contain an image payload.');
    }

    const blob = await response.blob();
    if (contentType.startsWith('image/')) return blobToDataUrl(blob);
    return extractImageDataUrlFromZip(blob);
};

const isLikelyNetworkOrCorsError = (error: unknown): boolean =>
    error instanceof TypeError || /failed to fetch|network|cors|load failed/i.test(String((error as any)?.message || error));

const safeProviderError = async (response: Response): Promise<Error> => {
    let detail = '';
    try {
        detail = (await response.text()).replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]').slice(0, 160);
    } catch {
        detail = '';
    }
    const suffix = detail ? `: ${detail}` : '';
    return new Error(`NovelAI request failed (${response.status})${suffix}`);
};

async function postNovelAi(endpoint: string, body: Record<string, unknown>, apiKey: string): Promise<Response> {
    return fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
    });
}

async function postNovelAiViaProxy(body: Record<string, unknown>, apiKey: string): Promise<Response> {
    return fetch(NOVEL_AI_PROXY_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ body }),
    });
}

async function postNovelAiViaWorker(body: Record<string, unknown>, apiKey: string): Promise<Response> {
    const workerUrl = getProxyWorkerUrl().replace(/\/+$/, '');
    return fetch(`${workerUrl}/novelai/generate-image`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ body }),
    });
}

async function postNovelAiFallback(body: Record<string, unknown>, apiKey: string): Promise<Response> {
    try {
        const workerResponse = await postNovelAiViaWorker(body, apiKey);
        if (workerResponse.ok || (workerResponse.status !== 404 && workerResponse.status !== 405)) {
            return workerResponse;
        }
    } catch {
        // Worker URL may be unreachable or not yet deployed with NovelAI support.
    }
    return postNovelAiViaProxy(body, apiKey);
}

export async function generateNovelAiImage(prompt: string, apiConfig: APIConfig): Promise<{ imageDataUrl: string; fullPrompt: string }> {
    const config = resolveNovelAiConfig(apiConfig);
    if (!config.apiKey) throw new Error('NovelAI API key is not configured.');
    const body = buildNovelAiRequestBody(prompt, config);
    const endpoint = getNovelAiEndpointForModel(config.model);

    let response: Response;
    try {
        response = await postNovelAi(endpoint, body, config.apiKey);
    } catch (error) {
        if (!isLikelyNetworkOrCorsError(error)) throw new Error('NovelAI request could not be sent.');
        response = await postNovelAiFallback(body, config.apiKey);
    }

    if (!response.ok) throw await safeProviderError(response);
    const imageDataUrl = await parseNovelAiImageResponse(response);
    const fullPrompt = String(body.input || prompt);
    return { imageDataUrl, fullPrompt };
}
