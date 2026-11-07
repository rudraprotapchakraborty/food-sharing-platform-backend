import { HydratedDocument } from "mongoose";
import { IUser } from "../../models/User";
import { Food } from "../../models/Food";
import { FoodRequest } from "../../models/FoodRequest";

/**
 * Deletes a user together with everything that points at them: the food they
 * shared, every request about it, and the requests they made themselves.
 * Food that was promised to a deleted requester goes back on the list.
 */
export const deleteUserAndContent = async (user: HydratedDocument<IUser>) => {
  const foodIds = await Food.distinct("_id", { donor: user._id });

  const reserved = await FoodRequest.distinct("food", { requester: user._id, status: "ACCEPTED" });
  if (reserved.length) await Food.updateMany({ _id: { $in: reserved }, status: "requested" }, { $set: { status: "available" } });

  await Promise.all([
    FoodRequest.deleteMany({ $or: [{ requester: user._id }, { donor: user._id }, { food: { $in: foodIds } }] }),
    Food.deleteMany({ donor: user._id }),
  ]);
  await user.deleteOne();
};
