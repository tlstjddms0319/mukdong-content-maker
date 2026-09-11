// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createInstagramRepository, toPublicConnection } from "@/features/instagram/repository";

const created:string[]=[];
afterEach(async()=>Promise.all(created.splice(0).map(directory=>rm(directory,{recursive:true,force:true}))));

async function temporaryDirectory(){
  const directory=await mkdtemp(path.join(tmpdir(),"mukdong-instagram-"));
  created.push(directory);
  return directory;
}

const connection={
  instagramUserId:"17841400000000000", username:"mukdong", accessToken:"private-token",
  expiresAt:"2026-10-01T00:00:00.000Z",
  scopes:["instagram_business_basic","instagram_business_content_publish"] as ("instagram_business_basic"|"instagram_business_content_publish")[],
  connectedAt:"2026-09-11T00:00:00.000Z", updatedAt:"2026-09-11T00:00:00.000Z",
};

const publication={
  draftId:"11111111-1111-4111-8111-111111111111", status:"published" as const,
  containerId:"container-1", mediaId:"media-1", safeError:null,
  attemptedAt:"2026-09-11T00:00:00.000Z", publishedAt:"2026-09-11T00:01:00.000Z",
};

describe("Instagram repository",()=>{
  it("round-trips a connection without exposing its token in the public view",async()=>{
    const repo=createInstagramRepository(await temporaryDirectory());
    await repo.saveConnection(connection);
    expect(await repo.readConnection()).toEqual(connection);
    expect(toPublicConnection(connection)).toEqual({connected:true,username:"mukdong",expiresAt:connection.expiresAt,needsReconnect:false});
    expect(JSON.stringify(toPublicConnection(connection))).not.toContain(connection.accessToken);
  });

  it("deletes only the saved connection",async()=>{
    const repo=createInstagramRepository(await temporaryDirectory());
    await repo.saveConnection(connection);
    await repo.deleteConnection();
    expect(await repo.readConnection()).toBeNull();
  });

  it("returns an existing successful publication for the same draft",async()=>{
    const repo=createInstagramRepository(await temporaryDirectory());
    await repo.savePublication(publication);
    expect(await repo.readPublication(publication.draftId)).toEqual(publication);
  });
});
