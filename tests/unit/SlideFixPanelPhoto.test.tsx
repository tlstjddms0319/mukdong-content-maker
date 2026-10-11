import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const store=vi.hoisted(()=>({editSlidePhoto:vi.fn(),restoreSlidePhoto:vi.fn(),redoSlide:vi.fn(),reviseSlideText:vi.fn(),setActiveSlide:vi.fn()}));
vi.mock("@/features/images/generationStore",()=>store);
vi.mock("@/components/images/SlideTextEditor",()=>({SlideTextEditor:()=>null}));
import { SlideFixPanel } from "@/components/images/SlideFixPanel";

afterEach(()=>vi.clearAllMocks());
const open=()=>fireEvent.click(screen.getByText("1번 장 고치기"));

it("lets the owner retouch their photo with a request, or draw a new scene from it",()=>{
  render(<SlideFixPanel index={0} pictureKind="photo" photoOptions={{ai:true,swap:false,restore:false}} canEditText={false} headline="" points={[]} busy={false}/>);
  open();
  expect(screen.queryByRole("button",{name:/다른 사진으로 바꾸기/})).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"더 밝고 먹음직스럽게"}));
  fireEvent.click(screen.getByRole("button",{name:"이 사진 다듬기"}));
  expect(store.editSlidePhoto).toHaveBeenCalledWith("retouch",expect.stringContaining("밝"));
  fireEvent.click(screen.getByRole("button",{name:"이 사진으로 새로 그리기"}));
  fireEvent.click(screen.getByRole("button",{name:"이 사진으로 그리기"}));
  expect(store.editSlidePhoto).toHaveBeenLastCalledWith("redraw",undefined);
});

it("offers the free swap and restore buttons when they apply",()=>{
  render(<SlideFixPanel index={0} pictureKind="photo" photoOptions={{ai:true,swap:true,restore:true}} canEditText={false} headline="" points={[]} busy={false}/>);
  open();
  fireEvent.click(screen.getByRole("button",{name:"원래 사진으로 되돌리기 (무료)"}));
  expect(store.restoreSlidePhoto).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"다른 사진으로 바꾸기 (무료)"}));
  expect(store.redoSlide).toHaveBeenCalledWith(undefined);
});

it("hides the picture fixer when a photo slide has nothing to choose",()=>{
  const {container}=render(<SlideFixPanel index={0} pictureKind="photo" photoOptions={{ai:false,swap:false,restore:false}} canEditText={false} headline="" points={[]} busy={false}/>);
  expect(container).toBeEmptyDOMElement();
});
