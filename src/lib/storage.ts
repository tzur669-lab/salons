import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import imageCompression from "browser-image-compression";
import { storage } from "@/lib/firebase";

// Client-side image guards. The Storage rules also cap at 10 MB and image/* —
// this is the friendlier, cost-saving first line of defense (we compress big
// phone photos down before they ever leave the device).
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
// Sanity ceiling on the RAW pick (pre-compression). Generous on purpose: the
// whole point of compression is to ACCEPT large phone photos and shrink them,
// not to reject them. This only blocks pathological inputs.
const MAX_INPUT_BYTES = 15 * 1024 * 1024;

const COMPRESS_OPTIONS = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
};

/** Throws a Hebrew, user-facing Error if the file isn't an acceptable image. */
export function validateImage(file: File): void {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("ניתן להעלות רק תמונות בפורמט JPG, PNG או WEBP");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("התמונה גדולה מדי (מקסימום 15MB)");
  }
}

/**
 * Compresses an image to ≤ ~1 MB / ≤ 1600 px before upload. Falls back to the
 * original file if compression somehow yields a larger result (already-tiny images).
 */
export async function compressImage(file: File): Promise<File> {
  try {
    const compressed = await imageCompression(file, COMPRESS_OPTIONS);
    return compressed.size < file.size ? compressed : file;
  } catch {
    // If compression fails, fall back to the original (Storage rules still cap size/type).
    return file;
  }
}

/** Validates + compresses, then uploads to the given storage path; returns the URL. */
async function processAndUpload(path: string, file: File): Promise<string> {
  validateImage(file);
  const optimized = await compressImage(file);
  const storageRef = ref(storage, path);
  // Set contentType explicitly so the Storage rule's `contentType.matches('image/.*')`
  // check can never fail on a compressed blob whose type didn't carry through.
  await uploadBytes(storageRef, optimized, {
    contentType: optimized.type || file.type || "image/jpeg",
  });
  return getDownloadURL(storageRef);
}

export async function uploadClinicPhoto(salonId: string, file: File): Promise<string> {
  return processAndUpload(`salons/${salonId}/clinic/home-photo-${Date.now()}`, file);
}

export async function uploadGalleryPhoto(salonId: string, file: File): Promise<string> {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return processAndUpload(`salons/${salonId}/gallery/${unique}`, file);
}
