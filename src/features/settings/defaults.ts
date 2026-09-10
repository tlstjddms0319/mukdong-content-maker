export const DEFAULT_SETTINGS = {
  imageMode: "photo-first",
  imageCandidateCount: 3,
  imageAspectRatio: "4:5",
  copyLength: "short",
  aiProvider: "openai",
  aiModelMode: "automatic",
  preserveOriginals: true,
  blockUnverifiedClaims: true,
  recheckOnStoreChange: true,
} as const;
