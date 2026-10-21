// @vitest-environment node
// 했던 주제·보관함 주제는 다시 추천하지 않기(사장님 요청 2026-10-12).
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendTopicHistory, readTopicHistory, usedTopicTitles } from "@/features/topics/topicHistory";
import { assembleTopics } from "@/features/topics/service";
import type { TopicSuggestion } from "@/features/topics/schema";

let dir="";
const saved={data:process.env.DATA_DIR,url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SECRET_KEY};
beforeEach(async()=>{dir=await mkdtemp(path.join(os.tmpdir(),"topic-history-"));process.env.DATA_DIR=dir;delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SECRET_KEY;});
afterEach(async()=>{process.env.DATA_DIR=saved.data;if(saved.url)process.env.SUPABASE_URL=saved.url;if(saved.key)process.env.SUPABASE_SECRET_KEY=saved.key;await rm(dir,{recursive:true,force:true});});

describe("topic history",()=>{
  it("keeps titles of deleted posts, newest first, without repeats",async()=>{
    expect(await readTopicHistory()).toEqual([]);
    await appendTopicHistory(["홍어는 왜 상하지 않고 삭을까?","  "]);
    await appendTopicHistory(["과메기는 왜 찬바람에 말릴까?","홍어는 왜 상하지 않고 삭을까?"]);
    expect(await readTopicHistory()).toEqual(["과메기는 왜 찬바람에 말릴까?","홍어는 왜 상하지 않고 삭을까?"]);
  });

  it("treats every post, archived ones, and the deleted-post history as used",()=>{
    const drafts=[
      ...Array.from({length:12},(_,i)=>({topic:`최근 주제 ${i}?`,updated_at:`2026-10-${String(12-i).padStart(2,"0")}T00:00:00Z`})),
      {topic:"보관함 주제?",updated_at:"2026-01-01T00:00:00Z",archived:true},
    ];
    const used=usedTopicTitles(drafts,["지운 주제?"],["화면에서 본 주제?"]);
    expect(used[0]).toBe("화면에서 본 주제?");
    expect(used).toEqual(expect.arrayContaining(["보관함 주제?","최근 주제 11?","지운 주제?"]));
    // 보관함 주제는 최근 10개 바로 뒤(프롬프트에 들어가는 앞쪽)에 둔다
    expect(used.indexOf("보관함 주제?")).toBe(11);
    expect(new Set(used).size).toBe(used.length);
  });

  // 사장님 결정(2026-10-21): 했던 주제와 같아도 AI 추천을 거르지 않는다(피할 목록은 프롬프트에 "되도록"으로만).
  it("keeps an AI topic that rewords a used topic (the avoid list is advice, not a filter)",()=>{
    const make=(title:string,id:string):TopicSuggestion=>({id,title,summary:"요소가 암모니아로 분해되며 다른 세균이 자라기 어려워진다는 원리를 설명합니다.",reason:"궁금해요",audience:"A",imageBrief:"홍어회",season:"",trend:""});
    const {topics}=assembleTopics([make("홍어는 왜 상하지 않고 삭을까요?","a"),make("과메기는 왜 냉동실이 아니라 찬바람에 말릴까?","b"),make("같은 홍어인데 왜 찜이 회보다 향이 셀까?","c")],
      {storeName:"묵동홍어마을",round:0,excludeTitles:[],avoidTitles:["홍어는 왜 상하지 않고 삭을까?"]});
    expect(topics.map(topic=>topic.title)).toContain("홍어는 왜 상하지 않고 삭을까요?");
  });
});
