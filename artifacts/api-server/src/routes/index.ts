import { Router, type IRouter } from "express";
import healthRouter from "./health";
import universityRouter from "./universities";
import studentRouter from "./student";

const router: IRouter = Router();

router.use(healthRouter);
router.use(universityRouter);
router.use(studentRouter);

export default router;
