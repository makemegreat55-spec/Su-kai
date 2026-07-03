import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rerankDocuments } from './rerank';
import { OPENROUTER_BASE_URL, OPENROUTER_RERANK_MODEL } from './providerConfig';

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('rerankDocuments provider bodies', () => {
    it('OpenRouter 使用 /api/v1/rerank，复用传入 key，且不发送 return_documents', async () => {
        global.fetch = vi.fn(async (url: any, init: any) => {
            const body = JSON.parse(init.body as string);
            expect(url).toBe('https://openrouter.ai/api/v1/rerank');
            expect(init.headers.Authorization).toBe('Bearer sk-or');
            expect(body).toEqual({
                model: OPENROUTER_RERANK_MODEL,
                query: '外公身体',
                documents: ['外公检查正常', '今天下雨'],
                top_n: 2,
            });
            return {
                ok: true,
                status: 200,
                json: async () => ({ results: [{ index: 0, relevance_score: 0.92 }] }),
            } as any;
        }) as any;

        const results = await rerankDocuments(
            { provider: 'openrouter', baseUrl: 'https://openrouter.ai', apiKey: 'Bearer sk-or', model: OPENROUTER_RERANK_MODEL },
            '外公身体',
            ['外公检查正常', '今天下雨'],
            2,
        );

        expect(results).toEqual([{ index: 0, relevance_score: 0.92 }]);
    });

    it('非 OpenRouter provider 保留 return_documents=false', async () => {
        global.fetch = vi.fn(async (_url: any, init: any) => {
            const body = JSON.parse(init.body as string);
            expect(body.return_documents).toBe(false);
            return {
                ok: true,
                status: 200,
                json: async () => ({ results: [{ index: 1, relevance_score: 0.8 }] }),
            } as any;
        }) as any;

        const results = await rerankDocuments(
            { provider: 'openai-compatible', baseUrl: 'https://api.test/v1', apiKey: 'sk-test', model: 'BAAI/bge-reranker-v2-m3' },
            'query',
            ['a', 'b'],
            1,
        );

        expect(results).toEqual([{ index: 1, relevance_score: 0.8 }]);
    });

    it('OpenRouter base URL 定数からも rerank endpoint を組み立てる', async () => {
        global.fetch = vi.fn(async (url: any) => {
            expect(url).toBe('https://openrouter.ai/api/v1/rerank');
            return {
                ok: true,
                status: 200,
                json: async () => ({ results: [] }),
            } as any;
        }) as any;

        await rerankDocuments(
            { provider: 'openrouter', baseUrl: OPENROUTER_BASE_URL, apiKey: 'sk-or', model: OPENROUTER_RERANK_MODEL },
            'query',
            ['doc'],
            1,
        );
    });
});
