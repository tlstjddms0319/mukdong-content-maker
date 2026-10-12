"use client";
import { useMemo,useState } from "react";
import type { InstagramPost } from "@/features/metrics/store";
import { formatCount,shortDate } from "./format";

// 인스타그램 게시물별 현황. 최신순·조회·좋아요·저장 순으로 바꿔 보고, 누르면 인스타그램의 그 게시물이 열린다.
const SORTS=[["recent","최신순"],["views","조회 많은 순"],["likes","좋아요 많은 순"],["saves","저장 많은 순"]] as const;
type SortKey=typeof SORTS[number][0];
const TYPE_LABEL:Record<InstagramPost["type"],string>={IMAGE:"사진",CAROUSEL_ALBUM:"여러 장",VIDEO:"영상"};
const typeOf=(post:InstagramPost)=>post.product==="REELS"?"릴스":TYPE_LABEL[post.type];
const METRICS=[["views","조회"],["reach","도달"],["likes","좋아요"],["comments","댓글"],["saves","저장"],["shares","공유"]] as const;
const PAGE=12;

export function PostBoard({posts}:{posts:InstagramPost[]}){
  const [sort,setSort]=useState<SortKey>("recent");
  const [shown,setShown]=useState(PAGE);
  const sorted=useMemo(()=>[...posts].sort((a,b)=>sort==="recent"?Date.parse(b.timestamp)-Date.parse(a.timestamp):(b[sort]??-1)-(a[sort]??-1)),[posts,sort]);
  if(!posts.length)return <p className="chart-empty">게시물 숫자는 인스타그램 성과를 가져올 수 있게 되면 하루 한 번 쌓여요. 바로 보려면 아래 ‘지금 가져오기’를 눌러 주세요.</p>;
  const maxViews=Math.max(...posts.map(p=>p.views??0),1);
  const topViews=Math.max(...posts.map(p=>p.views??0));
  return <div className="post-board">
    <div className="segmented" role="group" aria-label="게시물 정렬">
      {SORTS.map(([key,label])=><button key={key} type="button" aria-pressed={sort===key} onClick={()=>{setSort(key);setShown(PAGE);}}>{label}</button>)}
    </div>
    <ul className="post-grid">
      {sorted.slice(0,shown).map(post=>{
        const title=post.caption?.split(/\r?\n/).find(line=>line.trim())?.trim()??"(글 없음)";
        return <li key={post.id} className="post-card">
          <a href={post.permalink} target="_blank" rel="noreferrer" className="post-link" aria-label={`${shortDate(post.timestamp)} ${title} 인스타그램에서 보기`}>
            <span className="post-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element -- 인스타그램 CDN 주소는 날마다 바뀌어 next/image 최적화 대상이 아니다 */}
              {post.thumbnail?<img src={post.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer"/>:<span className="post-thumb-empty" aria-hidden="true">📷</span>}
              <span className="post-type">{typeOf(post)}</span>
              {post.views!==undefined&&post.views===topViews&&topViews>0&&<span className="post-top">가장 많이 본</span>}
            </span>
            <span className="post-body">
              <span className="post-date">{shortDate(post.timestamp)}</span>
              <span className="post-title">{title}</span>
            </span>
          </a>
          <span className="post-reach" aria-hidden="true"><span style={{width:`${Math.max(2,(post.views??0)/maxViews*100)}%`}}/></span>
          <dl className="post-metrics">
            {METRICS.map(([key,label])=><div key={key}><dt>{label}</dt><dd>{formatCount(post[key],{compact:true})}</dd></div>)}
          </dl>
        </li>;
      })}
    </ul>
    {shown<sorted.length&&<button type="button" className="button secondary post-more" onClick={()=>setShown(n=>n+PAGE)}>게시물 더 보기 ({sorted.length-shown}개 남음)</button>}
  </div>;
}
