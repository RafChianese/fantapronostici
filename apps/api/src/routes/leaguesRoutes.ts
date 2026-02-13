import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireLeagueAdmin, AuthedRequest } from "../middleware/authMiddleware.js";
import { ensureLeagueConfig } from "../services/ensureLeagueConfig.js";
import { uploadToSupabaseStorage } from "../lib/supabaseStorage.js";

export const leaguesRouter = Router();

const PrizeSchema = z.object({
  position: z.number().int().min(1).max(100),
  amountCents: z.number().int().min(0).max(1_000_000_000),
});

const CreateLeagueSchema = z.object({
  name: z.string().min(2).max(60),
  // Optional monetization (deploy-safe, stored on Rule)
  entryFeeCents: z.number().int().min(0).max(1_000_000_000).optional(),
  prizes: z.array(PrizeSchema).max(50).optional(),
});

const UploadLogoSchema = z.object({
  dataUrl: z.string().min(20),
});

function makeCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function uniqueCode() {
  for (let i = 0; i < 10; i++) {
    const code = makeCode(6);
    const exists = await prisma.league.findUnique({ where: { code } });
    if (!exists) return code;
  }
  // fallback (very unlikely)
  return makeCode(8);
}

leaguesRouter.get("/mine", requireAuth, async (req: AuthedRequest, res) => {
  const memberships = await prisma.leagueMember.findMany({
    where: { userId: req.user!.id },
    include: { league: true },
    orderBy: { createdAt: "desc" },
  });
  return res.json({ memberships });
});

leaguesRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const { name, entryFeeCents, prizes } = CreateLeagueSchema.parse(req.body);
  const code = await uniqueCode();

  let league;
  try {
    league = await prisma.league.create({
      data: {
        name,
        code,
        // Store optional entry fee / prizes on Rule (non-destructive DB change, defaults otherwise)
        rules: { create: { ...(typeof entryFeeCents === "number" ? { entryFeeCents } : {}), ...(prizes ? { prizesJson: prizes } : {}) } },
        settings: { create: { lockUntil: new Date(Date.now() + 7 * 24 * 3600 * 1000) } },
        members: {
          create: {
            userId: req.user!.id,
            role: "ADMIN",
            status: "APPROVED",
          },
        },
      },
      include: { members: true, rules: true, settings: true },
    });
  } catch (e: any) {
    if (e?.code === "P2002") {
      const target = Array.isArray(e?.meta?.target) ? e.meta.target.join(",") : String(e?.meta?.target || "");
      if (target.includes("name")) return res.status(400).json({ message: "Esiste già una lega con questo nome" });
      if (target.includes("code")) return res.status(400).json({ message: "Errore: codice lega duplicato. Riprova." });
    }
    throw e;
  }

  await ensureLeagueConfig(league.id);

  return res.status(201).json({ league });
});

const JoinSchema = z.object({ code: z.string().min(3).max(20) });


leaguesRouter.post("/:leagueId/logo", requireAuth, requireLeagueAdmin, async (req: AuthedRequest, res) => {
  const leagueIdFromParam = req.params.leagueId;
  const leagueId = (req.headers["x-league-id"] as string) || (req.query.leagueId as string) || leagueIdFromParam;
  if (!leagueId || leagueId !== leagueIdFromParam) {
    return res.status(400).json({ message: "leagueId mismatch" });
  }

  const parsed = UploadLogoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Payload non valido", issues: parsed.error.issues });

  // data:[<mime>];base64,<data>
  const dataUrl = parsed.data.dataUrl;
  const m = /^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/i.exec(dataUrl);
  if (!m) return res.status(400).json({ message: "Formato immagine non supportato. Usa PNG/JPG/WebP." });

  const mime = m[1].toLowerCase();
  const b64 = m[3];
  const buf = Buffer.from(b64, "base64");

  // basic size guard (~1.5MB)
  if (buf.length > 1_500_000) return res.status(413).json({ message: "Immagine troppo grande (max ~1.5MB)" });

  const objectPath = `${leagueId}.png`;
  const up = await uploadToSupabaseStorage(objectPath, mime, buf);
  if (!up.ok) return res.status(501).json({ message: up.message });

  return res.json({ ok: true, publicUrl: up.publicUrl });
});


leaguesRouter.post("/join", requireAuth, async (req: AuthedRequest, res) => {
  const { code } = JoinSchema.parse(req.body);
  const league = await prisma.league.findUnique({ where: { code: code.toUpperCase() } });
  if (!league) return res.status(404).json({ message: "Lega non trovata" });

  const existing = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId: league.id, userId: req.user!.id } },
  });
  if (existing) return res.status(400).json({ message: "Sei già associato a questa lega" });

  const member = await prisma.leagueMember.create({
    data: {
      leagueId: league.id,
      userId: req.user!.id,
      role: "MEMBER",
      // Joining via invite code implies immediate approval in that league.
      status: "APPROVED",
    },
  });

  return res.status(201).json({ membership: member, league: { id: league.id, name: league.name, code: league.code } });
});
