import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";

export type AuthedUser = { id: string; globalRole: "USER" | "SUPER_ADMIN" };
export type AuthedRequest = Request & { user?: AuthedUser };

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ message: "Missing token" });

  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) return res.status(401).json({ message: "Invalid user" });
    req.user = { id: user.id, globalRole: user.globalRole };
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

export function requireSuperAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.globalRole !== "SUPER_ADMIN") return res.status(403).json({ message: "Super admin only" });
  next();
}

function getLeagueId(req: Request): string | null {
  const header = req.headers["x-league-id"];
  if (typeof header === "string" && header.trim()) return header.trim();
  const q = (req.query.leagueId as string | undefined) || undefined;
  if (q && q.trim()) return q.trim();
  return null;
}

export async function requireLeagueAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const leagueId = getLeagueId(req);
  if (!leagueId) return res.status(400).json({ message: "Missing leagueId (header x-league-id or query leagueId)" });

  if (req.user?.globalRole === "SUPER_ADMIN") return next();

  const membership = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId: req.user!.id } },
  });

  if (!membership || membership.status !== "APPROVED" || membership.role !== "ADMIN") {
    return res.status(403).json({ message: "League admin only" });
  }
  next();
}

export async function requireLeagueMember(req: AuthedRequest, res: Response, next: NextFunction) {
  const leagueId = getLeagueId(req);
  if (!leagueId) return res.status(400).json({ message: "Missing leagueId (header x-league-id or query leagueId)" });

  if (req.user?.globalRole === "SUPER_ADMIN") return next();

  const membership = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId: req.user!.id } },
  });

  if (!membership || membership.status !== "APPROVED") {
    return res.status(403).json({ message: "Not a member of this league" });
  }
  next();
}

export function resolveLeagueId(req: Request): string | null {
  return getLeagueId(req);
}
