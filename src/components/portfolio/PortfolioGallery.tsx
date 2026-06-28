"use client";
import { useState } from "react";
import Image from "next/image";
import { AppShell } from "@/components/shared/AppShell";

/**
 * Client gallery for the dedicated /[salonId]/portfolio page. Images are read
 * server-side and passed in as props (no fetch → no layout shift). Uses next/image
 * (Firebase Storage host is already whitelisted in next.config.ts) for responsive
 * thumbnails + lazy loading. Tap an image to open a full-screen lightbox.
 */
export function PortfolioGallery({ images, salonName }: { images: string[]; salonName: string }) {
  const [active, setActive] = useState<number | null>(null);

  return (
    <AppShell>
      <div className="pt-6 pb-10 max-w-3xl mx-auto">
        <h1 className="text-2xl font-extrabold mb-6" style={{ color: "var(--foreground)" }}>
          תיק עבודות{salonName ? ` · ${salonName}` : ""}
        </h1>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {images.map((url, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className="relative overflow-hidden active:scale-[0.98] transition-transform"
              style={{ aspectRatio: "1 / 1", borderRadius: 14, background: "var(--accent)" }}
              aria-label={`הגדלת עבודה ${i + 1}`}
            >
              <Image src={url} alt={`עבודה ${i + 1}`} fill sizes="(max-width: 640px) 50vw, 33vw" className="object-cover" />
            </button>
          ))}
        </div>
      </div>

      {active !== null && (
        <div
          onClick={() => setActive(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.85)" }}
          role="dialog"
          aria-modal="true"
        >
          <button
            onClick={() => setActive(null)}
            className="absolute top-4 left-4 w-10 h-10 rounded-full text-white text-xl font-bold flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.15)" }}
            aria-label="סגירה"
          >
            ×
          </button>
          <div
            className="relative w-full"
            style={{ maxWidth: 900, height: "80vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <Image src={images[active]} alt={`עבודה ${active + 1}`} fill sizes="100vw" className="object-contain" />
          </div>
        </div>
      )}
    </AppShell>
  );
}
