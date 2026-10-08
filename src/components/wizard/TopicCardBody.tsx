// 추천 주제 카드 속: 위에 "추천 A"와 (고른 카드면) "✓ 선택", 가운데 큰 제목, 맨 아래 한 줄에 짧은 표시(계절·검색 흐름).
// 예전에는 알약 배지 세 개가 위에 쌓여 제목이 아래로 밀리고, "요즘 많이 찾는 말 · 과메기"가 두 줄로 꺾여 읽기 어려웠다.
// 표시는 그림 글자 + 짧은 말로 한 줄에 두고(줄바꿈 없음), 카드 높이가 달라도 표시 줄은 늘 맨 아래에 맞춘다.
const SEASON_ICONS:Record<string,string>={봄:"🌸",여름:"☀️",가을:"🍂",겨울:"❄️"};

export function TopicCardBody({label,title,season,trend,selected}:{label:string;title:string;season?:string;trend?:string;selected:boolean}){
  return <>
    <span className="topic-card-head"><span className="topic-card-label">{label}</span>{selected&&<span className="topic-card-check">✓ 선택</span>}</span>
    <strong className="topic-card-title">{title}</strong>
    {(season||trend)&&<span className="topic-card-tags">
      {/* 계절 이름(가을)이면 그 그림, 행사 이름(김장철·추석)이면 달력 그림. */}
      {season&&<span className="topic-tag topic-tag-season" title="이번 시기에 맞는 주제">{SEASON_ICONS[season]??"📅"} {season}</span>}
      {trend&&<span className="topic-tag topic-tag-trend" title="네이버에서 요즘 검색이 늘어난 말">🔍 요즘 검색 · {trend}</span>}
    </span>}
  </>;
}
