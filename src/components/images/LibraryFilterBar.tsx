"use client";
import { useId } from "react";
import { LIBRARY_SORT_LABELS, type LibrarySort } from "@/features/images/libraryFilter";

// 사진 보관함 찾기 막대: 검색 칸 + 정렬 + 자주 쓴 검색어 단추. 사진 고르기 창과 보관함 관리 화면이 함께 쓴다.
export function LibraryFilterBar({query,onQuery,sort,onSort,tags,count}:{query:string;onQuery:(value:string)=>void;sort:LibrarySort;onSort:(value:LibrarySort)=>void;tags:string[];count:number}){
  const id=useId();
  return <div className="library-filter">
    <div className="library-filter-row">
      <label htmlFor={`${id}-q`} className="sr-only">사진 찾기</label>
      <input id={`${id}-q`} type="search" placeholder="메뉴 이름·검색어로 찾기 (예: 삼합 수육)" value={query} onChange={event=>onQuery(event.target.value)}/>
      <label htmlFor={`${id}-sort`} className="sr-only">사진 정렬</label>
      <select id={`${id}-sort`} value={sort} onChange={event=>onSort(event.target.value as LibrarySort)}>{(Object.keys(LIBRARY_SORT_LABELS) as LibrarySort[]).map(key=><option key={key} value={key}>{LIBRARY_SORT_LABELS[key]}</option>)}</select>
    </div>
    {tags.length>0&&<div className="library-tags" role="group" aria-label="자주 쓴 검색어">{tags.map(tag=><button key={tag} type="button" className="button secondary" aria-pressed={query.trim()===tag} onClick={()=>onQuery(query.trim()===tag?"":tag)}>{tag}</button>)}</div>}
    <p className="field-help" role="status">{query.trim()?`찾은 사진 ${count}장`:`사진 ${count}장`}</p>
  </div>;
}
