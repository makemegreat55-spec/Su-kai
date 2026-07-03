import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getEmbeddings } from './embedding';
import type { EmbeddingConfig } from './types';
import {
    getEmbeddingUrl,
    normalizeApiKey,
    normalizeEmbeddingConfig,
    OPENROUTER_BASE_URL,
    OPENROUTER_EMBEDDING_MODEL,
} from './providerConfig';

// 这组测试守护「分批 / 并行不破坏结果」这条契约：
//   1. 无论多少条文本，返回的向量条数 = 输入条数，且顺序严格对应下标
//   2. 任何单次请求塞的条数都 ≤ 10（DashScope/Qwen 的硬上限）
//   3. 多批走并行 + 并发上限，不改变上面两条
//
// 调用方（pipeline 的 queryVectors[i]、vectorStore 的 vectors[i]）全靠
// 「第 i 个向量对应第 i 条输入」这个保序契约，所以这是召回正确性的地基。

const config: EmbeddingConfig = {
    baseUrl: 'https://api.test/v1',
    apiKey: 'test-key',
    model: 'BAAI/bge-m3',
    dimensions: 1024,
};

// 记录每次 fetch 实际塞了几条 input，用于断言 batch 上限
let batchSizes: number[] = [];

beforeEach(() => {
    batchSizes = [];
    // mock fetch：把每条输入文本「原样编码」进它的向量第一位。
    // 文本约定是 String(i)，所以正确情况下 results[i][0] === i。
    // 用文本身份编码（而非请求内的局部下标）→ 一旦顺序错乱，断言立刻失败。
    global.fetch = vi.fn(async (_url: any, init: any) => {
        const body = JSON.parse(init.body as string);
        const input: string[] = body.input;
        batchSizes.push(input.length);
        return {
            ok: true,
            status: 200,
            json: async () => ({
                data: input.map((text, localIdx) => ({
                    index: localIdx,
                    embedding: [Number(text)],
                })),
            }),
        } as any;
    }) as any;
});

describe('getEmbeddings 分批 / 并行保序', () => {
    it('空输入返回空数组，不发请求', async () => {
        const out = await getEmbeddings([], config);
        expect(out).toEqual([]);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('单条输入返回单条向量', async () => {
        const out = await getEmbeddings(['0'], config);
        expect(out).toHaveLength(1);
        expect(out[0][0]).toBe(0);
        expect(batchSizes).toEqual([1]);
    });

    it('恰好 10 条 → 一次请求，顺序正确', async () => {
        const texts = Array.from({ length: 10 }, (_, i) => String(i));
        const out = await getEmbeddings(texts, config);
        expect(out).toHaveLength(10);
        out.forEach((v, i) => expect(v[0]).toBe(i));
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(Math.max(...batchSizes)).toBeLessThanOrEqual(10);
    });

    it('12 条（检索典型场景）→ 拆成 ≤10 的多批，顺序仍严格对应', async () => {
        const texts = Array.from({ length: 12 }, (_, i) => String(i));
        const out = await getEmbeddings(texts, config);
        expect(out).toHaveLength(12);
        // 关键：第 i 个向量必须仍是第 i 条输入算出来的
        out.forEach((v, i) => expect(v[0]).toBe(i));
        expect(fetch).toHaveBeenCalledTimes(2);
        // 没有任何一批超过 10（否则 Qwen 会 400）
        batchSizes.forEach(n => expect(n).toBeLessThanOrEqual(10));
    });

    it('100 条（重建场景）→ 全部保序，且每批都 ≤10', async () => {
        const texts = Array.from({ length: 100 }, (_, i) => String(i));
        const out = await getEmbeddings(texts, config);
        expect(out).toHaveLength(100);
        out.forEach((v, i) => expect(v[0]).toBe(i));
        expect(batchSizes.reduce((a, b) => a + b, 0)).toBe(100); // 不多不少
        batchSizes.forEach(n => expect(n).toBeLessThanOrEqual(10));
    });
});

describe('Embedding provider config', () => {
    it('OpenRouter URL 正规化到 /api/v1/embeddings', () => {
        const normalized = normalizeEmbeddingConfig({
            provider: 'openrouter',
            baseUrl: 'https://openrouter.ai',
            apiKey: 'Bearer sk-test',
            model: OPENROUTER_EMBEDDING_MODEL,
            dimensions: 1024,
        });
        expect(normalized.baseUrl).toBe(OPENROUTER_BASE_URL);
        expect(getEmbeddingUrl(normalized)).toBe('https://openrouter.ai/api/v1/embeddings');
    });

    it('API Key 接受 Authorization/Bearer 粘贴格式并剥离', () => {
        expect(normalizeApiKey('Bearer sk-test')).toBe('sk-test');
        expect(normalizeApiKey('Authorization: Bearer sk-test')).toBe('sk-test');
    });

    it('OpenRouter 请求使用正规化 URL 与 key，并验证向量 shape', async () => {
        global.fetch = vi.fn(async (url: any, init: any) => {
            const body = JSON.parse(init.body as string);
            expect(url).toBe('https://openrouter.ai/api/v1/embeddings');
            expect(init.headers.Authorization).toBe('Bearer sk-or');
            expect(body.model).toBe(OPENROUTER_EMBEDDING_MODEL);
            expect(body.dimensions).toBe(1024);
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
                }),
            } as any;
        }) as any;

        const out = await getEmbeddings(['测试'], {
            provider: 'openrouter',
            baseUrl: 'openrouter.ai',
            apiKey: 'Authorization: Bearer sk-or',
            model: OPENROUTER_EMBEDDING_MODEL,
            dimensions: 1024,
        });
        expect(out[0]).toBeInstanceOf(Float32Array);
        expect(Array.from(out[0])).toEqual(expect.arrayContaining([expect.any(Number)]));
    });

    it('成功 HTTP 但缺少 embedding 向量时仍失败', async () => {
        global.fetch = vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({ data: [{ index: 0, embedding: 'bad-shape' }] }),
        })) as any;

        await expect(getEmbeddings(['x'], config)).rejects.toThrow(/invalid vector shape/i);
    });
});
