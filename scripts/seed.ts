/**
 * Fills the Food Sharing database with sample listings and demo accounts.
 *
 *   npm run seed          create / refresh the demo data
 *   npm run seed:clear    remove it again
 *
 * The listings come from scripts/foods.seed.json: the nine original listings of the
 * first version plus more, all with free-licensed photos from Wikipedia. Pickup
 * deadlines are set relative to the moment you run the seed, so everything is current.
 * Only accounts flagged `isDemo` (and the foods and requests that belong to them) are
 * ever touched, so real members are never affected. Safe to run repeatedly.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { connectDB, disconnectDB } from "../src/config/db";
import { env } from "../src/config/env";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../src/config/demo";
import { hashPassword } from "../src/utils/password";
import { User } from "../src/models/User";
import { Food } from "../src/models/Food";
import { FoodRequest } from "../src/models/FoodRequest";

interface SeedFood {
  name: string;
  image: string;
  servings: number;
  category: string;
  pickupLocation: string;
  notes: string;
  expiresInHours: number;
  donor: string;
  source?: string;
}

const listings: SeedFood[] = JSON.parse(readFileSync(join(__dirname, "foods.seed.json"), "utf8"));

const portrait = (g: "men" | "women", n: number) => `https://randomuser.me/api/portraits/${g}/${n}.jpg`;
const hour = 60 * 60 * 1000;

const people = [
  { key: "admin", email: DEMO_ACCOUNTS[0].email, fullName: "Aria Admin", role: "ADMIN" as const, image: portrait("women", 65) },
  { key: "user", email: DEMO_ACCOUNTS[1].email, fullName: "Maya Fernandez", role: "USER" as const, image: portrait("women", 44) },
  { key: "tariq", email: "tariq.rahman@foodshare.demo", fullName: "Tariq Rahman", role: "USER" as const, image: portrait("men", 32) },
  { key: "noah", email: "noah.lindqvist@foodshare.demo", fullName: "Noah Lindqvist", role: "USER" as const, image: portrait("men", 75) },
  // Owns part of the sample listings. Nobody signs in as this account.
  { key: "curator", email: "curator@foodshare.demo", fullName: "Community Kitchen", role: "USER" as const, image: portrait("women", 12) },
];

// Listings the shared accounts own themselves, so they can try editing and removing them
const ownedBy: Record<string, string[]> = {
  user: ["Homemade Cookies", "Chicken Curry", "Falafel Wraps"],
  admin: ["Apple Pie", "Garlic Naan Bread"],
};

const clear = async () => {
  const demo = await User.find({ isDemo: true }).select("_id");
  const ids = demo.map((u) => u._id);
  const foodIds = await Food.distinct("_id", { donor: { $in: ids } });
  const requests = await FoodRequest.deleteMany({ $or: [{ requester: { $in: ids } }, { donor: { $in: ids } }, { food: { $in: foodIds } }] });
  const foods = await Food.deleteMany({ donor: { $in: ids } });
  const users = await User.deleteMany({ isDemo: true });
  console.log(`Removed ${users.deletedCount} demo accounts, ${foods.deletedCount} listings and ${requests.deletedCount} requests.`);
};

const seed = async () => {
  await clear();
  const password = await hashPassword(DEMO_PASSWORD);

  const users: Record<string, InstanceType<typeof User>> = {};
  for (const p of people) {
    users[p.key] = (await User.findOneAndUpdate(
      { email: p.email },
      { $set: { fullName: p.fullName, role: p.role, profileImageUrl: p.image, emailVerified: true, isBlocked: false, isDemo: true, password } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    )) as InstanceType<typeof User>;
  }

  const ownerKeyOf = (f: SeedFood) => Object.keys(ownedBy).find((k) => ownedBy[k].includes(f.name)) ?? f.donor;

  const docs = listings.map((f, i) => {
    const owner = ownerKeyOf(f);
    const own = owner === "user" || owner === "admin";
    return {
      name: f.name,
      category: f.category,
      servings: f.servings,
      pickupLocation: f.pickupLocation,
      notes: f.notes,
      image: f.image,
      source: f.source,
      donor: users[owner]._id,
      isSeed: !own,
      status: "available" as "available" | "requested" | "donated",
      expiresAt: new Date(Date.now() + f.expiresInHours * hour),
      createdAt: new Date(Date.now() - (listings.length - i) * 20 * 60 * 1000),
    };
  });
  const foods = await Food.insertMany(docs);
  const byName = new Map(foods.map((f) => [f.name, f]));
  const get = (name: string) => {
    const f = byName.get(name);
    if (!f) throw new Error(`seed listing missing: ${name}`);
    return f;
  };

  // A few requests so every screen has something to show
  const ask = (food: string, who: string, status: "PENDING" | "ACCEPTED" | "COMPLETED", message: string) => {
    const f = get(food);
    return { food: f._id, requester: users[who]._id, donor: f.donor, status, message };
  };
  const requests = [
    ask("Samosas (24 pieces)", "user", "PENDING", "Could I pick these up after work around 6?"),
    ask("Vegetable Biryani", "user", "ACCEPTED", "Feeding a family of five tonight. Thank you!"),
    ask("Homemade Cookies", "tariq", "PENDING", "These would be perfect for our study group."),
    ask("Homemade Cookies", "noah", "PENDING", "Can I collect them tomorrow morning?"),
    ask("Chicken Curry", "noah", "PENDING", "Is it mild? I can bring my own container."),
    ask("Pasta Salad", "user", "COMPLETED", "Picked this up last week, it was delicious."),
  ];
  await FoodRequest.insertMany(requests);
  await Food.updateOne({ _id: get("Vegetable Biryani")._id }, { $set: { status: "requested" } });
  await Food.updateOne({ _id: get("Pasta Salad")._id }, { $set: { status: "donated" } });

  console.log(`Seeded ${people.length} demo accounts, ${foods.length} listings and ${requests.length} requests into "${env.MONGODB_DB}".`);
  console.log(`Demo password: ${DEMO_PASSWORD}`);
};

(async () => {
  await connectDB();
  if (process.argv[2] === "clear") await clear();
  else await seed();
  await disconnectDB();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
