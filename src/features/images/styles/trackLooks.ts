import { PALETTES, PaletteIdSchema, type Palette, type PaletteId } from "../design";
import { TRACK_SURFACES, type TrackSurface } from "./trackKit";

// 두 갈래(사진 중심·글 중심)의 색 묶음. 예전에는 크림·겨자·밤색 한 벌로 고정이라 어느 주제든 같은 템플릿처럼 보였다
// (사장님 지적 2026-10-09). 이제 구성안의 색 조합(design.palette, 주제로 고른다 — track.ts paletteForTopic)마다
// 밝은 바탕(light)·중간 바탕(mid)·짙은 바탕(dark) 세 벌을 둔다. 레이아웃·글자 크기·로고는 그대로이고 색만 바뀐다.
//   글 중심 : 표지 dark, 본문 장 light → mid → dark 차례, 마지막 장 light.
//   사진 중심: 글 판·마지막 장 light.
// 이름(cream·mustard·brown)은 역할 표시로 남긴다(밝은 바탕에만 종이 결을 깔고, 짙은 바탕에서만 로고 테두리를 쓴다).
// 대비 기준(WCAG): 바탕 위 ink 7:1 이상, dim·accent 4.5:1 이상(tests/unit/trackLooks.test.ts가 확인한다).
export type TrackLook={light:TrackSurface;mid:TrackSurface;dark:TrackSurface};

const look=(light:Omit<TrackSurface,"name">,mid:Omit<TrackSurface,"name">,dark:Omit<TrackSurface,"name">):TrackLook=>
  ({light:{name:"cream",...light},mid:{name:"mustard",...mid},dark:{name:"brown",...dark}});

export const TRACK_LOOKS:Record<PaletteId,TrackLook>={
  // 따뜻한 종이: 예전 그대로(가게 밤색 로고와 같은 색).
  warm:{light:TRACK_SURFACES.cream,mid:TRACK_SURFACES.mustard,dark:TRACK_SURFACES.brown},
  // 바다·비: 옅은 물색 → 하늘색 → 짙은 바다색.
  sea:look(
    {bg:"#EEF3F4",ink:"#15303A",dim:"#3B5560",accent:"#1F5E7A",soft:"#DCE8EC",chip:"#173A4A",chipInk:"#EEF6FA",ring:"#EEF3F4"},
    {bg:"#B9D6E2",ink:"#0E2630",dim:"#22404C",accent:"#7A2E1C",soft:"#A8CAD8",chip:"#173A4A",chipInk:"#EEF6FA",ring:"#EEF3F4"},
    {bg:"#173A4A",ink:"#EEF6FA",dim:"#C9DCE3",accent:"#F2D16B",soft:"#22495B",chip:"#F2D16B",chipInk:"#0E2630",ring:"#EEF3F4"},
  ),
  // 밤·술자리: 미색 → 호박색 → 밤 숯색.
  night:look(
    {bg:"#F3EFE6",ink:"#1D2420",dim:"#474E49",accent:"#9A4E1C",soft:"#E7E0D2",chip:"#1D2420",chipInk:"#F3EFE6",ring:"#F3EFE6"},
    {bg:"#E0A458",ink:"#1A1F1C",dim:"#36291A",accent:"#5A2508",soft:"#D4954A",chip:"#1D2420",chipInk:"#F3EFE6",ring:"#F3EFE6"},
    {bg:"#1D2420",ink:"#F3EFE6",dim:"#C9C3B5",accent:"#E0A458",soft:"#2B332E",chip:"#E0A458",chipInk:"#1D2420",ring:"#F3EFE6"},
  ),
  // 풀·신선: 옅은 연두 → 풀색 → 짙은 숲색.
  herb:look(
    {bg:"#F1F4EC",ink:"#1E2B1C",dim:"#465444",accent:"#3E6A2C",soft:"#E1E9D7",chip:"#24412D",chipInk:"#F1F4EC",ring:"#F1F4EC"},
    {bg:"#BFD7A3",ink:"#152214",dim:"#2A3D26",accent:"#6E2A14",soft:"#AFCB90",chip:"#24412D",chipInk:"#F1F4EC",ring:"#F1F4EC"},
    {bg:"#24412D",ink:"#F1F4EC",dim:"#CFDCC6",accent:"#E8C766",soft:"#2F5038",chip:"#E8C766",chipInk:"#152214",ring:"#F1F4EC"},
  ),
  // 흙·숙성: 옅은 살구 → 테라코타 → 짙은 흙색.
  clay:look(
    {bg:"#F6EEE6",ink:"#2E1F1A",dim:"#5A463E",accent:"#A0461F",soft:"#EDDFD2",chip:"#5A2F22",chipInk:"#F7EFE8",ring:"#F6EEE6"},
    {bg:"#E7B293",ink:"#26140E",dim:"#47291E",accent:"#5E1D0E",soft:"#DCA27F",chip:"#5A2F22",chipInk:"#F7EFE8",ring:"#F6EEE6"},
    {bg:"#5A2F22",ink:"#F7EFE8",dim:"#E6D0C2",accent:"#F0B48A",soft:"#6B3B2C",chip:"#F0B48A",chipInk:"#26140E",ring:"#F6EEE6"},
  ),
  // 자두·묵은지: 옅은 분홍 → 자두 분홍 → 짙은 자두색.
  plum:look(
    {bg:"#F5F0F3",ink:"#2B1E28",dim:"#56464F",accent:"#843563",soft:"#EADFE6",chip:"#4A2440",chipInk:"#F5F0F3",ring:"#F5F0F3"},
    {bg:"#DDBCCD",ink:"#22121D",dim:"#3F2536",accent:"#5A1A40",soft:"#D1AABF",chip:"#4A2440",chipInk:"#F5F0F3",ring:"#F5F0F3"},
    {bg:"#4A2440",ink:"#F5F0F3",dim:"#E2CCD9",accent:"#F0C66A",soft:"#5A2F4F",chip:"#F0C66A",chipInk:"#22121D",ring:"#F5F0F3"},
  ),
};

// 그리기 함수는 색 조합 이름이 아니라 색 값(Palette)을 받으므로, 바탕색으로 어느 조합인지 찾는다. 모르면 따뜻한 종이.
export function trackLookOf(palette?:Pick<Palette,"paper">):TrackLook {
  const id=PaletteIdSchema.options.find(item=>PALETTES[item].colors.paper===palette?.paper);
  return TRACK_LOOKS[id??"warm"];
}
