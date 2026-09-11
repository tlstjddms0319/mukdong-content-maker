export function PostPreview({ caption, imageUrl }: { caption:string; imageUrl?:string }) {
  const style = imageUrl ? { backgroundImage:`url(${imageUrl})` } : undefined;
  return <div className="preview-grid"><div><div className="post-image" style={style}><span>선택한 이미지</span></div><div className="feed-preview"><div className="feed-thumb" style={style}/><div><strong>피드에서 이렇게 보여요</strong><p>{caption.slice(0,32)}{caption.length>32?"…":""}</p></div></div></div><div className="caption-preview"><p className="eyebrow">게시물 문안</p><p className="preserved-caption">{caption}</p><div className="source-note">AI로 만든 이미지입니다 · 원본 보존됨</div></div></div>;
}
