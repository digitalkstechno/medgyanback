import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    isSuperAdmin: {
      type: Boolean,
      default: false,
    },
    // userName: {
    //   type: String,
    //   required: [true, "Username is required"],
    //   unique: true,
    //   lowercase: true,
    //   trim: true,
    //   minlength: [3, "Username must be at least 3 characters"],
    // },
    name: {
      type: String,
      trim: true,
      maxlength: [100, "Name too long"],
    },
    contact_no: {
      type: Number,
      min: [1000000000, "Invalid phone number"],
      max: [9999999999, "Invalid phone number"],
    },
    pin: {
      type: String,
      required: [true, "PIN is required"],
      // no length validation to support hashed values
    },
    deviceId: {
      type: String,
      index: true,
      sparse: true,
      unique: true, 
    },
    
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email",
      ],
    },
    device: {
      deviceId: String,
      deviceName: String,
      browser: String,
      os: String,
      deviceType: String,
      userAgent: String,
      token: String,
      lastLogin: Date,
    },

    // ✅ Admin-controlled subscription (no auto-expire)
    subscription: {
      status: {
        type: String,
        enum: ["TRIAL", "ACTIVE", "EXPIRED"],
        default: "TRIAL",
      },
      subscription_plan: {
        type: String,
        // enum: ["TRIAL", "BASIC", "PRO", "PREMIUM"],
        enum: ["TRIAL", "PREMIUM"],
        default: "TRIAL",
      },
      startDate: {
        type: Date,
        default: Date.now,
      },
      expiresAt: Date, // admin sets / extends
      expiryNotified: {
        type: Boolean,
        default: false, // you can flip this from cron/admin when you notify
      },
    },
    Qrthumbnail: [String],

    // ✅ Full audit log – admin actions only
    subscriptionLog: [
      {
        adminId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        adminName: {
          type: String,
          required: true,
          trim: true,
        },
        oldPlan: {
          status: String,
          subscription_plan: String,
          startDate: Date,
          expiresAt: Date,
        },
        newPlan: {
          status: {
            type: String,
            enum: ["TRIAL", "ACTIVE", "EXPIRED"],
          },
          subscription_plan: {
            type: String,
            // enum: ["TRIAL", "BASIC", "PRO", "PREMIUM"],
            enum: ["TRIAL", "PREMIUM"],
          },
          startDate: Date,
          expiresAt: Date,
        },
        accessType: {
          type: String,
          enum: [
            "TRIAL",
            "BASIC",
            "PRO",
            "PREMIUM",
            "Standard Trial (Restricted)",
            "Full Access",
          ],
        },
        notes: {
          type: String,
          maxlength: [500, "Notes too long"],
        },
        action: {
          type: String,
          enum: [
            "CREATED",
            "EXTENDED",
            "UPGRADED",
            "RENEWED",
            "ADMIN_APPROVED",
          ],
          required: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    resetPinToken: {
      type: String,
      default: null,
    },
    resetPin: {
      type: String,
      default: null,
    },
    resetPinExpires: {
      type: Date,
      default: null,
    },

    isBlocked: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes

userSchema.index({ "subscription.expiresAt": 1 });
userSchema.index({ isSuperAdmin: 1 });
userSchema.index({ isBlocked: 1 });
userSchema.index({
  "subscription.status": 1,
  "subscription.subscription_plan": 1,
});
userSchema.index({ deviceId: 1 }, { unique: true, sparse: true });

// Helper virtual (for UI only – does NOT change status)
userSchema.virtual("daysRemaining").get(function () {
  if (!this.subscription?.expiresAt) return 0;
  const now = new Date();
  const expires = new Date(this.subscription.expiresAt);
  const diff = Math.ceil(
    (expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );
  return diff < 0 ? 0 : diff;
});

// ❌ NO pre-save hook for auto-expiry – admin controls status

userSchema.methods.addSubscriptionLog = async function (logData) {
  this.subscriptionLog.unshift({
    adminId: logData.adminId,
    adminName: logData.adminName,
    oldPlan: {
      ...(this.subscription?.toObject?.() || this.subscription || {}),
    },
    newPlan: logData.newPlan,
    accessType: logData.accessType,
    notes: logData.notes,
    action: logData.action,
  });

  if (this.subscriptionLog.length > 100) {
    this.subscriptionLog = this.subscriptionLog.slice(0, 100);
  }
};

export default mongoose.model("User", userSchema);
