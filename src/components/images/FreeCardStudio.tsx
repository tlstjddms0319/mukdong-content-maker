"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ASSET_KIND_LABELS, rankAssets, type LibraryAsset, type FreeCard } from "@/features/images/freeCards";
import type { ApprovedImage } from "@/features/images/generationStore";
import { readJsonResponse } from "@/lib/http/readJson";

export function FreeCardStudio({topic,onApprove}:{topic:string;onApprove:(images:ApprovedImage[])=>void}) {
  const [assets,setAssets]=useState<LibraryAsset[]>([]),[loading,setLoading]=useState(true);
  const [title,setTitle]=useState(topic),[body,setBody]=useState(""),[layout,setLayout]=useState<FreeCard["layout"]>("photo");
  const [selection,setSelection]=useState<string[]|null>(null),[preview,setPreview]=useState<FreeCard>(),[cards,setCards]=useState<FreeCard[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [file,setFile]=useState<File>(),[name,setName]=useState(""),[tags,setTags]=useState(""),[kind,setKind]=useState<LibraryAsset["kind"]>("photo"),[credit,setCredit]=useState("직접 촬영");
  const run=useRef(0),uploadInput=useRef<HTMLInputElement>(null);
  const recommended=rankAssets(assets,title),selected=selection??recommended.slice(0,2).map(asset=>asset.id);
  const ordered=[...recommended,...assets.filter(asset=>!recommended.some(item=>item.id===asset.id))];
  const effectiveLayout=layout==="text"||!selected.length?"text":layout==="compare"&&selected.length>=2?"compare":"photo";
  useEffect(()=>{
    let active=true;const requestSequence=run;
    fetch("/api/images/assets").then(async response=>{const data=await readJsonResponse(response);if(!response.ok)throw new Error(data.message);if(active)setAssets(data.assets);})
      .catch(()=>{if(active)setError("사진 보관함을 불러오지 못했어요. 새로고침하거나 글자형 카드를 만들어 주세요.");})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;requestSequence.current++;};
  },[]);
  function invalidate(){run.current++;setPreview(undefined);setError("");setNotice("");}
  async function upload(event:React.FormEvent){
    event.preventDefault();if(!file)return;
    const request=++run.current;setBusy(true);setError("");setPreview(undefined);
    try{
      const form=new FormData();form.append("file",file);form.append("name",name);form.append("tags",tags);form.append("kind",kind);form.append("credit",credit);
      const response=await fetch("/api/images/assets",{method:"POST",body:form}),data=await readJsonResponse(response);
      if(request!==run.current)return;if(!response.ok)throw new Error(data.message);
      setAssets(current=>[data.asset,...current]);setSelection([data.asset.id]);setFile(undefined);setName("");setTags("");
      if(uploadInput.current)uploadInput.current.value="";setNotice("사진을 보관함에 등록했어요. 다음 게시물에서도 사용할 수 있어요.");
    }catch(reason){if(request===run.current)setError(reason instanceof Error?reason.message:"사진을 등록하지 못했어요.");}
    finally{if(request===run.current)setBusy(false);}
  }
  async function compose(){
    const request=++run.current;setBusy(true);setError("");setPreview(undefined);setNotice("");
    try{
      const response=await fetch("/api/images/compose",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title,body,layout,assetIds:layout==="text"?[]:selected})}),data=await readJsonResponse(response);
      if(request!==run.current)return;if(!response.ok)throw new Error(data.message);
      setPreview(data.card);setAssets(current=>current.map(asset=>data.card.assetIds.includes(asset.id)?{...asset,lastUsedAt:new Date().toISOString()}:asset));
      // Freeze the chosen photos while reviewing this preview; ranking may change after use.
      setSelection(selected);
    }catch(reason){if(request===run.current)setError(reason instanceof Error?reason.message:"카드를 만들지 못했어요.");}
    finally{if(request===run.current)setBusy(false);}
  }
  return <div className="free-studio">
    <div className="free-intro"><span className="soft-badge">이미지 생성 비용 0원</span><h3>사진과 질문으로 만드는 음식 이야기</h3><p>보관한 사진에 제목을 얹거나, 글자만으로 카드를 만들어요. AI 이미지 생성은 호출하지 않아요.</p></div>
    <div className="free-workspace"><div className="free-controls">
      <label className="custom-topic"><span>카드 제목</span><textarea rows={2} maxLength={120} value={title} disabled={busy} onChange={event=>{invalidate();setTitle(event.target.value);setSelection(null);}}/></label>
      <label className="custom-topic"><span>짧은 설명 (선택)</span><textarea rows={3} maxLength={effectiveLayout==="text"?180:90} value={body} disabled={busy} placeholder="확인한 음식 정보나 다음 장으로 이어지는 문장을 적어 주세요." onChange={event=>{invalidate();setBody(event.target.value);}}/></label>
      <div className="free-layouts" aria-label="카드 형식">{([["photo","사진형"],["compare","비교형"],["text","글자형"]] as const).map(([value,label])=><button type="button" className={`button ${layout===value?"primary":"secondary"}`} aria-pressed={layout===value} disabled={busy} key={value} onClick={()=>{invalidate();setLayout(value);}}>{label}</button>)}</div>
      <p className="field-help">설명 {body.length}/{effectiveLayout==="text"?180:90}자 · {effectiveLayout==="text"?"사진 없이 질문과 설명을 담은 글자형 카드로 만들어요.":effectiveLayout==="compare"?"선택한 두 사진을 나란히 배치해요.":"선택한 첫 사진을 크게 배치해요."}</p>
      <button type="button" className="button primary" disabled={busy||(loading&&layout!=="text")||!title.trim()||cards.length>=10||body.length>(effectiveLayout==="text"?180:90)} onClick={()=>void compose()}>{busy?"편집하고 있어요…":"카드 미리보기 만들기"}</button>
    </div><div className="free-preview">
      {preview?<><Image src={preview.preview} alt="무료 편집 카드 미리보기" width={1080} height={1350} unoptimized/><p>{preview.source==="ai-edited"?"AI 연출 소재가 포함된 카드예요.":"사진·글꼴·도형을 편집한 카드예요."} 제목과 사진이 잘리지 않았는지 확인해 주세요.</p><button type="button" className="button primary" disabled={busy||cards.length>=10} onClick={()=>{setCards(current=>[...current,preview]);setPreview(undefined);setNotice("카드를 추가했어요. 제목과 형식을 바꾸어 다음 장을 만들 수 있어요.");}}>이 카드 추가</button></>:<div className="free-preview-empty"><span>1080 × 1350</span><strong>질문이 먼저 보이는<br/>한 장을 만들어 보세요.</strong><p>사진이 없어도 시작할 수 있어요.</p></div>}
    </div></div>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <section aria-labelledby="asset-library-title"><div className="section-heading"><div><h3 id="asset-library-title">사진 보관함</h3><p>등록한 검색어로 추천해요. 사용할 사진은 최대 두 장까지 직접 바꿀 수 있어요.</p></div><button type="button" className="button secondary" disabled={busy||loading} onClick={()=>{invalidate();setSelection(null);}}>주제에 맞게 다시 고르기</button></div>
      {loading?<p role="status">사진 보관함을 불러오는 중…</p>:assets.length===0?<p>아직 등록한 사진이 없어요. 글자형 카드는 바로 만들 수 있어요.</p>:<><p className="field-help">{recommended.length?`검색어가 맞는 사진 ${recommended.length}개를 먼저 보여줘요.`:"검색어가 맞는 사진이 없어요. 직접 고르거나 글자형 카드를 사용해 주세요."}</p><div className="asset-grid">{ordered.map(asset=><button key={asset.id} type="button" disabled={busy} aria-pressed={selected.includes(asset.id)} className={`asset-card ${selected.includes(asset.id)?"selected":""}`} onClick={()=>{invalidate();setSelection(selected.includes(asset.id)?selected.filter(id=>id!==asset.id):[...selected.slice(-1),asset.id]);}}><Image src={asset.preview} alt="" width={240} height={180} unoptimized/><strong>{asset.name}</strong><span>{ASSET_KIND_LABELS[asset.kind]}</span><small>{asset.tags.join(" · ")}</small></button>)}</div></>}
      <details className="asset-upload"><summary>보관함에 사진 등록하기</summary><form onSubmit={event=>void upload(event)}><p>사용 가능한 원본을 등록해 주세요. 출처 구분은 카드에도 표시돼요.</p><label className="custom-topic"><span>보관할 사진 파일</span><input ref={uploadInput} type="file" accept="image/jpeg,image/png,image/webp" required disabled={busy} onChange={event=>{setFile(event.target.files?.[0]);setName(event.target.files?.[0]?.name.replace(/\.[^.]+$/,"").slice(0,60)??"");}}/></label><label className="custom-topic"><span>사진 이름</span><input required maxLength={60} value={name} disabled={busy} onChange={event=>setName(event.target.value)}/></label><label className="custom-topic"><span>사진 검색어</span><input required maxLength={250} placeholder="예: 수육, 김치, 삼합" value={tags} disabled={busy} onChange={event=>setTags(event.target.value)}/></label><div className="asset-meta"><label className="custom-topic"><span>사진 구분</span><select value={kind} disabled={busy} onChange={event=>{const next=event.target.value as LibraryAsset["kind"];setKind(next);setCredit(next==="photo"?"직접 촬영":"");}}>{Object.entries(ASSET_KIND_LABELS).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label className="custom-topic"><span>원본 출처</span><input required maxLength={200} value={credit} disabled={busy} placeholder="직접 제작 또는 원본 페이지 주소" onChange={event=>setCredit(event.target.value)}/></label></div><button type="submit" className="button secondary" disabled={busy||!file}>사진 등록</button></form></details>
    </section>
    {cards.length>0&&<section className="free-collection" aria-labelledby="free-collection-title"><h3 id="free-collection-title">게시물에 넣을 카드 · {cards.length}/10장</h3><div className="free-card-list">{cards.map((card,index)=><div key={card.id}><Image src={card.preview} alt={`${index+1}번 카드`} width={216} height={270} unoptimized/><div><span>{index+1}번</span><button type="button" className="button secondary" aria-label={`${index+1}번 카드 앞으로`} disabled={busy||index===0} onClick={()=>setCards(current=>{const next=[...current];[next[index-1],next[index]]=[next[index],next[index-1]];return next;})}>앞으로</button><button type="button" className="button secondary" aria-label={`${index+1}번 카드 제거`} disabled={busy} onClick={()=>setCards(current=>current.filter(item=>item.id!==card.id))}>제거</button></div></div>)}</div><button type="button" className="button primary" disabled={busy} onClick={()=>onApprove(cards.map(card=>({id:card.id,preview:card.preview,source:card.source})))}>카드 {cards.length}장 사용</button></section>}
  </div>;
}
