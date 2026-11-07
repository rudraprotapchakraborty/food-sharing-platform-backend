// Local / traditional hosting entry point. On Vercel the app is served by
// api/index.ts instead, so nothing here runs there.
import app from "./app";
import { connectDB, disconnectDB } from "./config/db";
import { env } from "./config/env";

const start = async () => {
  try {
    await connectDB();
  } catch (err) {
    console.error("MongoDB connection error", err);
    process.exit(1);
  }

  const server = app.listen(env.PORT, () => {
    console.log(`Server running on http://localhost:${env.PORT}`);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
};

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection", reason);
});

start();
