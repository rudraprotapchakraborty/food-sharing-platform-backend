import { Schema, model, Document, Types } from "mongoose";

export const REQUEST_STATUSES = ["PENDING", "ACCEPTED", "DECLINED", "CANCELLED", "COMPLETED"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export interface IFoodRequest extends Document {
  food: Types.ObjectId;
  requester: Types.ObjectId;
  donor: Types.ObjectId;
  message: string;
  status: RequestStatus;
  createdAt: Date;
  updatedAt: Date;
}

const requestSchema = new Schema<IFoodRequest>(
  {
    food: { type: Schema.Types.ObjectId, ref: "Food", required: true },
    requester: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    donor: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    message: { type: String, default: "", trim: true, maxlength: 300 },
    status: { type: String, enum: REQUEST_STATUSES, default: "PENDING" },
  },
  { timestamps: true }
);

// One live request per person per food. A declined or cancelled one can be replaced.
requestSchema.index(
  { food: 1, requester: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["PENDING", "ACCEPTED"] } } }
);
requestSchema.index({ food: 1, status: 1 });

export const FoodRequest = model<IFoodRequest>("FoodRequest", requestSchema);
