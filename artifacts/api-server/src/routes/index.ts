import { Router, type IRouter } from "express";
import healthRouter from "./health";
import universityRouter from "./universities";
import studentRouter from "./student";
import recommendationsRouter from "./recommendations";
import institutionLogosRouter from "./institutionLogos";
import institutionBrandingRouter from "./institutionBranding";
import adminVerificationRouter from "./adminVerification";
import studentJobsRouter from "./studentJobs";
import billingRouter from "./billing";
import budgetRouter from "./budget";

const router: IRouter = Router();

router.use(healthRouter);
router.use(institutionBrandingRouter);
router.use(institutionLogosRouter);
router.use(universityRouter);
router.use(studentRouter);
router.use(recommendationsRouter);
router.use(adminVerificationRouter);
router.use(studentJobsRouter);
router.use(billingRouter);
router.use(budgetRouter);

export default router;
