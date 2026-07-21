import { mkdir, cp } from "node:fs/promises";
import path from "node:path";
import { build, context } from "esbuild";

const watchMode = process.argv.includes("--watch");
const root = process.cwd();
const dist = path.join(root, "dist");

const entries = [
    ["src/background/index.ts", "dist/background.js"],
    ["src/content/index.ts", "dist/content.js"],
    ["src/popup/index.ts", "dist/popup.js"],
    ["src/options/index.ts", "dist/options.js"]
];

async function copyStaticFiles() {
    await mkdir(dist, { recursive: true });
    await cp(path.join(root, "manifest.json"), path.join(dist, "manifest.json"));
    await cp(path.join(root, "src/popup/popup.html"), path.join(dist, "popup.html"));
    await cp(path.join(root, "src/options/options.html"), path.join(dist, "options.html"));
    await cp(path.join(root, "src/styles/common.css"), path.join(dist, "common.css"));
}

async function runBuild() {
    await copyStaticFiles();

    const contexts = [];
    for (const [entry, output] of entries) {
        const options = {
            entryPoints: [path.join(root, entry)],
            outfile: path.join(root, output),
            bundle: true,
            platform: "browser",
            target: "chrome120",
            format: "iife",
            sourcemap: true,
            logLevel: "info"
        };

        if (watchMode) {
            const ctx = await context(options);
            await ctx.watch();
            contexts.push(ctx);
        } else {
            await build(options);
        }
    }

    if (watchMode) {
        console.log("Watching for changes...");
    }
}

runBuild().catch((error) => {
    console.error(error);
    process.exit(1);
});
