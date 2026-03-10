// import jwt from "jsonwebtoken";

// export const protect = async (req, res, next) => {
//   console.log('🔍 PROTECT: Starting auth check');

//   const token = req.headers.authorization?.split(" ")[1];
//   if (!token) {
//     console.log('❌ PROTECT: No token');
//     return res.status(401).json({ message: "No token" });
//   }

//   const decoded = jwt.verify(token, process.env.JWT_SECRET);
//   console.log('✅ PROTECT: Token decoded', { userId: decoded.id });

//   const user = await User.findById(decoded.id);
//   if (!user) {
//     console.log('❌ PROTECT: User not found');
//     return res.status(401).json({ message: "Invalid session" });
//   }
//   console.log('✅ PROTECT: User found', { userId: user._id, isSuperAdmin: user.isSuperAdmin });

//   // 🔐 Simplified Device validation (NOT for super admin)
//   if (!user.isSuperAdmin) {
//     const deviceId = req.headers["x-device-id"];
    
//     if (!deviceId) {
//       console.log('❌ PROTECT: No deviceId header');
//       return res.status(401).json({ message: "Device ID required" });
//     }

//     console.log('✅ PROTECT: Device validated', { deviceId: deviceId.substring(0, 20) + '...' });

//     req.deviceId = deviceId;
//   }

//   req.user = user;
//   req.tenantId = user.tenantId || null; // ✅ Use user.tenantId, not decoded (safer)
  
//   console.log('✅ PROTECT: Auth passed');
//   next();
// };
import jwt from "jsonwebtoken";
// import User from "../models/User.js";

// export const protect = async (req, res, next) => {
//   try {
//     const auth = req.headers.authorization || "";
//     const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

//     if (!token) {
//       return res.status(401).json({ success: false, message: "No token provided" });
//     }

//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     const user = await User.findById(decoded.id).select("isBlocked device isSuperAdmin");

//     if (!user || user.isBlocked) {
//       return res.status(401).json({ success: false, message: "Unauthorized" });
//     }

//     if (!user.isSuperAdmin) {
//       // device lock must exist
//       if (!user.device || !user.device.token) {
//         return res.status(401).json({ success: false, message: "Device not authorized. Contact admin." });
//       }

//       // token must match the saved one
//       if (user.device.token !== token) {
//         return res.status(401).json({
//           success: false,
//           message: "Session invalid or you logged in from another device.",
//         });
//       }
//     }

//     req.user = { id: user._id, isSuperAdmin: user.isSuperAdmin };
//     next();
//   } catch (err) {
//     return res.status(401).json({ success: false, message: "Invalid or expired token" });
//   }
// };
// middleware/auth.middleware.js
import User from "../models/user.model.js";

export const protect = async (req, res, next) => {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // yahan full user lo (kam se kam name, userName, email + flags)
    const user = await User.findById(decoded.id).select(
      "isBlocked device isSuperAdmin name userName email"
    );

    if (!user || user.isBlocked) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized" });
    }

    if (!user.isSuperAdmin) {
      if (!user.device || !user.device.token) {
        return res.status(401).json({
          success: false,
          message: "Device not authorized. Contact admin.",
        });
      }

      if (user.device.token !== token) {
        return res.status(401).json({
          success: false,
          message:
            "Session invalid or you logged in from another device.",
        });
      }
    }

    // yahan POORA user object set kar
    req.user = user;

    console.log(
      "[PROTECT] auth user:",
      user._id.toString(),
      "isSuperAdmin:",
      user.isSuperAdmin
    );

    next();
  } catch (err) {
    console.error("[PROTECT] error:", err.message);
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
};
