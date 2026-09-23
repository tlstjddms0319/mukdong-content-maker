import type { Draft } from "./schema";

export function selectedDraftMedia(draft:Draft) {
  const ids=draft.selected_media_ids ?? (draft.selected_media_id?[draft.selected_media_id]:[]);
  return ids.flatMap(id=>{const media=draft.media_candidates.find(candidate=>candidate.id===id);return media?[media]:[];});
}
