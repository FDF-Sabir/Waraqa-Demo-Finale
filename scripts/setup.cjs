const { spawnSync } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
function run(args, cwd = root) {
  const r = spawnSync(npm, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) process.exit(r.status || 1);
}
run(["ci", "--no-audit", "--no-fund"], path.join(root, "backend"));
run(["ci", "--no-audit", "--no-fund"], path.join(root, "frontend"));
run(["run", "build"]);
console.log("Sources compilées. Lancez npm start.");
