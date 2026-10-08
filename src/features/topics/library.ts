export type LibraryTopic = {
  week:number;
  audience:"A"|"B"|"C";
  format:"photo"|"illustration";
  title:string;
  intent:string;
  imageHint:string;
  factCheck:string;
};

export const AUDIENCE_LABELS:Record<LibraryTopic["audience"],string> = {
  A:"음식 탐색형",
  B:"약속 결정형",
  C:"호기심 입문형",
};

export const FORMAT_LABELS:Record<LibraryTopic["format"],string> = {
  photo:"사진",
  illustration:"그림",
};

export const LIBRARY_TOPICS:readonly LibraryTopic[] = [
  { week:1, audience:"A", format:"photo", title:"해산물 좋아해도 홍어는 갈리는 이유", intent:"향과 식감의 취향 차이를 솔직하게 설명하고 실제 메뉴 확인으로 연결해요.", imageHint:"홍어 단면과 결이 보이는 실제 사진을 밝고 가까이 촬영하세요.", factCheck:"향·식감 표현과 사진 속 메뉴가 실제 제공 내용과 맞는지 확인하세요." },
  { week:1, audience:"B", format:"photo", title:"먹골역에서 찾는 퇴근 후 한 상", intent:"약속 장소를 고르는 사람이 위치와 상차림을 한 번에 판단하게 도와요.", imageHint:"실제 내부, 외관, 대표 메뉴 한 상과 위치 안내용 사진을 준비하세요.", factCheck:"주소·영업시간·예약 방법과 현재 매장 모습을 확인하세요." },
  { week:1, audience:"C", format:"illustration", title:"홍어가 톡 쏘는 이유", intent:"발효 음식이 궁금한 사람에게 한 가지 질문을 쉽게 설명해요.", imageHint:"실제 홍어 사진을 참고한 단순한 설명 그림과 짧은 한글 제목을 사용하세요.", factCheck:"발효 설명의 출처와 실제 메뉴 사진 연결 여부를 확인하세요." },
  { week:2, audience:"A", format:"photo", title:"삼합은 왜 세 가지를 같이 먹을까", intent:"홍어·수육·묵은지의 조합을 한 점 만드는 과정으로 보여줘요.", imageHint:"홍어·수육·묵은지를 한 점으로 싸는 손동작을 가까이에서 사진 서너 장으로 찍으세요.", factCheck:"영상 속 재료가 현재 제공되는 실제 구성인지 확인하세요." },
  { week:2, audience:"B", format:"photo", title:"찬바람 불면 생각나는 과메기 한 접시", intent:"겨울 모임 메뉴를 고르는 사람에게 제철 메뉴 과메기를 소개해요.", imageHint:"썰어 담은 실제 과메기 접시를 윤기와 결이 보이게 밝은 곳에서 촬영하세요.", factCheck:"과메기 판매 시기와 함께 나가는 곁들임 구성을 게시 전에 확인하세요." },
  { week:2, audience:"C", format:"photo", title:"첫 홍어 전에 알고 가면 좋은 세 가지", intent:"첫 방문 전에 향·식감·먹는 방법을 미리 알 수 있게 해요.", imageHint:"실제 홍어 질감, 한 점을 만드는 장면, 매장 모습을 순서대로 준비하세요.", factCheck:"누구나 먹기 쉽다는 표현이나 확인되지 않은 삭힘 안내를 넣지 마세요." },
  { week:3, audience:"A", format:"illustration", title:"세계의 향 강한 발효 음식과 홍어", intent:"발효 음식이라는 넓은 관심사에서 홍어로 자연스럽게 이어가요.", imageHint:"비교 대상과 홍어를 단순한 아이콘과 짧은 설명으로 구성하세요.", factCheck:"비교 정보의 출처·확인일을 기록하고 건강 효능은 다루지 마세요." },
  { week:3, audience:"C", format:"photo", title:"사장님이 설명하는 우리 메뉴의 풍미", intent:"사장님이 직접 내는 상차림으로 첫 방문자의 걱정을 덜어 줘요.", imageHint:"얼굴은 안 나와도 돼요. 손으로 상을 내는 모습과 상차림을 사진으로 찍으세요.", factCheck:"원산지·삭힘·구성 등 말로 설명한 내용을 게시 전에 다시 확인하세요." },
  { week:3, audience:"B", format:"photo", title:"비 오는 저녁, 미나리전과 배다리 막걸리", intent:"날씨와 저녁 약속 상황에서 전과 막걸리 조합을 떠올리게 해요.", imageHint:"실제 미나리전 한 장과 사발에 따른 막걸리를 따뜻한 저녁 분위기로 촬영하세요.", factCheck:"사진 속 메뉴가 현재 판매 중인지와 영업시간을 확인하세요." },
  { week:4, audience:"B", format:"illustration", title:"홍어 좋아하는 친구와 갈 때 확인할 것", intent:"동행인 메뉴, 위치, 예약 정보를 저장하기 쉽게 정리해요.", imageHint:"메뉴·위치·전화 확인 항목을 간단한 체크 카드로 만드세요.", factCheck:"동행인용 메뉴와 예약 가능 여부는 가게가 확인한 정보만 사용하세요." },
  { week:4, audience:"A", format:"photo", title:"김이 오르는 홍어애탕 한 그릇", intent:"회로만 알던 홍어를 국물 요리로 보여주고 메뉴 확인으로 연결해요.", imageHint:"김이 오르는 냄비와 그릇에 담는 순간을 밝은 곳에서 사진으로 찍으세요.", factCheck:"들어가는 재료와 맛 설명이 실제 메뉴와 같은지 사장님께 확인하세요." },
  { week:4, audience:"A", format:"photo", title:"홍어무침과 홍어회, 무엇이 다를까", intent:"같은 홍어를 무침과 회로 비교해 회가 아닌 메뉴도 고를 수 있게 해요.", imageHint:"실제 홍어무침과 홍어회를 같은 조명·구도에서 나란히 촬영하세요.", factCheck:"양념 재료와 맛 설명은 사장님이 확인한 내용만 사용하세요." },
];

export function libraryTopicHref(topic:Pick<LibraryTopic,"title"|"audience"|"imageHint">):string {
  return `/?${new URLSearchParams({topic:topic.title,audience:topic.audience,imageBrief:topic.imageHint})}`;
}
