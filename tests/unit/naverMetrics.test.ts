import { describe,expect,it } from "vitest";
import { addDays,dateRange,daysInMonth,diffDays,kstToday } from "@/features/metrics/dates";
import { NAVER_SEED,NaverPeriodSchema,dailyAverage,findOverlap,monthEquivalent,newKeywords,youngShare } from "@/features/metrics/naver";

const [aug,sep,oct]=NAVER_SEED;

describe("한국 날짜",()=>{
  it("UTC 15시 이후는 한국 다음 날이다",()=>expect(kstToday(new Date("2026-10-11T15:30:00Z"))).toBe("2026-10-12"));
  it("더하기·범위·일수·차이",()=>{
    expect(addDays("2026-09-30",1)).toBe("2026-10-01");
    expect(dateRange("2026-08-30","2026-09-01")).toEqual(["2026-08-30","2026-08-31","2026-09-01"]);
    expect(daysInMonth("2026-02-10")).toBe(28);
    expect(diffDays("2026-10-01","2026-10-12")).toBe(11);
  });
});

describe("네이버 기간 계산",()=>{
  it("숫자가 있는 날로 하루 평균을 내고 그달 일수로 늘린다",()=>{
    expect(dailyAverage(aug)).toBe(12.4);
    expect(monthEquivalent(aug)).toBe(385);
    expect(dailyAverage(sep)).toBe(14.8);
    expect(monthEquivalent(sep)).toBe(444);
    expect(dailyAverage(oct)).toBe(23.6);
    expect(monthEquivalent(oct)).toBe(733);
  });
  it("20~30대 비율은 성별 비율로 가중한 어림값이다",()=>{
    expect(youngShare(sep)).toBe(41.8);
    expect(youngShare({...sep,gender:undefined})).toBeUndefined();
  });
  it("앞 기간에 없던 키워드를 찾는다",()=>{
    expect(newKeywords(oct,sep)).toEqual(["먹골홍어","묵동홍어집","석계역삼합"]);
    expect(newKeywords(aug)).toEqual([]);
  });
  it("겹치는 기간을 찾되 같은 id는 빼고 본다",()=>{
    expect(findOverlap(NAVER_SEED,{...oct,id:"new",start:"2026-09-30",end:"2026-10-02"})?.id).toBe(sep.id);
    expect(findOverlap(NAVER_SEED,{...oct,end:"2026-10-31"})).toBeUndefined();
  });
  it("비율은 0~100, 키워드는 5개까지, 숫자 있는 날은 기간 일수 이하",()=>{
    expect(NaverPeriodSchema.safeParse({...sep,keywords:[...sep.keywords,{name:"x",percent:1}]}).success).toBe(false);
    expect(NaverPeriodSchema.safeParse({...sep,gender:{male:120,female:-20}}).success).toBe(false);
    expect(NaverPeriodSchema.safeParse({...aug,dataDays:8}).success).toBe(false);
    for(const seed of NAVER_SEED)expect(NaverPeriodSchema.safeParse(seed).success).toBe(true);
  });
});
