# Build step — compiles TypeScript and bundles each Lambda entry point.
#
# Two steps run in order when any .ts source file changes:
#   1. npm run build  — tsc compilation (populates packages/*/dist)
#   2. esbuild        — bundles each Lambda entry point into a single self-contained JS file
#
# Why esbuild instead of zipping dist/ + a node_modules layer:
#   Terraform's archive_file does not follow symlinks. In this monorepo, workspace
#   packages (@mhp/core, @mhp/bot) are symlinks in node_modules — they would be
#   missing from the layer zip. esbuild resolves all imports at build time, producing
#   one portable file per Lambda with no runtime dependency on node_modules.
#
# Prerequisite: Node.js and npm must be installed locally.

locals {
  # Hash all TypeScript source files. When any .ts file changes, the build re-runs.
  ts_source_hash = sha256(join("", [
    for f in fileset("${path.module}/..", "packages/*/src/**/*.ts") :
    filesha256("${path.module}/../${f}")
  ]))
}

resource "null_resource" "build" {
  triggers = {
    source_hash = local.ts_source_hash
  }

  # Step 1: compile TypeScript for all packages (populates packages/*/dist).
  # esbuild resolves @mhp/core and @mhp/bot via their package.json exports which
  # point to dist/ — so dist must exist before bundling.
  provisioner "local-exec" {
    working_dir = "${path.module}/.."
    command     = "npm run build"
    interpreter = ["cmd", "/C"]
  }

  # Step 2: bundle Discord Bot Lambda
  provisioner "local-exec" {
    working_dir = "${path.module}/.."
    command     = "npx esbuild packages/bot/src/index.ts --bundle --platform=node --target=node20 --outfile=terraform/.terraform-build/discord-bot/index.js"
    interpreter = ["cmd", "/C"]
  }

  # Step 3: bundle GChat Bot Lambda
  provisioner "local-exec" {
    working_dir = "${path.module}/.."
    command     = "npx esbuild packages/gchat/src/index.ts --bundle --platform=node --target=node20 --outfile=terraform/.terraform-build/gchat-bot/index.js"
    interpreter = ["cmd", "/C"]
  }

  # Step 4: bundle Summary Worker Lambda
  provisioner "local-exec" {
    working_dir = "${path.module}/.."
    command     = "npx esbuild packages/bot/src/worker.ts --bundle --platform=node --target=node20 --outfile=terraform/.terraform-build/summary-worker/worker.js"
    interpreter = ["cmd", "/C"]
  }

  # Step 5: bundle Summary Scheduler Lambda
  provisioner "local-exec" {
    working_dir = "${path.module}/.."
    command     = "npx esbuild packages/bot/src/scheduler.ts --bundle --platform=node --target=node20 --outfile=terraform/.terraform-build/summary-scheduler/scheduler.js"
    interpreter = ["cmd", "/C"]
  }
}
