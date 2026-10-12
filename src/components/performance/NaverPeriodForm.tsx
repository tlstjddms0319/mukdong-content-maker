"use client";
import { useState,type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { readJsonResponse } from "@/lib/http/readJson";

// 네이버 기록 추가·고치기. 같은 기간 id(예: 2026-10)로 저장하면 그 기록을 고친다.
// 채널·키워드는 한 줄에 "이름 비율" 또는 "이름 횟수 비율", 연령은 "0,19,16,22,32,8,3"(10대~70대).
const lines=(text:string)=>text.split("\n").map(l=>l.trim()).filter(Boolean);
const numbers=(text:string)=>text.split(/[,\s]+/).filter(Boolean).map(Number);
export function NaverPeriodForm(){
  const router=useRouter();
  const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage("");
    const f=new FormData(event.currentTarget),get=(k:string)=>String(f.get(k)??"").trim(),num=(k:string)=>get(k)===""?undefined:Number(get(k));
    const ageMale=numbers(get("ageMale")),ageFemale=numbers(get("ageFemale"));
    const period={id:get("id"),start:get("start"),end:get("end"),dataDays:num("dataDays"),placeVisits:num("placeVisits"),reviews:num("reviews"),blogViews:num("blogViews"),blogVisitors:num("blogVisitors"),
      checkedOn:new Date().toISOString().slice(0,10),peakHours:get("peakHours")||undefined,note:get("note")||undefined,
      channels:lines(get("channels")).map(l=>{const parts=l.split(/\s+/),nums=parts.filter(p=>/^[\d.]+%?$/.test(p)).map(p=>p.replace("%",""));const name=parts.filter(p=>!/^[\d.]+%?$/.test(p)).join(" ");return nums.length===2?{name,count:Number(nums[0]),percent:Number(nums[1])}:{name,percent:Number(nums[0])};}),
      keywords:lines(get("keywords")).map(l=>{const parts=l.split(/\s+/);return {name:parts.slice(0,-1).join(" "),percent:Number(parts.at(-1)!.replace("%",""))};}),
      gender:get("male")?{male:Number(get("male")),female:Number(get("female"))}:undefined,
      ageMale:ageMale.length?ageMale:undefined,ageFemale:ageFemale.length?ageFemale:undefined};
    try{
      const response=await fetch("/api/metrics/naver",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({period})});
      const body=await readJsonResponse(response);
      if(!response.ok)throw new Error(body.error||"저장하지 못했어요.");
      setMessage("저장했어요.");router.refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"저장하지 못했어요.");}
    finally{setBusy(false);}
  }
  return <details className="metric-details"><summary>네이버 기록 추가·고치기</summary>
    <form className="naver-form" onSubmit={save} aria-label="네이버 기록">
      <label>기록 이름(같은 이름이면 고쳐요)<input name="id" required placeholder="2026-10"/></label>
      <label>시작일<input name="start" type="date" required/></label><label>끝일<input name="end" type="date" required/></label>
      <label>숫자가 있는 날<input name="dataDays" type="number" min={1} required/></label>
      <label>플레이스 유입<input name="placeVisits" type="number" min={0} required/></label>
      <label>리뷰 등록<input name="reviews" type="number" min={0}/></label>
      <label>블로그 조회<input name="blogViews" type="number" min={0}/></label><label>블로그 방문자<input name="blogVisitors" type="number" min={0}/></label>
      <label>유입 채널(줄마다 ‘이름 횟수 비율’)<textarea name="channels" rows={3} placeholder={"네이버지도 159 61.15\n네이버검색 100 38.46"}/></label>
      <label>유입 키워드(줄마다 ‘키워드 비율’, 5개까지)<textarea name="keywords" rows={5} placeholder="묵동홍어마을 56.86"/></label>
      <label>남성 %<input name="male" type="number" min={0} max={100} step="0.01"/></label><label>여성 %<input name="female" type="number" min={0} max={100} step="0.01"/></label>
      <label>남성 연령 10~70대 %<input name="ageMale" placeholder="0,19,16,22,32,8,3"/></label><label>여성 연령 10~70대 %<input name="ageFemale" placeholder="0,20,5,32,37,5,1"/></label>
      <label>많이 본 시간대<input name="peakHours" placeholder="18시 (15~19시 높음)"/></label><label>메모<input name="note"/></label>
      <button className="button primary" disabled={busy}>{busy?"저장 중…":"저장"}</button>
      {message&&<p role="status" className="field-help">{message}</p>}
    </form>
  </details>;
}
