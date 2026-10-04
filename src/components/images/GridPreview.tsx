// 인스타그램 프로필 격자 미리보기. 프로필에서는 4:5 게시물이 가운데 3:4로 잘려(좌우가 조금씩 잘림) 보인다.
// 표지(첫 장)를 그 비율로 잘라 보여 줘서, 제목이 잘리지 않는지 올리기 전에 확인하게 한다.
// 카드 그리기 단계에서도 표지 글자가 이 안전 영역 안에 있는지 자동 검수한다(render/audit.ts의 gridSafe).
export function GridPreview({cover}:{cover?:string}) {
  if(!cover)return null;
  return <figure className="grid-preview">
    <div className="grid-preview-cells" aria-hidden="true">
      <span/><span className="grid-preview-cover" style={{backgroundImage:`url(${cover})`}}/><span/>
    </div>
    <figcaption>프로필 격자에서는 표지가 이렇게(3:4) 보여요</figcaption>
  </figure>;
}
