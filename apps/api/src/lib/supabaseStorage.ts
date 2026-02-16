type UploadResult =
  | { ok: true; publicUrl: string }
  | { ok: false; message: string };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_LEAGUE_LOGO_BUCKET || "league-logos";

/**
 * Upload a binary object to Supabase Storage.
 * Deploy-safe: if env vars are missing, returns ok:false (does NOT crash the server).
 */
export async function uploadToSupabaseStorage(objectPath: string, mime: string, buf: Buffer): Promise<UploadResult> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return { ok: false, message: "Upload logo non configurato (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY mancanti)." };
  }

  const base = SUPABASE_URL.replace(/\/$/, "");
  const url = `${base}/storage/v1/object/${encodeURIComponent(BUCKET)}/${objectPath}`;

  try {
    const resp = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
        "Content-Type": mime,
        "x-upsert": "true",
        "cache-control": "3600",
      },
      // NOTE (Render/Node 22): depending on the TS lib setup, neither Buffer nor Uint8Array
      // may be considered a valid BodyInit at type-level even though runtime fetch supports it.
      // We intentionally cast here to keep the build green on Render while preserving behavior.
      body: buf as unknown as any,
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      return { ok: false, message: `Errore upload Supabase Storage (${resp.status}): ${txt || resp.statusText}` };
    }

    // Public URL (works when bucket is public; if private, FE should still fall back to placeholder).
    const publicUrl = `${base}/storage/v1/object/public/${encodeURIComponent(BUCKET)}/${objectPath}`;
    return { ok: true, publicUrl };
  } catch (e: any) {
    return { ok: false, message: e?.message || "Errore upload Supabase Storage" };
  }
}
