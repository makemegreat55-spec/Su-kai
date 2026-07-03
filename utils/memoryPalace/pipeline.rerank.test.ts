import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '../../types';

const mocks = vi.hoisted(() => {
    const node = {
        id: 'mem-1',
        charId: 'char-1',
        content: '外公检查正常，医生说不用太担心',
        room: 'living_room',
        importance: 7,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
        accessCount: 0,
        tags: [],
        embedded: true,
    };
    const scored = {
        node,
        similarity: 0.9,
        bm25Score: 0.1,
        roomScore: 0.7,
        finalScore: 0.9,
    };
    return {
        node,
        scored,
        getEmbeddings: vi.fn(),
        hybridSearch: vi.fn(),
        rerankDocuments: vi.fn(),
        expandAndFormat: vi.fn(),
        touchAccess: vi.fn(),
    };
});

vi.mock('./embedding', () => ({
    getEmbeddings: mocks.getEmbeddings,
}));

vi.mock('./hybridSearch', () => ({
    hybridSearch: mocks.hybridSearch,
}));

vi.mock('./rerank', () => ({
    rerankDocuments: mocks.rerankDocuments,
}));

vi.mock('./formatter', () => ({
    expandAndFormat: mocks.expandAndFormat,
}));

vi.mock('./activation', () => ({
    spreadActivation: vi.fn(async results => results),
}));

vi.mock('./priming', () => ({
    applyPriming: vi.fn(results => results),
    checkRumination: vi.fn(async () => null),
}));

vi.mock('./links', () => ({
    buildLinks: vi.fn(async () => []),
    strengthenCoActivated: vi.fn(async () => undefined),
}));

vi.mock('./vectorSearch', () => ({
    isRemoteSearchBroken: vi.fn(() => false),
}));

vi.mock('./db', () => ({
    MemoryNodeDB: {
        getByCharId: vi.fn(async () => [mocks.node]),
        getByRoom: vi.fn(async () => [mocks.node]),
        getById: vi.fn(async () => mocks.node),
        save: vi.fn(async () => undefined),
        touchAccess: mocks.touchAccess,
    },
    MemoryVectorDB: {
        getAllByCharId: vi.fn(async () => [{
            memoryId: mocks.node.id,
            charId: mocks.node.charId,
            vector: new Float32Array([1]),
            dimensions: 1,
            model: 'openai/text-embedding-3-small',
        }]),
    },
    MemoryLinkDB: {},
    AnticipationDB: {
        getByCharId: vi.fn(async () => []),
    },
    EventBoxDB: {
        getById: vi.fn(async () => null),
    },
}));

vi.mock('../db', () => ({
    DB: {
        getMessagesByCharId: vi.fn(async () => []),
        getUserProfile: vi.fn(async () => ({ name: '用户' })),
    },
}));

describe('retrieveMemories rerank fallback', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('localStorage', {
            getItem: vi.fn((key: string) => key === 'os_memory_palace_config'
                ? JSON.stringify({
                    embedding: {
                        provider: 'openrouter',
                        baseUrl: 'https://openrouter.ai/api/v1',
                        apiKey: 'sk-or',
                        model: 'openai/text-embedding-3-small',
                        dimensions: 1024,
                    },
                    rerank: {
                        enabled: true,
                        provider: 'openrouter',
                        baseUrl: 'https://openrouter.ai/api/v1',
                        model: 'cohere/rerank-v3.5',
                        topN: 5,
                    },
                })
                : null),
        });
        mocks.getEmbeddings.mockResolvedValue([new Float32Array([1]), new Float32Array([1])]);
        mocks.hybridSearch.mockResolvedValue([mocks.scored]);
        mocks.rerankDocuments.mockRejectedValue(new Error('rerank offline'));
        mocks.expandAndFormat.mockResolvedValue('FORMATTED_MEMORY_CONTEXT');
    });

    it('rerank 失败しても主召回結果を返す', async () => {
        const { retrieveMemories } = await import('./pipeline');
        const messages: Message[] = [
            {
                id: 1,
                charId: 'char-1',
                role: 'user',
                type: 'text' as any,
                content: '外公の体調の話、覚えてる？',
                timestamp: Date.now(),
            },
        ];

        const output = await retrieveMemories(messages, 'char-1', {
            provider: 'openrouter',
            baseUrl: 'https://openrouter.ai/api/v1',
            apiKey: 'sk-or',
            model: 'openai/text-embedding-3-small',
            dimensions: 1024,
        });

        expect(mocks.rerankDocuments).toHaveBeenCalled();
        expect(mocks.expandAndFormat).toHaveBeenCalledWith(
            expect.arrayContaining([mocks.scored]),
            'char-1',
            [],
            undefined,
            undefined,
        );
        expect(output).toBe('FORMATTED_MEMORY_CONTEXT');
    });
});
