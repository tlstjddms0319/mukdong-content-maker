// 올리기 전에 큰 사진을 휴대폰(브라우저)에서 줄인다.
// 요즘 휴대폰의 고화소 모드(5천만~2억 화소) 사진은 파일이 크고(10~30MB) 화소 수도 커서, 올리는 데 오래 걸리고
// 서버의 크기 제한(12MB)에 걸리기 쉽다. 카드는 긴 변 2160px까지만 쓰므로, 긴 변 MAX_SIDE를 넘거나 파일이 MAX_BYTES보다 크면
// 회전을 바로잡아(사진 속 방향 정보) 긴 변 MAX_SIDE의 JPEG로 바꿔 보낸다. 작은 사진은 손대지 않는다.
// 브라우저가 이 사진을 못 읽으면(오래된 브라우저 등) 원본을 그대로 보낸다(서버가 다시 확인한다).
export const SHRINK_MAX_SIDE=3200;
export const SHRINK_MAX_BYTES=4*1024*1024;

export async function shrinkPhoto(file:File):Promise<File> {
  if(typeof createImageBitmap!=="function"||typeof document==="undefined")return file;
  let bitmap:ImageBitmap|undefined;
  try{
    bitmap=await createImageBitmap(file,{imageOrientation:"from-image"});
    const longest=Math.max(bitmap.width,bitmap.height);
    if(longest<=SHRINK_MAX_SIDE&&file.size<=SHRINK_MAX_BYTES)return file;
    const scale=Math.min(1,SHRINK_MAX_SIDE/longest);
    const canvas=document.createElement("canvas");
    canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
    const context=canvas.getContext("2d");
    if(!context)return file;
    // 투명한 PNG도 JPEG로 바꾸므로 바탕을 카드 바탕색으로 깐다(검게 나오지 않게).
    context.fillStyle="#f5f1e8";context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",0.9));
    if(!blob)return file;
    return new File([blob],file.name.replace(/\.[a-z0-9]+$/i,"")+".jpg",{type:"image/jpeg",lastModified:file.lastModified});
  }catch{return file;}
  finally{bitmap?.close();}
}
