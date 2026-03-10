// service/user.service.js
import { sendOnboardEmail } from "../mail/OnboardMail.js";
import User from "../models/user.model.js";
import { hashPassword } from "../utils/password.js";
import {
  getUserSubscriptionStatus,
  getSubscriptionHistorySummary,
  getSubscriptionActionType,
} from "../utils/subscription.js";
import bcrypt from "bcryptjs";

// =============== CREATE ===============
// export const createUser = async (data) => {
//   data.pin = await hashPassword(data.pin);
//   return User.create({ ...data });
// };

export const createUser = async (data) => {
  // email already unique index hai, but nice UX ke liye manual check
  const existingEmail = await User.findOne({ email: data.email });
  if (existingEmail) {
    throw new Error("Email is already registered");
  }

  if (data.deviceId) {
    const existingDevice = await User.findOne({ deviceId: data.deviceId });
    if (existingDevice) {
      throw new Error("This device is already registered with another account");
    }
  }

  data.pin = await hashPassword(data.pin);
  return User.create({ ...data });
};


// =============== LIST WITH FILTERS ===============
export const getUser = async (queryParams) => {
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

  let query = User.find(filter).sort({ createdAt: -1 });

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
export const updateUser = async (id, data, adminUser) => {
  const session = await User.startSession();

  try {
    console.log("[UPDATE_USER] called for id:", id);
    console.log("[UPDATE_USER] admin:", adminUser && adminUser._id);
    console.log("[UPDATE_USER] body.subscription:", data.subscription);

    session.startTransaction();

    const user = await User.findById(id).session(session);
    if (!user) {
      throw new Error("User not found");
    }

    if (user.isSuperAdmin) {
      throw new Error("Cannot modify super admin");
    }

    const oldSubscription = Object.assign({}, user.subscription || {});

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

    // ---------- SUBSCRIPTION GUARD LOGIC ----------
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

      console.log("[UPDATE_USER] hasActivePaid:", hasActivePaid);
      console.log("[UPDATE_USER] samePlan:", samePlan);

      if (!hasActivePaid || !samePlan) {
        user.subscription = Object.assign({}, current, incoming);

        if (!user.subscription.status) {
          user.subscription.status =
            user.subscription.subscription_plan === "TRIAL"
              ? "TRIAL"
              : "ACTIVE";
        }

        // ---------- LOG ENTRY + ONBOARD MAIL ----------
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

          console.log("[UPDATE_USER] subscription changed:", changed);

          if (changed) {
            const accessType =
              data.subscriptionLog && data.subscriptionLog.accessType
                ? data.subscriptionLog.accessType
                : newPlan;

            const notes =
              data.subscriptionLog && data.subscriptionLog.notes
                ? data.subscriptionLog.notes
                : "";

            const action =
              data.subscriptionLog && data.subscriptionLog.action
                ? data.subscriptionLog.action
                : getSubscriptionActionType(oldSubscription, newPlan);

            console.log(
              "[UPDATE_USER] addSubscriptionLog for user:",
              user._id,
              "plan:",
              newPlan,
              "action:",
              action
            );

            await user.addSubscriptionLog({
              adminId: adminUser._id,
              adminName: adminNameSafe,
              newPlan: user.subscription,
              accessType,
              notes,
              action,
            });

            // ✅ onboarding / plan-change email
            try {
              console.log(
                "[UPDATE_USER] calling sendOnboardEmail for:",
                user.email
              );
              await sendOnboardEmail({
                to: user.email,
                name: user.name || user.userName,
                plan: user.subscription.subscription_plan,
                startDate: user.subscription.startDate,
                expiresAt: user.subscription.expiresAt,
              });
            } catch (e) {
              console.error("Onboard email error:", e.message);
            }
          }
        }
      }
    }

    // ---------- OPTIONAL: manual log-only ----------
    if (
      !data.subscription &&
      data.subscriptionLog &&
      adminUser &&
      adminUser._id
    ) {
      const adminNameSafe =
        adminUser.name || adminUser.userName || "System";

      console.log(
        "[UPDATE_USER] manual log-only for user:",
        user._id,
        "action:",
        data.subscriptionLog.action
      );

      await user.addSubscriptionLog(
        Object.assign(
          {
            adminId: adminUser._id,
            adminName: adminNameSafe,
            newPlan: user.subscription,
          },
          data.subscriptionLog
        )
      );
    }

    const updatedUserDoc = await user.save({
      session,
      validateBeforeSave: true,
    });

    await session.commitTransaction();
    session.endSession();

    const status = getUserSubscriptionStatus(updatedUserDoc);
    const history = getSubscriptionHistorySummary(updatedUserDoc);

    return Object.assign({}, updatedUserDoc.toObject(), {
      subscriptionStatus: status,
      subscriptionHistory: history,
    });
  } catch (error) {
    console.error("[UPDATE_USER] error:", error);
    try {
      await session.abortTransaction();
    } catch {
    } finally {
      session.endSession();
    }
    throw error;
  }
};



// =============== UPDATE MY PROFILE (NO SUBSCRIPTION) ===============
export const updateMyProfile = async (id, req) => {
  const session = await User.startSession();

  try {
    session.startTransaction();

    const user = await User.findById(id).session(session);
    if (!user) {
      throw new Error("User not found");
    }

    const allowedUpdates = ["name", "contact_no", "email"];

    allowedUpdates.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        user[field] = req.body[field];
      }
    });

    if (user.isSuperAdmin) {
      if (req.body.removeQr === "true") {
        user.Qrthumbnail = [];
      }

      if (req.body.removeQrName) {
        const filenameToRemove = req.body.removeQrName;
        user.Qrthumbnail = (user.Qrthumbnail || []).filter(
          (name) => name !== filenameToRemove
        );
      }

      if (Array.isArray(req.files) && req.files.length > 0) {
        const newFileNames = req.files.map((f) => f.filename);
        user.Qrthumbnail = [...(user.Qrthumbnail || []), ...newFileNames];
      }
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

  await user.save({ validateBeforeSave: false });
  return user;
};
