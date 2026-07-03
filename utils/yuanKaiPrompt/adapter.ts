import type { CharacterProfile } from '../../types';
import type {
    AdaptSuKaiPromptInput,
    YuanKaiPromptCharacterSnapshot,
    YuanKaiPromptContext,
    YuanKaiPromptModeFlags,
} from './types';

const preview = (value: string | undefined, max = 220): string => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max - 1)}...` : text;
};

const collectWorldbookTitles = (char: CharacterProfile): string[] =>
    (char.mountedWorldbooks || [])
        .map(wb => {
            const category = wb.category ? `[${wb.category}] ` : '';
            return `${category}${wb.title || 'Untitled'}`.trim();
        })
        .filter(Boolean);

const collectMemorySources = (char: CharacterProfile): string[] => {
    const sources: string[] = [];
    const refinedCount = Object.keys(char.refinedMemories || {}).length;
    if (refinedCount > 0) sources.push(`monthly summaries: ${refinedCount}`);
    if (char.activeMemoryMonths?.length) sources.push(`active months: ${char.activeMemoryMonths.join(', ')}`);
    if (char.memories?.length) sources.push(`daily logs: ${char.memories.length}`);
    if (char.memoryPalaceEnabled) sources.push('memory palace enabled');
    if (char.memoryPalaceEnabled && char.memoryPalaceInjection?.trim()) sources.push('memory palace retrieved context');
    if (char.selfInsights?.length) sources.push(`self insights: ${char.selfInsights.length}`);
    return sources;
};

const collectActiveBlocks = (flags: YuanKaiPromptModeFlags): string[] => {
    const blocks: string[] = [];
    if (flags.bilingualActive) blocks.push('bilingual');
    if (flags.htmlActive) blocks.push('html-card');
    if (flags.thinkingActive) blocks.push('thinking-chain');
    if (flags.mcdActive) blocks.push('mcd-mini-app');
    if (flags.luckinActive) blocks.push('luckin-mini-app');
    if (flags.luckinChatActive) blocks.push('luckin-chat-tools');
    return blocks;
};

const buildCharacterSnapshot = (char: CharacterProfile): YuanKaiPromptCharacterSnapshot => ({
    id: char.id,
    name: char.name || '角色',
    remark: char.description || '',
    personaPreview: preview(char.systemPrompt, 260),
    worldviewPreview: preview(char.worldview, 220),
    worldbookTitles: collectWorldbookTitles(char),
    memorySources: collectMemorySources(char),
});

export function adaptSuKaiPromptContext(input: AdaptSuKaiPromptInput): YuanKaiPromptContext {
    return {
        mode: 'direct-chat',
        source: {
            app: 'Su-kai',
            adapter: 'YuanKaiPromptAdapter',
            builder: 'YuanKaiPromptBuilder',
        },
        character: buildCharacterSnapshot(input.char),
        user: {
            name: input.userProfile?.name || '用户',
            bioPreview: preview(input.userProfile?.bio, 180),
        },
        runtime: {
            contextLimit: input.contextLimit,
            historyMessageCount: input.historyMessageCount,
            apiHistoryMessageCount: input.apiHistoryMessageCount,
            activeBlocks: collectActiveBlocks(input.flags),
            emojiNames: input.emojiNames.slice(0, 80),
            chatStatusText: preview(input.char.chatStatus?.text, 32),
            chatStatusIsBusy: input.char.chatStatus?.isBusy === true,
            latestThought: preview(input.innerState, 120),
        },
        legacySystemPrompt: input.legacySystemPrompt.trim(),
    };
}
