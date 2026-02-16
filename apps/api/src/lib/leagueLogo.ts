/**
 * Upload league logo to Supabase Storage.
 *
 * We purposely keep this deploy-safe: no DB columns needed.
 * The frontend reads the public object URL directly.
 */

const DEFAULT_BUCKET = "league-logos";

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer; ext: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("Invalid dataUrl");
  const mime = m[1];
  const b64 = m[2];
  const buffer = Buffer.from(b64, "base64");
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "image/jpeg" ? "jpg" : "png";
  return { mime, buffer, ext };
}

export async function uploadLeagueLogoDataUrl(leagueId: string, dataUrl: string) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const bucket = process.env.SUPABASE_LEAGUE_LOGO_BUCKET || DEFAULT_BUCKET;

  if (!supabaseUrl || !(serviceKey || anonKey)) {
    // In local/dev environments without storage configured, do nothing.
    // This keeps the API functional even if Storage is not set up.
    return;
  }

  const { mime, buffer } = parseDataUrl(dataUrl);

  // Fixed key per league to keep URLs stable.
  const objectPath = `${leagueId}.png`;
  const url = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/${bucket}/${objectPath}`;

  const key = serviceKey || anonKey!;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": mime,
      "x-upsert": "true",
    },
    // TS types on Node 22 fetch can be strict about Buffer/Uint8Array.
    // At runtime fetch supports Buffer just fine.
    body: buffer as unknown as any,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Logo upload failed (${res.status}): ${text || res.statusText}`);
  }
}
