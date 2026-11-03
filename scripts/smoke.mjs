import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import electronPath from "electron";

const out = resolve(".smoke/shot.png");
const reportPath = out.replace(/\.png$/, "") + ".json";
const workspace = resolve(".smoke/workspace");
const wait = String(process.env.MDMaster_SMOKE_WAIT || 6000);

if (!existsSync("dist/index.html")) {
  console.error("未找到 dist/index.html，请先执行：npm run build");
  process.exit(1);
}

// 复制一份演示工作区，避免自动保存测试污染 demo/
rmSync(workspace, { recursive: true, force: true });
mkdirSync(workspace, { recursive: true });
cpSync(resolve("demo"), workspace, { recursive: true });

const fileRel = process.env.MDMaster_SMOKE_FILE || "欢迎使用 MDMaster.md";
const smokeFile = join(workspace, fileRel);

rmSync(out, { force: true });
rmSync(reportPath, { force: true });

const env = {
  ...process.env,
  MDMaster_SMOKE_OUT: out,
  MDMaster_SMOKE_ROOT: workspace,
  MDMaster_SMOKE_FILE: smokeFile,
  MDMaster_SMOKE_WAIT: wait,
};
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ["."], { stdio: "inherit", env });

child.on("exit", () => {
  if (existsSync(reportPath)) {
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    console.log("---- 渲染探针 ----");
    console.log(JSON.stringify(report.probe, null, 2));
    console.log("---- 交互检查 ----");
    for (const check of report.checks || []) {
      console.log((check.ok ? "PASS " : "FAIL ") + check.name + "  " + JSON.stringify(check.value));
    }
    const errors = (report.logs || []).filter((log) => log.level === "error");
    console.log("---- 渲染进程错误 ----");
    console.log(errors.length === 0 ? "无" : JSON.stringify(errors, null, 2));
  } else {
    console.log("---- 未生成报告（Electron 可能启动失败）----");
  }
  console.log("screenshot: " + out);
});
