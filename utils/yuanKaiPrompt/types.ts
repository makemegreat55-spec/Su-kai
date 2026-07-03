import type { CharacterProfile, UserProfile } from '../../types';

export interface YuanKaiPromptModeFlags {
    bilingualActive: boolean;
    htmlActive: boolean;
    thinkingActive: boolean;
    mcdActive: boolean;
    luckinActive: boolean;
    luckinChatActive: boolean;
}

export interface YuanKaiPromptCharacterSnapshot {
    id: string;
    name: string;
    remark: string;
    personaPreview: string;
    worldviewPreview: string;
    worldbookTitles: string[];
    memorySources: string[];
}

export interface YuanKaiPromptUserSnapshot {
    name: string;
    bioPreview: string;
}

export interface YuanKaiPromptRuntimeSnapshot {
    contextLimit: number;
    historyMessageCount: number;
    apiHistoryMessageCount: number;
    activeBlocks: string[];
    emojiNames: string[];
    chatStatusText: string;
    chatStatusIsBusy: boolean;
    latestThought: string;
}

export interface YuanKaiPromptContext {
    mode: 'direct-chat';
    character: YuanKaiPromptCharacterSnapshot;
    user: YuanKaiPromptUserSnapshot;
    runtime: YuanKaiPromptRuntimeSnapshot;
    legacySystemPrompt: string;
    source: {
        app: 'Su-kai';
        adapter: 'YuanKaiPromptAdapter';
        builder: 'YuanKaiPromptBuilder';
    };
}

export interface AdaptSuKaiPromptInput {
    char: CharacterProfile;
    userProfile: UserProfile;
    legacySystemPrompt: string;
    contextLimit: number;
    historyMessageCount: number;
    apiHistoryMessageCount: number;
    emojiNames: string[];
    flags: YuanKaiPromptModeFlags;
    innerState?: string;
}
