import type { Draft } from "./schema";

// 지난 초안 복제(순수 함수). 반응 좋던 글을 시즌마다 다시 쓰거나, 같은 사진·문안으로 디자인만 바꿔 보려고 쓴다.
// - 주제·설명·이미지·문안은 그대로 가져온다(이미지 파일은 같은 파일을 가리키므로 새로 올리지 않는다).
// - 게시 희망일시·최종 확인·한 달 기획 연결·성과 기록은 원본의 것이므로 비운다(복제본이 원본 날짜에 자동 게시되면 안 된다).
// - 이미지 후보 ID는 새로 만든다. 두 초안이 같은 ID를 공유하면 한쪽에서 고른 이미지가 다른 쪽과 헷갈린다.
export function duplicateDraft(source:Draft,options:{id:string;now:string;newId:()=>string}):Draft {
  const ids=new Map(source.media_candidates.map(media=>[media.id,options.newId()]));
  const mapId=(id:string)=>ids.get(id)??id;
  // 기획 연결과 성과 기록은 원본 게시물의 것이므로 복제하지 않는다.
  const { plan_date: _planDate, performance: _performance, ...rest }=source;
  void _planDate;void _performance;
  return {
    ...rest,
    id:options.id,
    status:"ready",
    media_candidates:source.media_candidates.map(media=>({...media,id:mapId(media.id)})),
    selected_media_id:source.selected_media_id?mapId(source.selected_media_id):null,
    ...(source.selected_media_ids?{selected_media_ids:source.selected_media_ids.map(mapId)}:{}),
    planned_publish_at:null,
    final_review_complete:false,
    archived:false,
    created_at:options.now,
    updated_at:options.now,
  };
}
