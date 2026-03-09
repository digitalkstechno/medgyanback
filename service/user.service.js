import User from "../models/user.model.js";
import { hashPassword } from "../utils/password.js";
import {
  getUserSubscriptionStatus,
  getSubscriptionHistorySummary,
  getSubscriptionActionType,
} from "../utils/subscription.js";
import bcrypt from "bcryptjs";

// =============== CREATE ===============
export const createUser = async (data) => {
  data.pin = await hashPassword(data.pin);
  // creation must validate, so keep normal create
  return User.create({ ...data });
};

// =============== LIST WITH FILTERS ===============
// export const getUser = async (queryParams) => {
//   let filter = {};

//   if (queryParams.userName) {
//     filter.userName = {
//       $regex: queryParams.userName,
//       $options: "i",
//     };
//   }

//   if (queryParams.name) {
//     filter.name = {
//       $regex: queryParams.name,
//       $options: "i",
//     };
//   }

//   if (queryParams.email) {
//     filter.email = {
//       $regex: queryParams.email,
//       $options: "i",
//     };
//   }

//   let query = User.find(filter);

//   if (queryParams.page) {
//     const page = parseInt(queryParams.page);
//     const limit = parseInt(queryParams.limit) || 10;
//     const skip = (page - 1) * limit;
//     query = query.skip(skip).limit(limit);
//   }

//   return await query;
// };

export const getUser = async (queryParams) => {
  // base filter: never return super admin
  const filter = { isSuperAdmin: false };

  if (queryParams.userName) {
    filter.userName = { $regex: queryParams.userName, $options: "i" };
  }

  if (queryParams.name) {
    filter.name = { $regex: queryParams.name, $options: "i" };
  }

  if (queryParams.email) {
    filter.email = { $regex: queryParams.email, $options: "i" };
  }

  let query = User.find(filter);

  if (queryParams.page) {
    const page = parseInt(queryParams.page);
    const limit = parseInt(queryParams.limit) || 10;
    const skip = (page - 1) * limit;
    query = query.skip(skip).limit(limit);
  }

  return query;
};


// =============== GET BY ID ===============
export const getUserbyId = async (id) => {
  return User.findById(id);
};

// =============== UPDATE (ADMIN-CONTROLLED SUBSCRIPTION) ===============
export const updateUser = async (id, data, adminUser = null) => {
  const session = await User.startSession();

  try {
    session.startTransaction();

    const user = await User.findById(id).session(session);
    if (!user) {
      throw new Error("User not found");
    }

    if (user.isSuperAdmin) {
      throw new Error("Cannot modify super admin");
    }

    const oldSubscription = { ...(user.subscription || {}) };

    // ---------- BASIC FIELDS ----------
    const allowedUpdates = [
      "name",
      "contact_no",
      "deviceId",
      "device",
      "isBlocked",
      "resetPinToken",
      "resetPin",
      "resetPinExpires",
    ];

    allowedUpdates.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(data, field)) {
        user[field] = data[field];
      }
    });

    // ---------- SUBSCRIPTION GUARD LOGIC (ADMIN-ONLY CONTROL) ----------
    if (data.subscription) {
      const incoming = data.subscription;
      const current = user.subscription || {};
      const now = new Date();

      const currentPlan = current.subscription_plan || "TRIAL";
      const incomingPlan = incoming.subscription_plan || currentPlan;

      const currentStatus = current.status || "TRIAL";
      const currentExpiresAt = current.expiresAt
        ? new Date(current.expiresAt)
        : null;

      const hasActivePaid =
        currentPlan !== "TRIAL" &&
        currentStatus === "ACTIVE" &&
        currentExpiresAt &&
        currentExpiresAt > now;

      const samePlan =
        incomingPlan === currentPlan &&
        String(incoming.startDate || current.startDate || "") ===
          String(current.startDate || "") &&
        String(incoming.expiresAt || current.expiresAt || "") ===
          String(current.expiresAt || "");

      if (!hasActivePaid || !samePlan) {
        user.subscription = {
          ...current,
          ...incoming,
        };

        if (!user.subscription.status) {
          user.subscription.status =
            user.subscription.subscription_plan === "TRIAL"
              ? "TRIAL"
              : "ACTIVE";
        }

        // ---------- LOG ENTRY ----------
        if (adminUser && adminUser._id) {
          const adminNameSafe =
            adminUser.name || adminUser.userName || "System";

          const newPlan = user.subscription.subscription_plan;

          const newSubState = {
            status: user.subscription.status,
            subscription_plan: newPlan,
            startDate: user.subscription.startDate,
            expiresAt: user.subscription.expiresAt,
          };

          const oldSubState = {
            status: oldSubscription.status,
            subscription_plan: oldSubscription.subscription_plan,
            startDate: oldSubscription.startDate,
            expiresAt: oldSubscription.expiresAt,
          };

          const changed =
            oldSubState.status !== newSubState.status ||
            oldSubState.subscription_plan !== newSubState.subscription_plan ||
            String(oldSubState.startDate || "") !==
              String(newSubState.startDate || "") ||
            String(oldSubState.expiresAt || "") !==
              String(newSubState.expiresAt || "");

          if (changed) {
            await user.addSubscriptionLog({
              adminId: adminUser._id,
              adminName: adminNameSafe,
              newPlan: user.subscription,
              accessType: data.subscriptionLog?.accessType || newPlan,
              notes: data.subscriptionLog?.notes || "",
              action:
                data.subscriptionLog?.action ||
                getSubscriptionActionType(oldSubscription, newPlan),
            });
          }
        }
      }
    }

    // ---------- OPTIONAL: manual log-only (no subscription change) ----------
    if (!data.subscription && data.subscriptionLog && adminUser && adminUser._id) {
      const adminNameSafe = adminUser.name || adminUser.userName || "System";

      await user.addSubscriptionLog({
        adminId: adminUser._id,
        adminName: adminNameSafe,
        ...data.subscriptionLog,
        newPlan: user.subscription,
      });
    }

    // Admin flow: keep full validation ON here
    const updatedUser = await user.save({
      session,
      validateBeforeSave: true,
    });

    await session.commitTransaction();
    session.endSession();

    const status = getUserSubscriptionStatus(updatedUser);
    const history = getSubscriptionHistorySummary(updatedUser);

    return {
      ...updatedUser.toObject(),
      subscriptionStatus: status,
      subscriptionHistory: history,
    };
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch {
      // ignore
    } finally {
      session.endSession();
    }
    throw error;
  }
};

