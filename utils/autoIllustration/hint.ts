import type { CharacterProfile, Message } from '../../types';
import type {
    AutoIllustrationCandidate,
    AutoIllustrationState,
    NormalizedIllustrationHint,
    YuanKaiIllustrationHint,
} from './types';

const MIN_MOMENT_CHARS = 14;
const MIN_IMPORTANCE = 76;
const HIGH_IMPORTANCE = 88;
export const MIN_TURN_COOLDOWN = 4;
export const MIN_TIME_COOLDOWN_MS = 8 * 60 * 1000;

const trimField = (value: unknown, limit: number): string =>
    String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);

const clampImportance = (value: unknown): number => {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.min(100, Math.max(0, Math.round(num)));
};

export const normalizeIllustrationHint = (value: unknown): NormalizedIllustrationHint | null => {
    if (!value || typeof value !== 'object') return null;
    const raw = value as YuanKaiIllustrationHint;
    const momentText = trimField(raw.momentText ?? raw.sourceText, 240);
    const imagePrompt = trimField(raw.imagePrompt, 480);
    if (momentText.length < MIN_MOMENT_CHARS || !imagePrompt) return null;

    return {
        trigger: raw.trigger === true,
        intent: trimField(raw.intent, 60),
        title: trimField(raw.title, 48),
        momentText,
        sourceText: trimField(raw.sourceText ?? momentText, 300),
        imagePrompt,
        importance: clampImportance(raw.importance),
        subject: trimField(raw.subject, 80),
        expression: trimField(raw.expression, 80),
        pose: trimField(raw.pose, 80),
        clothing: trimField(raw.clothing, 80),
        scene: trimField(raw.scene, 120),
        camera: trimField(raw.camera, 80),
        mood: trimField(raw.mood, 80),
    };
};

export const scoreVisualMoment = (hint: NormalizedIllustrationHint, sourceText: string): number => {
    const text = `${hint.momentText} ${hint.sourceText} ${sourceText}`.toLowerCase();
    let score = hint.importance;
    if (hint.trigger) score += 12;
    if (hint.title) score += 4;
    if (hint.scene) score += 7;
    if (hint.subject) score += 5;
    if (hint.expression || hint.pose) score += 7;
    if (hint.camera) score += 3;
    if (hint.mood) score += 5;

    const visualSignals = [
        'look', 'eyes', 'face', 'smile', 'tears', 'hands', 'window', 'rain', 'light',
        'room', 'night', 'street', 'phone', 'mirror', 'door', 'sky', 'shadow',
        '見る', '目', '顔', '笑', '涙', '手', '窓', '雨', '光', '部屋', '夜', '街', '影',
        '看', '眼', '脸', '笑', '哭', '手', '窗', '雨', '光', '房间', '夜', '街',
    ];
    score += Math.min(18, visualSignals.filter(word => text.includes(word)).length * 3);
    if (text.length > 220) score -= 5;
    return Math.min(100, Math.max(0, Math.round(score)));
};

export const isPromptGenericOrUnsafe = (prompt: string): boolean => {
    const value = prompt.trim().toLowerCase();
    if (value.length < 24) return true;
    if (/^(girl|boy|person|character|anime girl|anime boy|beautiful girl)[\s,.]*$/i.test(value)) return true;
    if (/(nsfw|nude|naked|explicit|sex|sexual|child|loli|shota|gore|bloodbath)/i.test(value)) return true;
    return false;
};

export const buildNovelAiPrompt = (hint: NormalizedIllustrationHint, char: CharacterProfile): string => {
    const parts = [
        hint.imagePrompt,
        hint.subject || char.name,
        hint.expression,
        hint.pose,
        hint.clothing,
        hint.scene,
        hint.camera,
        hint.mood,
    ]
        .map(part => part.trim())
        .filter(Boolean);
    return Array.from(new Set(parts)).join(', ');
};

const estimateTurnIndex = (messages: Message[]): number =>
    messages.filter(m => m.type === 'text' && (m.role === 'user' || m.role === 'assistant')).length + 1;

export interface SelectCandidateInput {
    hint: NormalizedIllustrationHint | null;
    char: CharacterProfile;
    contextMsgs: Message[];
    normalizedContent: string;
    state: AutoIllustrationState;
    now?: number;
}

export const selectIllustrationCandidate = ({
    hint,
    char,
    contextMsgs,
    normalizedContent,
    state,
    now = Date.now(),
}: SelectCandidateInput): { candidate: AutoIllustrationCandidate | null; nextState: AutoIllustrationState; reason: string } => {
    const turnIndex = estimateTurnIndex(contextMsgs);
    if (!hint) {
        return { candidate: null, nextState: { ...state, visualMomentum: Math.max(0, state.visualMomentum * 0.75) }, reason: 'no-hint' };
    }

    const visualScore = scoreVisualMoment(hint, normalizedContent);
    const visualMomentum = Math.min(100, Math.round(state.visualMomentum * 0.62 + visualScore * 0.55));
    const nextState = { ...state, visualMomentum };

    if (!hint.trigger) return { candidate: null, nextState, reason: 'hint-not-triggered' };
    if (hint.momentText.length < MIN_MOMENT_CHARS) return { candidate: null, nextState, reason: 'moment-too-short' };
    if (isPromptGenericOrUnsafe(hint.imagePrompt)) return { candidate: null, nextState, reason: 'prompt-rejected' };
    if (Math.max(hint.importance, visualScore) < MIN_IMPORTANCE) return { candidate: null, nextState, reason: 'importance-too-low' };
    if (state.lastTurnIndex > 0 && turnIndex - state.lastTurnIndex < MIN_TURN_COOLDOWN) {
        return { candidate: null, nextState, reason: 'turn-cooldown' };
    }
    if (state.lastGeneratedAt > 0 && now - state.lastGeneratedAt < MIN_TIME_COOLDOWN_MS) {
        return { candidate: null, nextState, reason: 'time-cooldown' };
    }
    if (visualMomentum < MIN_IMPORTANCE && Math.max(hint.importance, visualScore) < HIGH_IMPORTANCE) {
        return { candidate: null, nextState, reason: 'visual-momentum-too-low' };
    }

    const prompt = buildNovelAiPrompt(hint, char);
    const candidate: AutoIllustrationCandidate = {
        hint,
        sourceText: hint.sourceText || hint.momentText || normalizedContent,
        prompt,
        fullPrompt: prompt,
        importance: Math.max(hint.importance, visualScore),
        visualScore,
        turnIndex,
        generationReason: `hint:${hint.importance}/visual:${visualScore}/momentum:${visualMomentum}`,
    };
    return {
        candidate,
        nextState: {
            visualMomentum: Math.max(0, Math.round(visualMomentum * 0.28)),
            lastTurnIndex: turnIndex,
            lastGeneratedAt: now,
        },
        reason: 'selected',
    };
};
