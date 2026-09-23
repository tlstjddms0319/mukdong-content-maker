export const DEFAULT_SETTINGS = {
  carouselSlideCount: 5,
  imageMode: "photo-first",
  imageCandidateCount: 3,
  imageAspectRatio: "4:5",
  copyLength: "short",
  textAiProvider: "gemini",
  imageAiProvider: "automatic",
  aiModelMode: "automatic",
  preserveOriginals: true,
  blockUnverifiedClaims: true,
  recheckOnStoreChange: true,
} as const;
