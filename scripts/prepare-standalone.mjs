import { cp, mkdir } from "fs/promises";
import path from "path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

async function copyIfExists(from, to) {
  try {
    await cp(from, to, { recursive: true, force: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

await mkdir(path.join(standalone, "data"), { recursive: true });
await copyIfExists(path.join(root, "public"), path.join(standalone, "public"));
await copyIfExists(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"));
await copyIfExists(path.join(root, "data"), path.join(standalone, "data"));