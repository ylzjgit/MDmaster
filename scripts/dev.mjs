import { createServer } from "vite";
import { spawn } from "node:child_process";
import electronPath from "electron";

const server = await createServer({ configFile: "vite.config.ts" });
await server.listen();
const url = server.resolvedUrls?.local?.[0] || "http://localhost:5199/";
server.printUrls();

const env = { ...process.env, MDMaster_DEV_SERVER_URL: url };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ["."], { stdio: "inherit", env });

const shutdown = async (code) => {
  try {
    await server.close();
  } catch {
    /* ignore */
  }
  process.exit(code ?? 0);
};

child.on("exit", (code) => shutdown(code));
process.on("SIGINT", () => {
  child.kill();
  shutdown(0);
});
