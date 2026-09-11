"use client";
export function ExportActions() {
  const copy = () => navigator.clipboard?.writeText("처음 만나는 홍어라면, 삼합부터 천천히 즐겨보세요. #묵동맛집");
  return <div className="export-actions"><button type="button" className="button secondary">이미지 받기</button><button type="button" className="button secondary" onClick={copy}>문안 복사</button><button type="button" className="button primary">전체 묶음 받기</button></div>;
}
