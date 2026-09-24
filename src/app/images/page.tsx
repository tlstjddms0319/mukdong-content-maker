import { WizardShell } from "@/components/wizard/WizardShell";
import { ImageGallery } from "@/components/images/ImageGallery";
import { createDraftRepository } from "@/features/drafts/repository";
import { requireOwnerPage } from "@/features/auth/guard";

export const dynamic = "force-dynamic";

export default async function ImagesPage() {
  await requireOwnerPage();
  const drafts=await createDraftRepository().listDrafts();
  return <WizardShell step="topic" section="images"><ImageGallery drafts={drafts}/></WizardShell>;
}
