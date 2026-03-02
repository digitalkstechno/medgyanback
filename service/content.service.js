import Content from "../models/content.model.js";

export const createContentService = async (data) => {
  return Content.create(data);
};

export const getAllContentService = async (queryParams) => {
  let filter = {};

  // 🔎 Search by title
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

  let query = Content.find(filter);

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
