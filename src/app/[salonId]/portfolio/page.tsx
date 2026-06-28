import { redirect } from "next/navigation";
import { getClinicSettingsServer } from "@/lib/server/clinic-read";
import { PortfolioGallery } from "@/components/portfolio/PortfolioGallery";

// Server component: read the gallery on the server. When the salon has no photos
// (never set, or the owner cleared them), redirect to the salon home instead of
// showing a dead empty page — covers bookmarked/old links to an emptied gallery.
export default async function PortfolioPage({
  params,
}: {
  params: Promise<{ salonId: string }>;
}) {
  const { salonId } = await params;
  const clinic = await getClinicSettingsServer(salonId);
  const images = (clinic?.galleryImages ?? []).filter((u) => u && u.trim());
  if (images.length === 0) redirect(`/${salonId}`);
  return <PortfolioGallery images={images} salonName={clinic?.name ?? ""} />;
}
