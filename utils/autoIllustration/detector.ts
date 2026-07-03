import type { PostProcessIllustrationHookPayload } from '../applyAssistantPostProcessing';
import type { APIConfig, CharacterProfile, Message } from '../../types';
import { DB } from '../db';
import { extractYuanKaiIllustrationHint } from '../yuanKaiPrompt';
import { isNovelAiAutoIllustrationReady } from './config';
import { normalizeIllustrationHint, selectIllustrationCandidate } from './hint';
import { generateNovelAiImage } from './novelAi';
import type { AutoIllustrationCandidate, AutoIllustrationState } from './types';

const STATE_PREFIX = 'sukai_auto_illustration_state_v1:';
const pendingByChar = new Set<string>();
const lastFailureToastAt: Record<string, number> = {};

const defaultState = (): AutoIllustrationState => ({
    visualMomentum: 0,
    lastTurnIndex: 0,
    lastGeneratedAt: 0,
});

const stateKey = (charId: string): string => `${STATE_PREFIX}${charId}`;

const readState = (charId: string): AutoIllustrationState => {
    if (typeof localStorage === 'undefined') return defaultState();
    try {
        const parsed = JSON.parse(localStorage.getItem(stateKey(charId)) || 'null');
        if (!parsed || typeof parsed !== 'object') return defaultState();
        return {
            visualMomentum: Number(parsed.visualMomentum) || 0,
            lastTurnIndex: Number(parsed.lastTurnIndex) || 0,
            lastGeneratedAt: Number(parsed.lastGeneratedAt) || 0,
        };
    } catch {
        return defaultState();
    }
};

const writeState = (charId: string, state: AutoIllustrationState): void => {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(stateKey(charId), JSON.stringify(state));
    } catch {
        // Non-critical: generation can continue without persisted gating state.
    }
};

const refreshVisibleMessages = async (
    charId: string,
    setMessages: (messages: Message[]) => void,
    visibleCount: () => number,
): Promise<void> => {
    const count = Math.max(30, visibleCount());
    const messages = await DB.getRecentMessagesByCharId(charId, count + 16);
    setMessages(messages.slice(-count));
};

const findSourceMessageId = async (
    charId: string,
    candidate: AutoIllustrationCandidate,
    normalizedContent: string,
): Promise<number | null> => {
    const recent = await DB.getRecentMessagesByCharId(charId, 80, true);
    const sourceNeedle = candidate.sourceText.slice(0, 60).trim();
    const displayNeedle = normalizedContent.slice(0, 60).trim();
    const reversed = [...recent].reverse();
    const matched = reversed.find(m => {
        if (m.role !== 'assistant' || m.type !== 'text') return false;
        const content = String(m.content || '');
        return (!!sourceNeedle && content.includes(sourceNeedle)) || (!!displayNeedle && content.includes(displayNeedle));
    });
    return matched?.id ?? reversed.find(m => m.role === 'assistant' && m.type === 'text')?.id ?? null;
};

const shouldNotifyFailure = (charId: string): boolean => {
    const now = Date.now();
    const last = lastFailureToastAt[charId] || 0;
    if (now - last < 5 * 60 * 1000) return false;
    lastFailureToastAt[charId] = now;
    return true;
};

interface CreateAutoIllustrationDetectorOptions {
    char: CharacterProfile;
    apiConfig: APIConfig;
    setMessages: (messages: Message[]) => void;
    getVisibleCount: () => number;
    addToast?: (msg: string, type: 'info' | 'success' | 'error') => void;
}

async function runAutoIllustration(
    payload: PostProcessIllustrationHookPayload,
    options: CreateAutoIllustrationDetectorOptions,
): Promise<void> {
    const { char, apiConfig, setMessages, getVisibleCount, addToast } = options;
    if (!isNovelAiAutoIllustrationReady(apiConfig)) return;
    if (pendingByChar.has(char.id)) return;

    const extracted = extractYuanKaiIllustrationHint(payload.rawContent);
    const hint = normalizeIllustrationHint(extracted.illustration?.rawHint);
    const state = readState(char.id);
    const selection = selectIllustrationCandidate({
        hint,
        char,
        contextMsgs: payload.contextMsgs,
        normalizedContent: payload.normalizedContent,
        state,
    });
    writeState(char.id, selection.nextState);
    if (!selection.candidate) return;

    pendingByChar.add(char.id);
    try {
        const { imageDataUrl, fullPrompt } = await generateNovelAiImage(selection.candidate.prompt, apiConfig);
        const sourceMessageId = await findSourceMessageId(char.id, selection.candidate, payload.normalizedContent);
        await DB.saveMessage({
            charId: char.id,
            role: 'assistant',
            type: 'image',
            content: imageDataUrl,
            metadata: {
                autoNovelAiIllustration: true,
                sourceMessageId,
                sourceText: selection.candidate.sourceText,
                prompt: selection.candidate.prompt,
                fullPrompt,
                illustrationHint: selection.candidate.hint,
                generationReason: selection.candidate.generationReason,
                turnIndex: selection.candidate.turnIndex,
                importance: selection.candidate.importance,
                generatedAt: Date.now(),
            },
        });
        await refreshVisibleMessages(char.id, setMessages, getVisibleCount);
        addToast?.('自動挿絵を追加しました', 'success');
    } catch {
        if (shouldNotifyFailure(char.id)) {
            addToast?.('自動挿絵の生成に失敗しました', 'error');
        }
    } finally {
        pendingByChar.delete(char.id);
    }
}

export function createAutoIllustrationDetector(options: CreateAutoIllustrationDetectorOptions) {
    return (payload: PostProcessIllustrationHookPayload): void => {
        if (!isNovelAiAutoIllustrationReady(options.apiConfig)) return;
        const runner = () => {
            void runAutoIllustration(payload, options);
        };
        if (typeof window !== 'undefined') {
            window.setTimeout(runner, 800);
        } else {
            runner();
        }
    };
}
