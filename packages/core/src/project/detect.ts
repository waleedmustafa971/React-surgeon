import path from "node:path";
import fs from "node:fs/promises";
import { Workspace } from "../security/workspace.js";
import type { ProjectInfo } from "@react-surgeon/shared";
export async function detectProject(root: string): Promise<ProjectInfo> {
  const ws = new Workspace(root),
    pkg = JSON.parse(await ws.read("package.json"));
  const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
  if (!dependencies.react)
    throw new Error("Not a React project: package.json must declare react");
  const files = await ws.files();
  const rootFiles = await fs.readdir(root);
  const names = [
    "vite",
    "react-router",
    "react-router-dom",
    "tailwindcss",
    "@reduxjs/toolkit",
    "zustand",
    "@tanstack/react-query",
    "vitest",
    "jest",
    "playwright",
    "@playwright/test",
    "eslint",
    "babel-plugin-react-compiler",
  ];
  return {
    root: path.resolve(root),
    react: dependencies.react,
    reactDOM: dependencies["react-dom"],
    language: files.some((f) => /\.tsx?$/.test(f))
      ? "TypeScript"
      : "JavaScript",
    packageManager:
      pkg.packageManager?.split("@")[0] ??
      (rootFiles.includes("pnpm-lock.yaml")
        ? "pnpm"
        : rootFiles.includes("yarn.lock")
          ? "yarn"
          : rootFiles.includes("bun.lockb") || rootFiles.includes("bun.lock")
            ? "bun"
            : "npm"),
    scripts: pkg.scripts ?? {},
    dependencies,
    features: names.filter((n) => dependencies[n]),
    entries: files.filter((f) => /(?:main|index|App)\.[jt]sx?$/.test(f)),
    sourceDirectory: files.some((f) => f.startsWith("src/")) ? "src" : ".",
  };
}
