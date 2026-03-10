import Content from "../models/content.model.js";

export const createContentService = async (data) => {
  return Content.create(data);
};

export const getAllContentService = async (queryParams) => {
  let filter = {};

  if (queryParams.title) {
    filter.title = {
      $regex: queryParams.title,
      $options: "i",
    };
  }

  if (queryParams.allowedPlans) {
    filter.allowedPlans = {
      $regex: queryParams.allowedPlans,
      $options: "i",
    };
  }

  let query = Content.find(filter)
    .sort({ createdAt: -1 }); // latest first (or use updatedAt)

  if (queryParams.page) {
    const page = parseInt(queryParams.page);
    const limit = parseInt(queryParams.limit) || 10;
    const skip = (page - 1) * limit;
    query = query.skip(skip).limit(limit);
  }

  return await query;
};


export const getContentByIdService = async (id) => {
  return Content.findById(id);
};

export const updateContentService = async (id, data) => {
  return Content.findByIdAndUpdate(id, data, {
    new: true,        // return updated doc
    runValidators: true,
  });
};

export const deleteContentService = async (id) => {
  return Content.findByIdAndDelete(id);
};


