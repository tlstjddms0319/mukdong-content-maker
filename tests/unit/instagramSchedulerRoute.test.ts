// @vitest-environment node
import { afterEach,describe,expect,it,vi } from "vitest";

const ownerApiError=vi.hoisted(()=>vi.fn());
const runScheduledPublishing=vi.hoisted(()=>vi.fn());
vi.mock("@/features/auth/guard",()=>({ownerApiError}));
vi.mock("@/features/instagram/schedulerRuntime",()=>({
  runScheduledPublishing,
  isAutoPublishEnabled:()=>process.env.INSTAGRAM_AUTOPUBLISH!=="off",
  SchedulerConfigurationError:class SchedulerConfigurationError extends Error{},
}));
vi.mock("server-only",()=>({}));

import { POST } from "@/app/api/instagram/scheduler/route";

const call=(headers:Record<string,string>={})=>POST(new Request("http://localhost/api/instagram/scheduler",{method:"POST",headers}));

describe("scheduler trigger route",()=>{
  afterEach(()=>{vi.unstubAllEnvs();ownerApiError.mockReset();runScheduledPublishing.mockReset();});

  it("rejects callers without the secret or an owner session",async()=>{
    vi.stubEnv("INSTAGRAM_SCHEDULER_SECRET","shared-secret");
    ownerApiError.mockResolvedValue(new Response(null,{status:401}));
    expect((await call()).status).toBe(401);
    expect((await call({authorization:"Bearer wrong"})).status).toBe(401);
    expect(runScheduledPublishing).not.toHaveBeenCalled();
  });

  it("runs the scheduler for the cron secret and reports the run",async()=>{
    vi.stubEnv("INSTAGRAM_SCHEDULER_SECRET","shared-secret");
    ownerApiError.mockResolvedValue(new Response(null,{status:401}));
    runScheduledPublishing.mockResolvedValue({checkedAt:"2026-09-11T00:00:00.000Z",tokenRefreshed:false,due:["a"],published:[],skipped:[],failed:[]});
    const response=await call({authorization:"Bearer shared-secret"});
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({due:["a"]});
  });

  it("lets the logged-in owner trigger a check and only refreshes the token when auto publishing is off",async()=>{
    ownerApiError.mockResolvedValue(null);
    runScheduledPublishing.mockResolvedValue({checkedAt:"2026-09-11T00:00:00.000Z",tokenRefreshed:false,due:[],published:[],skipped:[],failed:[]});
    expect((await call()).status).toBe(200);
    expect(runScheduledPublishing).toHaveBeenLastCalledWith(expect.any(Function),true);
    vi.stubEnv("INSTAGRAM_AUTOPUBLISH","off");
    expect((await call()).status).toBe(200);
    expect(runScheduledPublishing).toHaveBeenLastCalledWith(expect.any(Function),false);
  });
});
