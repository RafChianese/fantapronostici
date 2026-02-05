import { Router } from "express";
import { authRouter } from "./publicAuth.js";
import { publicRouter } from "./publicRoutes.js";
import { meRouter } from "./meRoutes.js";
import { adminRouter } from "./adminRoutes.js";
import { apiFootballAdminRouter } from "./apiFootballAdmin.js";
import { footballDataAdminRouter } from "./footballDataAdmin.js";
import { leaguesRouter } from "./leaguesRoutes.js";
import { superRouter } from "./superRoutes.js";
export const apiRouter = Router();
apiRouter.use("/auth", authRouter);
apiRouter.use("/", publicRouter);
apiRouter.use("/me", meRouter);
apiRouter.use("/leagues", leaguesRouter);
// League admin (scoped by x-league-id / leagueId)
// SuperAdmin (global) API-FOOTBALL endpoints (must come before /admin)
apiRouter.use("/admin", footballDataAdminRouter);
apiRouter.use("/admin", apiFootballAdminRouter);
apiRouter.use("/admin", adminRouter);
// Super admin
apiRouter.use("/super", superRouter);
