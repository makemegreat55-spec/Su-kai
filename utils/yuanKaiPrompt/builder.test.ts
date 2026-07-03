import { describe, expect, it } from 'vitest';
import { adaptSuKaiPromptContext, YuanKaiPromptBuilder } from '.';
import type { CharacterProfile, UserProfile } from '../../types';

const makeChar = (): CharacterProfile => ({
    id: 'char-1',
    name: 'Sully',
    avatar: '',
    description: '小窗备注',
    systemPrompt: 'LEGACY PERSONA UNIQUE',
    worldview: 'LEGACY WORLDVIEW UNIQUE',
    memories: [{ date: '2026-06-01', summary: '一起看雨', mood: 'soft' } as any],
    refinedMemories: { '2026-06': 'LEGACY MEMORY UNIQUE' },
    activeMemoryMonths: ['2026-06'],
    mountedWorldbooks: [{ id: 'wb-1', title: '雨城设定', content: '雨城会在夜里发光', category: '城市' }],
    memoryPalaceEnabled: true,
    memoryPalaceInjection: 'LEGACY MEMORY PALACE UNIQUE',
    chatStatus: { text: '返信ゆっくり', isBusy: true, updatedAt: 1, source: 'yuan-kai' },
} as CharacterProfile);

const userProfile: UserProfile = {
    name: 'Nikki',
    avatar: '',
    bio: '喜欢深夜聊天',
};

describe('YuanKaiPromptBuilder', () => {
    it('wraps the existing Su-kai context once and keeps Su-kai output protocol', () => {
        const legacySystemPrompt = [
            'LEGACY CONTEXT UNIQUE',
            '### 扩展设定集 (Worldbooks)',
            '### 记忆系统 (Memory Bank)',
        ].join('\n');
        const ctx = adaptSuKaiPromptContext({
            char: makeChar(),
            userProfile,
            legacySystemPrompt,
            contextLimit: 500,
            historyMessageCount: 12,
            apiHistoryMessageCount: 10,
            emojiNames: ['笑', '哭'],
            innerState: 'さっきの返事のあと、少しだけ距離感を測っている。',
            flags: {
                bilingualActive: false,
                htmlActive: false,
                thinkingActive: false,
                mcdActive: false,
                luckinActive: false,
                luckinChatActive: false,
            },
        });

        const prompt = YuanKaiPromptBuilder.build(ctx);

        expect(prompt).toContain('YuanKai Prompt Layer / Su-kai Stage 1');
        expect(prompt).toContain('LEGACY CONTEXT UNIQUE');
        expect((prompt.match(/LEGACY CONTEXT UNIQUE/g) || []).length).toBe(1);
        expect(prompt).toContain('不要输出 yuan-kai JSON 行动数组');
        expect(prompt).toContain('[[SEND_EMOJI: 表情名称]]');
        expect(prompt).toContain('[[YUAN_KAI_THOUGHT: 内心を一文で書く]]');
        expect(prompt).toContain('[[YUAN_KAI_STATUS: {"type":"update_status","status_text":"短い状態","is_busy":false}]]');
        expect(prompt).toContain('[[YUAN_KAI_ILLUSTRATION: {"trigger":true');
        expect(prompt).toContain('まず普通のチャット返信を書く');
        expect(prompt).toContain('表示本文 → `YUAN_KAI_ILLUSTRATION` → `YUAN_KAI_STATUS` → `YUAN_KAI_THOUGHT`');
        expect(prompt).toContain('画風、品質、artist、masterpiece、best quality、negative prompt は書かない');
        expect(prompt).toContain('現在の表示ステータス: 返信ゆっくり');
        expect(prompt).toContain('忙しさ: 忙しめ / 返信は少し遅い');
        expect(prompt).toContain('前回の心声: さっきの返事のあと、少しだけ距離感を測っている。');
        expect(prompt).toContain('实际聊天历史会在 system prompt 后作为 API messages 传入');
    });

    it('adapts character worldbook and memory sources without duplicating full content outside legacy context', () => {
        const ctx = adaptSuKaiPromptContext({
            char: makeChar(),
            userProfile,
            legacySystemPrompt: 'LEGACY FULL PROMPT',
            contextLimit: 200,
            historyMessageCount: 3,
            apiHistoryMessageCount: 3,
            emojiNames: [],
            flags: {
                bilingualActive: true,
                htmlActive: true,
                thinkingActive: true,
                mcdActive: true,
                luckinActive: false,
                luckinChatActive: false,
            },
        });

        expect(ctx.character.worldbookTitles).toEqual(['[城市] 雨城设定']);
        expect(ctx.character.memorySources).toContain('monthly summaries: 1');
        expect(ctx.character.memorySources).toContain('memory palace retrieved context');
        expect(ctx.runtime.activeBlocks).toEqual(['bilingual', 'html-card', 'thinking-chain', 'mcd-mini-app']);
    });
});
