// Phase 1.1 stubs — every hook throws a clear `Phase 3.2` error so misuse
// before Phase 3.2 lands is visible (not silent undefined). Exposed as the
// `./hooks` MF entry.

export const useAIChat = () => {
  throw new Error('useAIChat: implementation lands in Phase 3.2');
};

export const useAIDraft = () => {
  throw new Error('useAIDraft: implementation lands in Phase 3.2');
};

export const useAISuggest = () => {
  throw new Error('useAISuggest: implementation lands in Phase 3.2');
};

export const useAIClassify = () => {
  throw new Error('useAIClassify: implementation lands in Phase 3.2');
};

export const useRagSearch = () => {
  throw new Error('useRagSearch: implementation lands in Phase 3.2');
};

export default {
  useAIChat,
  useAIDraft,
  useAISuggest,
  useAIClassify,
  useRagSearch,
};
