import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import electronPath from "electron";

if (!existsSync("dist/index.html")) {
  console.error("未找到 dist/index.html，请先执行 npm run build");
  process.exit(1);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ["."], { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
