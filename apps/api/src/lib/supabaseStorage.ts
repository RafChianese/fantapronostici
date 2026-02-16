import { z } from "zod";

export const UploadLogoSchema = z.object({
  dataUrl: z.string().min(20),
});

type UploadResult =
  | { ok: true; publicUrl: string }
  | { ok: false; message: string };

/**
 * Minimal (and deploy-safe) helper that uploads an object to Supabase Storage using the REST API.
 * We intentionally avoid adding @supabase/supabase-js as a dependency in the API workspace.
 */
export async function uploadToSupabaseStorage(objectPath: string, mime: string, buf: Buffer): Promise<UploadResult> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_LEAGUE_LOGO_BUCKET || "league-logos";

  if (!url || !serviceKey) {
    return { ok: false, message: "Supabase Storage non configurato (manca SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY)" };
  }

  // PUT /storage/v1/object/<bucket>/<path>
  const putUrl = `${url.replace(/\/$/, "")}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath}`;

  // IMPORTANT: TS in Node 22 can be picky about Buffer as BodyInit depending on lib types.
  // Convert to Uint8Array so it is always accepted by fetch typings.
  const body = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

  const resp = await fetch(putUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": mime,
      "x-upsert": "true",
    },
    body,
  });

  if (!resp.ok) {
    const txt = await safeText(resp);
    return { ok: false, message: `Upload fallito (${resp.status}): ${txt || resp.statusText}` };
  }

  const publicUrl = `${url.replace(/\/$/, "")}/storage/v1/object/public/${encodeURIComponent(bucket)}/${objectPath}`;
  return { ok: true, publicUrl };
}

async function safeText(resp: Response): Promise<string> {
  try {
    return await resp.text();
  } catch {
    return "";
  }
}
