// routes/user.routes.js
import express from "express";
import {
  CreateUserController,
  GetUserController,
  GetUserControllerByid,
  updateUserController,
  deleteUserController,
  delinkUserDeviceController,
  blockUserController,
  unblockUserController,
  bulkUpdateUsersController,
  extendSubscriptionController,
  changeMyPasswordController,
  updateMyProfileController,
} from "../controller/user.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { queryOptions } from "../constant/globalpagination.js";
import User from "../models/user.model.js";
import { upload } from "../middleware/upload.middleware.js";

const router = express.Router();

// Public / semi-public routes
router.post("/", CreateUserController);
router.get("/", queryOptions(User), GetUserController);
router.get("/:id", GetUserControllerByid);

// Auth-protected (need token)
router.put("/changepassword/:id", protect, changeMyPasswordController);

// Admin-protected user updates
router.put("/:id", protect, updateUserController);

// Profile update with QR upload (multiple images allowed)
router.put(
  "/profile/:id",
  protect,
  upload.array("Qrthumbnail", 10),
  updateMyProfileController
);

// Bulk updates and subscription
router.patch("/bulk", protect, bulkUpdateUsersController);
router.post("/:id/extend", protect, extendSubscriptionController);

// Other actions
router.delete("/:id", deleteUserController);
router.put("/:id/delink-device", delinkUserDeviceController);
router.put("/:id/block", blockUserController);
router.put("/:id/unblock", unblockUserController);

export default router;
