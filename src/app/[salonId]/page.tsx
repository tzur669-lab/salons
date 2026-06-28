import { getClinicSettingsServer } from "@/lib/server/clinic-read";
import { HomeContent } from "./HomeContent";

// Server component: read clinicSettings once on the server and hand the two
// optional, owner-configured bits (Instagram link + portfolio images) to the
// client body as props. Known at first paint → no pop-in / layout shift.
export default async function SalonHomePage({
  params,
}: {
  params: Promise<{ salonId: string }>;
}) {
  const { salonId } = await params;
  const clinic = await getClinicSettingsServer(salonId);
  return (
    <HomeContent
      instagramUrl={clinic?.instagramUrl ?? ""}
      galleryImages={clinic?.galleryImages ?? []}
    />
  );
}
