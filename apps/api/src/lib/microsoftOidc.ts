import crypto from "crypto";

type JwtHeader = { alg?: string; kid?: string; typ?: string };

function base64UrlToBuffer(input: string) {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + "==".slice((2 - (input.length * 3) % 4) % 4);
  return Buffer.from(b64, "base64");
}

function base64UrlToJson<T = any>(input: string): T {
  const buf = base64UrlToBuffer(input);
  return JSON.parse(buf.toString("utf8"));
}

function certToPem(x5c: string) {
  const lines = x5c.match(/.{1,64}/g) || [x5c];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----\n`;
}

type JwksKey = { kid: string; x5c?: string[] };
type Jwks = { keys: JwksKey[] };

let jwksCache: { fetchedAt: number; jwks: Jwks } | null = null;

async function getMicrosoftJwks(): Promise<Jwks> {
  const now = Date.now();
  // Cache for 6 hours.
  if (jwksCache && now - jwksCache.fetchedAt < 6 * 60 * 60 * 1000) return jwksCache.jwks;

  // "common" works for both organizational and personal accounts.
  const res = await fetch("https://login.microsoftonline.com/common/discovery/v2.0/keys");
  if (!res.ok) throw new Error(`Microsoft JWKS fetch failed (${res.status})`);
  const jwks = (await res.json()) as Jwks;
  jwksCache = { fetchedAt: now, jwks };
  return jwks;
}

function verifyJwtSignature(data: string, signatureB64u: string, certPem: string) {
  const sig = base64UrlToBuffer(signatureB64u);
  const verify = crypto.createVerify("RSA-SHA256");
  verify.update(data);
  verify.end();
  return verify.verify(certPem, sig);
}

/**
 * Verifies a Microsoft v2.0 id_token (RS256) using the public certs from JWKS.
 * We verify signature, audience and time-based claims.
 *
 * NOTE: issuer can vary (tenant-specific) so we intentionally don't hard-fail on issuer.
 */
export async function verifyMicrosoftIdToken(idToken: string, expectedAudience: string) {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");
  const [h, p, s] = parts;

  const header = base64UrlToJson<JwtHeader>(h);
  if (!header.kid) throw new Error("Missing kid");
  if ((header.alg || "").toUpperCase() !== "RS256") throw new Error(`Unsupported alg: ${header.alg}`);

  const payload = base64UrlToJson<any>(p);

  // aud can be string or array
  const aud = payload.aud;
  const audOk = Array.isArray(aud) ? aud.includes(expectedAudience) : aud === expectedAudience;
  if (!audOk) throw new Error("Invalid audience");

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.nbf === "number" && nowSec + 30 < payload.nbf) throw new Error("Token not active yet");
  if (typeof payload.exp === "number" && nowSec - 30 > payload.exp) throw new Error("Token expired");

  const jwks = await getMicrosoftJwks();
  const key = jwks.keys.find((k) => k.kid === header.kid);
  const x5c = key?.x5c?.[0];
  if (!x5c) throw new Error("Signing key not found");

  const pem = certToPem(x5c);
  const data = `${h}.${p}`;
  const ok = verifyJwtSignature(data, s, pem);
  if (!ok) throw new Error("Invalid signature");

  return payload;
}
