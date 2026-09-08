import express, {
  Request,
  Response,
  NextFunction,
} from "express";
import cors from "cors";
import helmet from "helmet";

import {
  generalLimiter,
} from "./middleware/rate-limit.middleware.js";

import mediaRoutes from "./routes/media.routes.js";

import {
  cleanupOldTempFiles,
} from "./utils/temp-cleanup.utils.js";

import { env } from "./config/env.js";

const app = express();

app.disable("x-powered-by");

app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  })
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (
        env.frontendUrls.includes(origin)
      ) {
        return callback(null, true);
      }

      return callback(
        new Error(
          "Origin is not allowed by SaveFlow."
        )
      );
    },

    methods: [
      "GET",
      "POST",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Accept",
    ],
  })
);

app.use(
  express.json({
    limit: "1mb",
  })
);

app.use(generalLimiter);

app.get(
  "/",
  (
    _req: Request,
    res: Response
  ) => {
    res.json({
      success: true,
      message:
        "SaveFlow API is running",
      environment:
        env.nodeEnv,
    });
  }
);

app.get(
  "/api/health",
  (
    _req: Request,
    res: Response
  ) => {
    res.json({
      success: true,
      status: "healthy",
      timestamp:
        new Date().toISOString(),
    });
  }
);

app.use(
  "/api/media",
  mediaRoutes
);

app.use(
  (
    _req: Request,
    res: Response
  ) => {
    res.status(404).json({
      success: false,
      message:
        "Route not found.",
    });
  }
);

app.use(
  (
    error: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    console.error(
      "Unhandled API error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        env.isProduction
          ? "Something went wrong."
          : error.message,
    });
  }
);

async function startServer() {
  await cleanupOldTempFiles();

  app.listen(
    env.port,
    () => {
      console.log(
        `SaveFlow API running on http://localhost:${env.port}`
      );

      console.log(
        `Environment: ${env.nodeEnv}`
      );
    }
  );
}

startServer().catch(
  (error) => {
    console.error(
      "Unable to start SaveFlow:",
      error
    );

    process.exit(1);
  }
);