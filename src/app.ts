import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import routes from "./routes";
import { env } from "./config/env";
import { errorMiddleware, notFoundMiddleware } from "./core/error-middleware";

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(helmet());

const allowedOrigins = env.CLIENT_URL.split(",").map((o) => o.trim());
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow non-browser clients (no Origin header) and whitelisted origins
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Client-Id"],
  })
);

app.use(morgan(env.isProduction ? "combined" : "dev"));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", routes);

app.get("/", (_req, res) => {
  res.send("Food Sharing API running.");
});

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
