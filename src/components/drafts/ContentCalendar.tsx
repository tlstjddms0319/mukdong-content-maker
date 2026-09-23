"use client";

import Link from "next/link";
import { useState } from "react";

export type CalendarDraft={id:string;topic:string;date:string;time:string;reviewed:boolean};

export function ContentCalendar({items,initialMonth}:{items:CalendarDraft[];initialMonth:string}){
  const [visibleMonth,setVisibleMonth]=useState(initialMonth);
  const [year,month]=visibleMonth.split("-").map(Number);
  const leadingDays=new Date(Date.UTC(year,month-1,1)).getUTCDay();
  const daysInMonth=new Date(Date.UTC(year,month,0)).getUTCDate();
  const moveMonth=(offset:number)=>{const next=new Date(Date.UTC(year,month-1+offset,1));setVisibleMonth(`${next.getUTCFullYear()}-${String(next.getUTCMonth()+1).padStart(2,"0")}`);};
  return <div className="content-calendar" aria-label="콘텐츠 캘린더">
    <div className="calendar-heading"><button type="button" className="button secondary" aria-label="이전 달" onClick={()=>moveMonth(-1)}>‹</button><h3>{year}년 {month}월</h3><button type="button" className="button secondary" aria-label="다음 달" onClick={()=>moveMonth(1)}>›</button></div>
    <div className="calendar-weekdays" aria-hidden="true">{["일","월","화","수","목","금","토"].map(day=><span key={day}>{day}</span>)}</div>
    <ol className="calendar-grid">
      {Array.from({length:leadingDays},(_,index)=><li className="calendar-blank" aria-hidden="true" key={`blank-${index}`}/>)}
      {Array.from({length:daysInMonth},(_,index)=>{const day=index+1;const date=`${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;const planned=items.filter(item=>item.date===date);return <li key={date}><span className="calendar-day">{day}</span>{planned.map(item=><Link key={item.id} href={`/?draft=${encodeURIComponent(item.id)}`}><strong>{item.topic}</strong><small>{item.time} · {item.reviewed?"확인 완료":"확인 필요"}</small></Link>)}</li>;})}
    </ol>
  </div>;
}
