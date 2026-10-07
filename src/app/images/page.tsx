import { WizardShell } from "@/components/wizard/WizardShell";
import { ImageGallery } from "@/components/images/ImageGallery";
import { PhotoLibraryManager } from "@/components/images/PhotoLibraryManager";
import { createDraftRepository } from "@/features/drafts/repository";
import { requireOwnerPage } from "@/features/auth/guard";

export const dynamic = "force-dynamic";

export default async function ImagesPage() {
  await requireOwnerPage();
  const drafts=await createDraftRepository().listDraftSummaries();
  return <WizardShell step="topic" section="images"><ImageGallery drafts={drafts}/><PhotoLibraryManager/></WizardShell>;
}
