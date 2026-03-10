// controller/user.controller.js
import User from "../models/user.model.js";
import {
  createUser,
  getUser,
  getUserbyId,
  updateUser,
  deleteUser,
  delinkUserDeviceService,
  blockUserService,
  unblockUserService,
  bulkUpdateUsers,
  changePassword,
  updateMyProfile,
} from "../service/user.service.js";

// =============== CREATE ===============
// export const CreateUserController = async (req, res) => {
//   try {
//     const data = { ...req.body };

//     if (req.file) {
//       data.Qrthumbnail = req.file.filename;
//     }

//     const user = await createUser(data);
//     return res.status(201).json(user);
//   } catch (error) {
//     return res.status(500).json({ error: error.message });
//   }
// };

export const CreateUserController = async (req, res) => {
  try {
    const data = { ...req.body };

    if (req.file) {
      data.Qrthumbnail = req.file.filename;
    }

    const user = await createUser(data);
    return res.status(201).json(user);
  } catch (error) {
    // unique index violation ka case
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      const msg =
        field === "email"
          ? "Email is already registered"
          : field === "deviceId"
          ? "This device is already registered with another account"
          : "Duplicate value";
      return res.status(400).json({ error: msg });
    }

    return res.status(400).json({ error: error.message });
  }
};


// =============== LIST WITH PAGINATION ===============
export const GetUserController = async (req, res) => {
  try {
    const filter = { isSuperAdmin: false };

    if (req.query.userName) {
      filter.userName = { $regex: req.query.userName, $options: "i" };
    }
    if (req.query.name) {
      filter.name = { $regex: req.query.name, $options: "i" };
    }
    if (req.query.email) {
      filter.email = { $regex: req.query.email, $options: "i" };
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const users = await getUser(req.query);
    const total = await User.countDocuments(filter);

    return res.status(200).json({
      success: true,
      message: "Users retrieved successfully",
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// =============== GET BY ID ===============
export const GetUserControllerByid = async (req, res) => {
  try {
    const user = await getUserbyId(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// =============== UPDATE (ADMIN ONLY) ===============
// export const updateUserController = async (req, res) => {
//   try {
//     const adminUser = req.user;

//     if (!adminUser || !adminUser.isSuperAdmin) {
//       return res.status(403).json({
//         error: "Admin access required",
//       });
//     }

//     const updatedUser = await updateUser(req.params.id, req.body, adminUser);

//     return res.status(200).json({
//       success: true,
//       message: "User updated successfully",
//       data: updatedUser,
//     });
//   } catch (error) {
//     console.error("Update user error:", error);
//     return res.status(500).json({
//       error: error.message || "Update failed",
//     });
//   }
// };


export const updateUserController = async (req, res) => {
  try {
    const adminUser = req.user;
    console.log("[CTRL updateUser] req.user:", adminUser && adminUser._id, "isSuperAdmin:", adminUser && adminUser.isSuperAdmin);

    if (!adminUser || !adminUser.isSuperAdmin) {
      return res.status(403).json({
        error: "Admin access required",
      });
    }

    const updatedUser = await updateUser(req.params.id, req.body, adminUser);

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Update user error:", error);
    return res.status(500).json({
      error: error.message || "Update failed",
    });
  }
};


// =============== UPDATE MY PROFILE (SUPER ADMIN SELF ONLY) ===============
export const updateMyProfileController = async (req, res) => {
  try {
    const authUser = req.user;

    if (!authUser) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const updatedUser = await updateMyProfile(req.params.id, req);

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Update my profile error:", error);
    return res.status(500).json({
      error: error.message || "Profile update failed",
    });
  }
};

// =============== Change Password ===============
export const changeMyPasswordController = async (req, res) => {
  try {
    const authUser = req.user;

    if (!authUser) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { id } = req.params;
    const { pin } = req.body;

    if (!pin || typeof pin !== "string") {
      return res
        .status(400)
        .json({ error: "New password (pin) is required" });
    }

    await changePassword(id, pin);

    return res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (err) {
    console.error("Change password error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Password update failed" });
  }
};

// =============== BULK UPDATE (ADMIN ONLY) ===============
export const bulkUpdateUsersController = async (req, res) => {
  try {
    const adminUser = req.user;

    if (!adminUser?.isSuperAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const userIds = req.body.userIds || [];
    const updateData = req.body.updateData || {};

    if (userIds.length === 0) {
      return res.status(400).json({ error: "No user IDs provided" });
    }

    if (userIds.length > 50) {
      return res.status(400).json({ error: "Max 50 users per bulk update" });
    }

    const results = await bulkUpdateUsers(userIds, updateData, adminUser);

    return res.status(200).json({
      success: true,
      message: `${results.length} users processed`,
      results,
    });
  } catch (error) {
    console.error("Bulk update error:", error);
    return res.status(500).json({ error: error.message });
  }
};

// =============== EXTEND SUBSCRIPTION (ADMIN ONLY) ===============
export const extendSubscriptionController = async (req, res) => {
  try {
    const adminUser = req.user;

    if (!adminUser || !adminUser.isSuperAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const id = req.params.id;
    const body = req.body || {};

    const expiresAt = body.expiresAt;
    const subscription_plan = body.subscription_plan || "TRIAL";
    const notes = body.notes || "";

    if (!expiresAt) {
      return res.status(400).json({ error: "expiresAt is required" });
    }

    const expiresDate = new Date(expiresAt);
    if (isNaN(expiresDate.getTime())) {
      return res
        .status(400)
        .json({ error: "expiresAt must be a valid date" });
    }

    const updateData = {
      subscription: {
        status: "ACTIVE",
        subscription_plan,
        expiresAt: expiresDate,
      },
      subscriptionLog: {
        accessType: subscription_plan,
        notes:
          notes ||
          "Extended by " +
            (adminUser.name || adminUser.userName || "System"),
        action: "EXTENDED",
      },
    };

    const updatedUser = await updateUser(id, updateData, adminUser);

    return res.status(200).json({
      success: true,
      message: "Subscription extended successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Extend subscription error:", error);
    return res.status(500).json({ error: error.message || "Server error" });
  }
};

// =============== DELETE ===============
export const deleteUserController = async (req, res) => {
  try {
    const user = await deleteUser(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// =============== DELINK DEVICE ===============
export const delinkUserDeviceController = async (req, res) => {
  try {
    await delinkUserDeviceService(req.params.id);

    return res.status(200).json({
      success: true,
      message: "Device removed successfully. User can login from new device.",
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// =============== BLOCK / UNBLOCK ===============
export const blockUserController = async (req, res) => {
  try {
    await blockUserService(req.params.id);

    return res.status(200).json({
      success: true,
      message: "User blocked successfully",
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

export const unblockUserController = async (req, res) => {
  try {
    await unblockUserService(req.params.id);

    return res.status(200).json({
      success: true,
      message: "User unblocked successfully",
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};
