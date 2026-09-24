"use client";
import { useState } from "react";

export function ImageCover({ cover, title, hasSelection }: { cover: string | null; title: string; hasSelection: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!cover || failed) {
    return <div className="image-gallery-cover image-gallery-missing">{hasSelection ? "미리보기 없음" : "이미지 미선택"}</div>;
  }
  return <div className="image-gallery-cover">
    {/* A plain image lets a broken saved URL fall back without requiring an optimizer domain. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={cover} alt={`${title} 선택 이미지 미리보기`} onError={() => setFailed(true)} />
  </div>;
}