// =============== UPDATE MY PROFILE (NO SUBSCRIPTION / NO SUPERADMIN GUARD) ===============
export const updateMyProfile = async (id, req) => {
  const session = await User.startSession();

  try {
    session.startTransaction();

    const user = await User.findById(id).session(session);
    console.log("updateMyProfile id:", id, "user:", user);
    if (!user) {
      throw new Error("User not found");
    }

    const allowedUpdates = ["name", "contact_no", "email"];

    allowedUpdates.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        user[field] = req.body[field];
      }
    });

    // ---------- QR IMAGE HANDLING (SUPER ADMIN ONLY) ----------

    if (user.isSuperAdmin) {
      // 1) Remove ALL QR images
      if (req.body.removeQr === "true") {
        user.Qrthumbnail = [];
      }

      // 2) Remove a PARTICULAR existing QR by filename
      //    Frontend sends: formData.append('removeQrName', filenameToRemove)
      if (req.body.removeQrName) {
        const filenameToRemove = req.body.removeQrName;
        user.Qrthumbnail = (user.Qrthumbnail || []).filter(
          (name) => name !== filenameToRemove
        );
      }

      // 3) Append NEW uploaded files (multiple)
      //    Route uses upload.array("Qrthumbnail", 10)
      if (Array.isArray(req.files) && req.files.length > 0) {
        const newFileNames = req.files.map((f) => f.filename);
        user.Qrthumbnail = [...(user.Qrthumbnail || []), ...newFileNames];
      }

      // NOTE: Do NOT use req.file here; with upload.array you always get req.files
    }

    const updatedUser = await user.save({
      session,
      validateBeforeSave: true,
    });

    await session.commitTransaction();
    session.endSession();

    return updatedUser.toObject();
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch {
      // ignore
    } finally {
      session.endSession();
    }
    throw error;
  }
};


// =============== Change Password ===============
export const changePassword = async (userId, newPin) => {
  const user = await User.findById(userId);
  console.log("🚀 ~ changePassword ~ user:", user);
  if (!user) {
    throw new Error("User not found");
  }

  const hashed = await bcrypt.hash(newPin, 10);
  user.pin = hashed;

  await user.save({ validateBeforeSave: false });
  return user;
};


// =============== BULK UPDATE (ADMIN) ===============
export const bulkUpdateUsers = async (userIds, updateData, adminUser) => {
  const session = await User.startSession();
  try {
    session.startTransaction();

    const results = [];
    for (const id of userIds) {
      try {
        const result = await updateUser(id, updateData, adminUser);
        results.push(result);
      } catch (err) {
        results.push({ id, error: err.message });
      }
    }

    await session.commitTransaction();
    return results;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// =============== DELETE ===============
export const deleteUser = async (id) => {
  return User.findByIdAndDelete(id);
};

// =============== DEVICE DELINK ===============
export const delinkUserDeviceService = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  user.device = undefined;
  user.deviceId = undefined;

  // NON‑SUBSCRIPTION FLOW → disable validation
  await user.save({ validateBeforeSave: false });
  return user;
};

// =============== BLOCK / UNBLOCK ===============
export const blockUserService = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  user.isBlocked = true;
  user.blockedAt = new Date();

  // NON‑SUBSCRIPTION FLOW → disable validation
  await user.save({ validateBeforeSave: false });
  return user;
};

export const unblockUserService = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  user.isBlocked = false;
  user.blockedAt = null;

  // NON‑SUBSCRIPTION FLOW → disable validation
  await user.save({ validateBeforeSave: false });
  return user;
};
