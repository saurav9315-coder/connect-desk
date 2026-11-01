import { Router } from "express";
import { healthRouter } from "./health.routes";
import { authRouter } from "./auth.routes";
import { groupRouter } from "./group.routes";
import { userRouter } from "./user.routes";

export const apiRouter = Router();

apiRouter.use("/", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/groups", groupRouter);
apiRouter.use("/users", userRouter);
