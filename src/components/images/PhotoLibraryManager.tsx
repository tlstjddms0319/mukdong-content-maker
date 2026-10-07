"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { ASSET_KIND_LABELS, PHOTO_QUALITY_LABELS, type LibraryAsset } from "@/features/images/freeCards";
import { filterLibrary, popularTags, usageLabel, type LibrarySort } from "@/features/images/libraryFilter";
import { readJsonResponse } from "@/lib/http/readJson";
import { LibraryFilterBar } from "./LibraryFilterBar";

// 사진 품질 배지(계획서 A11). 이름표는 서버와 같은 PHOTO_QUALITY_LABELS를 쓴다.
const QUALITY_LABELS=PHOTO_QUALITY_LABELS;
// 표지로 좋은 사진: 품질을 쟀고 문제 배지가 하나도 없는 사진. 예전 사진(품질 없음)은 모르므로 추천하지 않는다.
const goodCover=(asset:LibraryAsset)=>asset.quality!==null&&asset.quality.flags.length===0;
// 고른 정렬 순서는 그대로 두고, 좋은 사진만 위로 올린다(안정 정렬).
const coverFirst=(assets:LibraryAsset[])=>[...assets].sort((a,b)=>Number(goodCover(b))-Number(goodCover(a)));

function QualityBadges({asset}:{asset:LibraryAsset}){
  if(!asset.quality)return null;
  const flags=asset.quality.flags;
  return <span className="quality-badges" aria-label="사진 상태">
    {flags.length?flags.map(flag=><span key={flag} className="quality-badge">{QUALITY_LABELS[flag]}</span>):<span className="quality-badge good">표지 추천</span>}
  </span>;
}

// 사진 보관함 관리(이미지 제작실). 사진마다 이름·검색어(메뉴 이름 등)를 고치고, 안 쓰는 사진은 보관함에서 뺀다.
// 검색어를 잘 달아 두면 사진 고르기 창에서 "삼합", "수육"처럼 바로 찾을 수 있다.
function AssetCard({asset,onSaved,onRemoved}:{asset:LibraryAsset;onSaved:(asset:LibraryAsset)=>void;onRemoved:(id:string)=>void}){
  const [name,setName]=useState(asset.name);
  const [tags,setTags]=useState(asset.tags.join(", "));
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const changed=name.trim()!==asset.name||tags.split(",").map(tag=>tag.trim()).filter(Boolean).join(",")!==asset.tags.join(",");
  const save=async()=>{
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/images/assets",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:asset.id,name,tags:tags.split(",")})});
      const data=await readJsonResponse(response);
      if(!response.ok)throw new Error(data.message);
      onSaved(data.asset);setMessage("저장했어요.");
    }catch(error){setMessage(error instanceof Error&&error.message?error.message:"저장하지 못했어요.");}
    finally{setBusy(false);}
  };
  const remove=async()=>{
    if(!window.confirm(`"${asset.name}" 사진을 보관함에서 뺄까요? 이미 만든 초안에는 영향이 없어요.`))return;
    setBusy(true);setMessage("");
    try{
      const response=await fetch(`/api/images/assets?id=${encodeURIComponent(asset.id)}`,{method:"DELETE"});
      if(!response.ok)throw new Error((await readJsonResponse(response)).message);
      onRemoved(asset.id);
    }catch(error){setMessage(error instanceof Error&&error.message?error.message:"빼지 못했어요.");setBusy(false);}
  };
  return <li className="library-asset" aria-label={asset.name}>
    <Image src={asset.preview} alt="" width={160} height={160} unoptimized/>
    <div>
      <small>{ASSET_KIND_LABELS[asset.kind]} · {usageLabel(asset)}</small>
      <QualityBadges asset={asset}/>
      <label>이름<input value={name} maxLength={60} disabled={busy} onChange={event=>setName(event.target.value)}/></label>
      <label>검색어 <small>쉼표로 구분</small><input value={tags} disabled={busy} onChange={event=>setTags(event.target.value)}/></label>
      <div className="library-asset-actions">
        <button type="button" className="button primary" disabled={busy||!changed} onClick={()=>void save()}>저장</button>
        <button type="button" className="button secondary" disabled={busy} onClick={()=>void remove()}>보관함에서 빼기</button>
      </div>
      {message&&<p role="status" className="field-help">{message}</p>}
    </div>
  </li>;
}

export function PhotoLibraryManager(){
  const [assets,setAssets]=useState<LibraryAsset[]|null>(null);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [sort,setSort]=useState<LibrarySort>("recent");
  const [coversFirst,setCoversFirst]=useState(false);
  useEffect(()=>{
    let active=true;
    fetch("/api/images/assets",{cache:"no-store"}).then(async response=>{const data=await readJsonResponse(response);if(!response.ok)throw new Error(data.message);if(active)setAssets(data.assets);})
      .catch(caught=>{if(active){setAssets([]);setError(caught instanceof Error&&caught.message?caught.message:"사진 보관함을 불러오지 못했어요.");}});
    return ()=>{active=false;};
  },[]);
  const filtered=assets?filterLibrary(assets,query,sort):[];
  const shown=coversFirst?coverFirst(filtered):filtered;
  return <section className="photo-library-manager" aria-label="사진 보관함 관리">
    <div><h2>사진 보관함</h2><p>올린 사진에 메뉴 이름 같은 검색어를 달아 두면, 사진을 고를 때 바로 찾을 수 있어요.</p></div>
    {error&&<p role="alert">{error}</p>}
    {assets===null?<p role="status">불러오는 중…</p>:!assets.length?<p className="field-help">아직 저장한 사진이 없어요. 새 초안의 이미지 단계에서 사진을 올리면 여기에 모여요.</p>:<>
      <LibraryFilterBar query={query} onQuery={setQuery} sort={sort} onSort={setSort} tags={popularTags(assets)} count={shown.length}/>
      <label className="library-cover-first"><input type="checkbox" checked={coversFirst} onChange={event=>setCoversFirst(event.target.checked)}/>표지로 좋은 사진 먼저 <small>(어둡거나 흔들리지 않은 사진)</small></label>
      <ul className="library-assets">{shown.map(asset=><AssetCard key={asset.id} asset={asset} onSaved={saved=>setAssets(current=>current?.map(item=>item.id===saved.id?saved:item)??null)} onRemoved={id=>setAssets(current=>current?.filter(item=>item.id!==id)??null)}/>)}</ul>
    </>}
  </section>;
}
