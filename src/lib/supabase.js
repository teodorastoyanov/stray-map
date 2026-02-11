// src/lib/supabase.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function fileExtFromType(file) {
  const t = file?.type || "";
  if (t === "image/png") return "png";
  if (t === "image/jpeg") return "jpg";
  if (t === "image/webp") return "webp";
  // fallback from filename
  const name = file?.name || "";
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "png";
}

export async function uploadReportPhotos({ reportId, files }) {
  if (!files || files.length === 0) return [];

  // limit to 3 images (или колкото си решила)
  const arr = Array.from(files).slice(0, 3);

  const uploaded = [];

  for (const f of arr) {
    const ext = fileExtFromType(f);
    const objectName = `reports/${reportId}/${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage
      .from("photos")
      .upload(objectName, f, {
        cacheControl: "3600",
        upsert: false,
        contentType: f.type || `image/${ext}`,
      });

    if (error) {
      console.error("Upload error:", error);
      throw error;
    }

    // public URL (за public bucket)
    const { data } = supabase.storage.from("photos").getPublicUrl(objectName);

    uploaded.push({
      path: objectName,
      url: data.publicUrl,
      mime: f.type,
      size: f.size,
    });
  }

  return uploaded;
}
