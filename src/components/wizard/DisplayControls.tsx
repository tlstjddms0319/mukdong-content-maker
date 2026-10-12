"use client";
import { useEffect,useState } from "react";

// 맨 위 화면 버튼: '글씨 크게'(큰 화면에서 1.2배)와 밝게/어둡게. 고른 것은 이 기기에 기억한다.
// 처음 그릴 때 깜빡이지 않게 layout.tsx의 DISPLAY_BOOT_SCRIPT가 같은 값을 미리 붙인다.
export const THEME_KEY="mukdong-theme";
export const BIGFONT_KEY="mukdong-bigfont";

const save=(key:string,value:string|null)=>{try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}catch{}};

export function DisplayControls(){
  const [dark,setDark]=useState(false);
  const [big,setBig]=useState(false);
  useEffect(()=>{
    const root=document.documentElement;
    const media=window.matchMedia?.("(prefers-color-scheme: dark)");
    const sync=()=>{setDark(root.dataset.theme?root.dataset.theme==="dark":!!media?.matches);setBig(root.hasAttribute("data-bigfont"));};
    sync();
    media?.addEventListener?.("change",sync);
    return ()=>media?.removeEventListener?.("change",sync);
  },[]);
  const toggleTheme=()=>{const next=dark?"light":"dark";document.documentElement.dataset.theme=next;save(THEME_KEY,next);setDark(!dark);};
  const toggleBig=()=>{const root=document.documentElement;if(big){root.removeAttribute("data-bigfont");save(BIGFONT_KEY,null);}else{root.setAttribute("data-bigfont","");save(BIGFONT_KEY,"1");}setBig(!big);};
  return <div className="display-controls">
    <button type="button" className="button secondary bigfont-toggle" aria-pressed={big} onClick={toggleBig} title={big?"글씨를 보통 크기로":"화면 글씨를 크게"}>
      <span aria-hidden="true" style={{fontWeight:800}}>가</span><span className="control-label">{big?"글씨 보통":"글씨 크게"}</span>
    </button>
    <button type="button" className="button secondary" aria-pressed={dark} onClick={toggleTheme} aria-label={dark?"밝은 화면으로":"어두운 화면으로"} title={dark?"밝은 화면으로":"어두운 화면으로"}>
      <span aria-hidden="true">{dark?"☀":"☾"}</span><span className="control-label">{dark?"밝게":"어둡게"}</span>
    </button>
  </div>;
}
