type ProviderError = { status?:unknown; code?:unknown };

export function classifyOpenAIImageError(error:unknown):{message:string;retryable:boolean} {
  const value=(error && typeof error==="object" ? error : {}) as ProviderError;
  if(value.status===401) return { message:"OpenAI API 키를 확인해 주세요. 직접 사진을 넣어 계속할 수도 있어요.", retryable:false };
  if(value.status===429 && ["credit_balance_exhausted","insufficient_quota","billing_hard_limit_reached"].includes(String(value.code))) {
    return { message:"OpenAI API 크레딧이 부족합니다. 결제 잔액을 확인하거나 직접 사진을 넣어 주세요.", retryable:false };
  }
  return { message:"이미지를 만들지 못했습니다. 기존 작업은 그대로 보관했어요.", retryable:true };
}
