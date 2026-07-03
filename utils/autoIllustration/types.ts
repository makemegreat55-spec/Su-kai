import type { APIConfig, CharacterProfile, Message } from '../../types';

export interface YuanKaiIllustrationHint {
    trigger?: boolean;
    intent?: string;
    title?: string;
    momentText?: string;
    sourceText?: string;
    imagePrompt?: string;
    importance?: number;
    subject?: string;
    expression?: string;
    pose?: string;
    clothing?: string;
    scene?: string;
    camera?: string;
    mood?: string;
}

export interface NormalizedIllustrationHint {
    trigger: boolean;
    intent: string;
    title: string;
    momentText: string;
    sourceText: string;
    imagePrompt: string;
    importance: number;
    subject: string;
    expression: string;
    pose: string;
    clothing: string;
    scene: string;
    camera: string;
    mood: string;
}

export interface AutoIllustrationCandidate {
    hint: NormalizedIllustrationHint;
    sourceText: string;
    prompt: string;
    fullPrompt: string;
    importance: number;
    visualScore: number;
    turnIndex: number;
    generationReason: string;
}

export interface AutoIllustrationState {
    visualMomentum: number;
    lastTurnIndex: number;
    lastGeneratedAt: number;
}

export interface AutoIllustrationRuntime {
    char: CharacterProfile;
    apiConfig: APIConfig;
    contextMsgs: Message[];
    normalizedContent: string;
    rawContent: string;
}

export interface NovelAiResolvedConfig {
    apiKey: string;
    model: string;
    resolution: string;
    width: number;
    height: number;
    steps: number;
    cfgScale: number;
    sampler: string;
    seed: number;
    ucPreset: number;
    positivePrompt: string;
    negativePrompt: string;
}
