import { Schema, model, Document, Types } from "mongoose";

export const CATEGORIES = ["meals", "bakery", "produce", "snacks", "desserts", "other"] as const;
export const FOOD_STATUSES = ["available", "requested", "donated"] as const;
export type Category = (typeof CATEGORIES)[number];
export type FoodStatus = (typeof FOOD_STATUSES)[number];

export interface IFood extends Document {
  name: string;
  category: Category;
  /** how many people it can feed */
  servings: number;
  /** shown publicly: use a public meeting place or an area, not a home address */
  pickupLocation: string;
  expiresAt: Date;
  notes: string;
  image: string;
  status: FoodStatus;
  donor: Types.ObjectId;
  /** Sample listings; shared test accounts may not change these */
  isSeed: boolean;
  source?: string;
  createdAt: Date;
  updatedAt: Date;
}

const foodSchema = new Schema<IFood>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    category: { type: String, enum: CATEGORIES, default: "other" },
    servings: { type: Number, required: true, min: 1, max: 500 },
    pickupLocation: { type: String, required: true, trim: true, minlength: 3, maxlength: 150 },
    expiresAt: { type: Date, required: true },
    notes: { type: String, default: "", trim: true, maxlength: 500 },
    image: { type: String, required: true, trim: true, maxlength: 800 },
    status: { type: String, enum: FOOD_STATUSES, default: "available" },
    donor: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    isSeed: { type: Boolean, default: false },
    source: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

foodSchema.index({ status: 1, expiresAt: 1 });
foodSchema.index({ category: 1, status: 1 });

export const Food = model<IFood>("Food", foodSchema);
