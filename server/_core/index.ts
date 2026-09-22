import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  /*
   * The port, and why production does not get to choose one.
   *
   * In development the scan below is a convenience: port 3000 is often still held by a previous
   * run, and stepping to 3001 is friendlier than refusing to start.
   *
   * On a host it is a trap. A platform assigns $PORT, routes its traffic there, and health-checks
   * that address. If the probe reports the assigned port busy — a slow release, a sidecar, a race
   * against the probe's own listener — the old code stepped quietly to the next number, logged a
   * line nobody reads, and left a container that had "started successfully" and could not be
   * reached. So production binds exactly what it was given and fails loudly if it cannot.
   */
  const assignedPort = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : NaN;
  const production = process.env.NODE_ENV === "production";

  if (production && !Number.isInteger(assignedPort)) {
    throw new Error("PORT must be set to the port this host expects the server to listen on.");
  }

  const port = production ? assignedPort : await findAvailablePort(Number.isInteger(assignedPort) ? assignedPort : 3000);
  if (!production && Number.isInteger(assignedPort) && port !== assignedPort) {
    console.log(`Port ${assignedPort} is busy, using port ${port} instead`);
  }

  // `0.0.0.0` rather than the default, so a container is reachable from outside itself.
  server.listen(port, "0.0.0.0", () => {
    console.log(`Server listening on port ${port}`);
  });
  server.on("error", (error) => {
    console.error(`Server could not bind port ${port}:`, error);
    process.exit(1);
  });
}

/*
 * A startup failure has to be a failure.
 *
 * `catch(console.error)` printed the reason and then let the process end at exit code 0 — which a
 * host reads as "the program finished successfully", so it neither restarts the container nor
 * reports the deploy as broken. The message scrolls past in a log nobody opens, and the service is
 * simply down with a green tick beside it.
 */
startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
