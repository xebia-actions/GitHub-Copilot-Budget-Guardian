import * as esbuild from "esbuild";

esbuild
  .build({
    entryPoints: ["src/index.js"],
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
    outfile: "dist/index.js",

    external: [
      "@actions/core",
      "@actions/github"
    ],

    sourcemap: false,
    minify: false
  })
  .then(() => {
    console.log("Build completed successfully.");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });