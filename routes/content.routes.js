import express from "express";
const router = express.Router();

import {
  createContentController,
  deleteContentController,
  getAllContentController,
  getContentByIdController,
  updateContentController
} from "../controller/content.controller.js";

import { protect } from "../middleware/auth.middleware.js";
import { checkContentAccess } from "../middleware/contentaccess.middleware.js";
import { upload } from "../middleware/upload.middleware.js";
import { queryOptions } from "../constant/globalpagination.js";
import Content from "../models/content.model.js";

router.post("/", protect, upload.single("thumbnail"), createContentController);

router.get("/" ,protect,queryOptions(Content), getAllContentController);

router.get(
  "/:id",
  protect,
  checkContentAccess,
  getContentByIdController
);
router.put(
  "/:id",
  protect,
  upload.single("thumbnail"),
  updateContentController
);
router.delete("/:id", protect, deleteContentController);

export default router;