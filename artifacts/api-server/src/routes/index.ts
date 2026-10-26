import { Router, type IRouter } from "express";
import healthRouter from "./health";
import universityRouter from "./universities";
import studentRouter from "./student";
import institutionLogosRouter from "./institutionLogos";

const router: IRouter = Router();

router.use(healthRouter);
router.use(institutionLogosRouter);
router.use(universityRouter);
router.use(studentRouter);

export default router;
