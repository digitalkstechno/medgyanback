import mongoose from "mongoose";

const contentSchema = new mongoose.Schema(
{
  title: {
    type: String,
    required: true
  },

  description: String,

  type: {
    type: String,
    enum: ["VIDEO", "PDF", "PPT"],
    required: true
  },

  contentUrl: {
    type: String,
    required: true
  },
  contentId: {
    type: String,
    required: true
  },

  thumbnail: String,

  // category: {
  //   type: mongoose.Schema.Types.ObjectId,
  //   ref: "Category"
  // },

  /* PLAN ACCESS CONTROL */
  allowedPlans: [
    {
      type: String,
      enum: ["TRIAL","BASIC","PRO","PREMIUM"]
    }
  ],

  isFree: {
    type: Boolean,
    default: false
  },

  isPublished: {
    type: Boolean,
    default: false
  }

},
{ timestamps: true }
);

export default mongoose.model("Content", contentSchema);