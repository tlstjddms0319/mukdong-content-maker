"use client";
import { useEffect,useRef,useState } from "react";
import { formatCount } from "./format";

// 숫자가 0부터 올라가며 나타난다(화면에 처음 보일 때 한 번). 동작 줄이기를 켰으면 바로 최종 값을 보여 준다.
// 화면 읽기·테스트에는 처음부터 최종 값이 들어 있도록 aria-label을 둔다.
export function CountUp({value,compact,duration=700}:{value:number;compact?:boolean;duration?:number}){
  const [shown,setShown]=useState(value);
  const element=useRef<HTMLSpanElement>(null);
  useEffect(()=>{
    const node=element.current;
    if(!node||typeof IntersectionObserver==="undefined"||window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)return;
    let frame=0;
    const decimals=Number.isInteger(value)?0:1;
    const run=()=>{
      const start=performance.now();
      const step=(now:number)=>{
        const t=Math.min(1,(now-start)/duration),eased=1-(1-t)**3;
        setShown(t>=1?value:Number((value*eased).toFixed(decimals)));
        if(t<1)frame=requestAnimationFrame(step);
      };
      setShown(0);
      frame=requestAnimationFrame(step);
    };
    const observer=new IntersectionObserver(([entry])=>{if(entry.isIntersecting){observer.disconnect();run();}},{threshold:.3});
    observer.observe(node);
    return ()=>{observer.disconnect();cancelAnimationFrame(frame);};
  },[value,duration]);
  return <span ref={element} aria-label={formatCount(value,{compact})}><span aria-hidden="true">{formatCount(shown,{compact})}</span></span>;
}
