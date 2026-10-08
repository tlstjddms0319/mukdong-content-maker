"use client";
import { useState } from "react";
import { copyText, saveSlides, type ReviewImage } from "./exportFiles";

// 확인 화면의 큰 버튼 "휴대폰에 저장하기": 글을 복사해 두고, 사진을 순서대로 사진첩에 저장(또는 내려받기)한다.
// 그다음 인스타그램 앱에서 사진을 고르고 글 칸에 붙여 넣으면 된다. 무엇을 했는지 한 줄로 알려 준다.
// 글 복사를 먼저 한다: 공유 창이 열려 있는 동안에는 복사가 막히는 브라우저가 있다.
export function SaveToPhone({images,caption,title,primary=false}:{images:ReviewImage[];caption:string;title:string;primary?:boolean}){
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const save=async()=>{
    setBusy(true);setNotice("");
    try{
      const copied=caption.trim()?await copyText(caption):false;
      const result=await saveSlides(images,title);
      const textNote=copied?" 글도 복사해 뒀어요. 인스타그램 글 칸에 길게 눌러 붙여 넣으세요.":caption.trim()?" 글은 위 칸을 길게 눌러 복사해 주세요.":"";
      if(result==="shared")setNotice(`열린 창에서 '이미지 저장'을 누르면 사진첩에 순서대로 들어가요.${textNote}`);
      else if(result==="downloaded")setNotice(`사진 ${images.length}장을 저장했어요. 이름 순서(01, 02 …)대로 올리면 돼요.${textNote}`);
      else setNotice(copied?"글만 복사해 뒀어요. 사진은 다시 눌러 저장해 주세요.":"");
    }catch{setNotice("저장하지 못했어요. 다시 눌러 주세요.");}
    finally{setBusy(false);}
  };
  return <div className="share-action">
    <button type="button" className={`button big ${primary?"primary":"secondary"} share-button`} disabled={busy||!images.length} onClick={()=>void save()}>{busy?"저장하는 중…":"휴대폰에 저장하기"}</button>
    {notice?<p role="status" className="field-help">{notice}</p>:<p className="field-help">사진을 저장하고 글을 복사해 둬요</p>}
  </div>;
}
