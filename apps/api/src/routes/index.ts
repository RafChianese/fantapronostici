import { Router } from "express";
import { authRouter } from "./publicAuth.js";
import { publicRouter } from "./publicRoutes.js";
import { meRouter } from "./meRoutes.js";
import { adminRouter } from "./adminRoutes.js";
import { apiFootballAdminRouter } from "./apiFootballAdmin.js";
import { footballDataAdminRouter } from "./footballDataAdmin.js";
import { leaguesRouter } from "./leaguesRoutes.js";
import { leagueRouter } from "./leagueRoutes.js";
import { superRouter } from "./superRoutes.js";
import { pushRouter } from "./pushRoutes.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/", publicRouter);

apiRouter.use("/push", pushRouter);

apiRouter.use("/me", meRouter);
apiRouter.use("/leagues", leaguesRouter);
apiRouter.use("/league", leagueRouter);

// League admin (scoped by x-league-id / leagueId)
// SuperAdmin (global) API-FOOTBALL endpoints (must come before /admin)
// IMPORTANT: provider admin routers MUST NOT apply requireSuperAdmin as a router-level middleware,
// otherwise they'd intercept unrelated /api/admin/* routes (league-admin ones).
// Keep superadmin checks on a per-route basis inside those routers.
apiRouter.use("/admin", footballDataAdminRouter);
apiRouter.use("/admin", apiFootballAdminRouter);
apiRouter.use("/admin", adminRouter);

// Super admin
apiRouter.use("/super", superRouter);
