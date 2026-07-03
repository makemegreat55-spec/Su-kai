export {
    DEFAULT_NOVEL_AI_CFG_SCALE,
    DEFAULT_NOVEL_AI_MODEL,
    DEFAULT_NOVEL_AI_NEGATIVE_PROMPT,
    DEFAULT_NOVEL_AI_POSITIVE_PROMPT,
    DEFAULT_NOVEL_AI_RESOLUTION,
    DEFAULT_NOVEL_AI_SAMPLER,
    DEFAULT_NOVEL_AI_SEED,
    DEFAULT_NOVEL_AI_STEPS,
    DEFAULT_NOVEL_AI_UC_PRESET,
    isNovelAiAutoIllustrationReady,
    parseResolution,
    resolveNovelAiConfig,
    stripBearerPrefix,
} from './config';
export {
    buildNovelAiPrompt,
    isPromptGenericOrUnsafe,
    normalizeIllustrationHint,
    scoreVisualMoment,
    selectIllustrationCandidate,
} from './hint';
export {
    buildNovelAiRequestBody,
    generateNovelAiImage,
    getNovelAiEndpointForModel,
    parseNovelAiImageResponse,
    parseNovelAiSseImage,
} from './novelAi';
export { createAutoIllustrationDetector } from './detector';
export type {
    AutoIllustrationCandidate,
    AutoIllustrationRuntime,
    AutoIllustrationState,
    NormalizedIllustrationHint,
    NovelAiResolvedConfig,
    YuanKaiIllustrationHint,
} from './types';
