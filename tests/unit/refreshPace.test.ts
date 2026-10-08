// @vitest-environment node
// "다른 주제 보기" 간격: 무료 문안 AI의 분당 한도를 넘지 않게 다음 추천까지 기다릴 초를 계산한다.
import { beforeEach, describe, expect, it } from "vitest";
import { RATE_LIMITED_COOLDOWN_SECONDS, TOPIC_REFRESH_GAP_SECONDS, TOPIC_REFRESH_PER_MINUTE, recordTopicRefresh, resetTopicPace, topicCooldownSeconds, topicRefreshWait } from "@/features/topics/refreshPace";

describe("topic refresh pace", () => {
  beforeEach(()=>resetTopicPace());
  it("lets the first request through and then asks for the gap", () => {
    expect(topicRefreshWait(0)).toBe(0);
    recordTopicRefresh(0);
    expect(topicRefreshWait(1_000)).toBe(TOPIC_REFRESH_GAP_SECONDS-1);
    expect(topicRefreshWait(TOPIC_REFRESH_GAP_SECONDS*1000)).toBe(0);
  });
  it("never sends more than the per-minute budget", () => {
    // 여러 창에서 몰아 누른 경우처럼 1분 안에 한도만큼 이미 보냈으면, 간격이 지났어도 가장 오래된 요청이 1분을 넘길 때까지 기다린다.
    for(let i=0;i<TOPIC_REFRESH_PER_MINUTE;i++)recordTopicRefresh(i*1000);
    const now=(TOPIC_REFRESH_PER_MINUTE-1)*1000+TOPIC_REFRESH_GAP_SECONDS*1000;
    expect(topicRefreshWait(now)).toBe(Math.ceil((60_000-now)/1000));
    expect(topicRefreshWait(60_000+TOPIC_REFRESH_PER_MINUTE*1000)).toBe(0);
  });
  it("rests a full minute after the AI hit its limit", () => {
    recordTopicRefresh(0);
    expect(topicCooldownSeconds(0,{rateLimited:true})).toBe(RATE_LIMITED_COOLDOWN_SECONDS);
    expect(topicCooldownSeconds(0)).toBe(TOPIC_REFRESH_GAP_SECONDS);
  });
});
