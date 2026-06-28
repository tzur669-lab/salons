import { NextResponse } from "next/server";
import { getSalonServer } from "@/lib/server/salon-read";
import { shortAppName } from "@/lib/app-name";

export const dynamic = "force-dynamic";

const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ??
  "https://salonss.vercel.app";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ salonId: string }> }
) {
  const { salonId } = await params;
  const salon = await getSalonServer(salonId);

  if (!salon || salon.status !== "active") {
    return new NextResponse(null, { status: 404 });
  }

  const manifest = {
    name: salon.displayName,
    short_name: shortAppName(salon.displayName),
    description: `קביעת תורים אצל ${salon.displayName}`,
    id: `/${salonId}`,
    start_url: `/${salonId}`,
    scope: `/${salonId}`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#FDFAF7",
    theme_color: "#C9A882",
    lang: "he",
    dir: "rtl",
    icons: [
      {
        src: `${APP_ORIGIN}/icons/icon-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: `${APP_ORIGIN}/icons/icon-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };

  return new NextResponse(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json",
      // 60 s on-device, 5 min at CDN edge — stale-while-revalidate keeps it fast
      // while still propagating a renamed salon within a few minutes.
      "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
    },
  });
}
