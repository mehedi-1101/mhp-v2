# Build step — compiles TypeScript and bundles each Lambda entry point.
#
# Steps run in order when any .ts source file changes:
#   1. npm run build  — tsc compilation (populates packages/*/dist)
#   2. Build @mhp/core Layer — esbuild bundles core into the Layer zip structure
#   3-6. esbuild — bundles each main Lambda with --external:@mhp/core
#        (core is resolved at runtime from /opt/nodejs/node_modules/@mhp/core)
#   7. esbuild — bundles discord-authorizer (no @mhp/core dependency)
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

  # Step 2: build @mhp/core Lambda Layer.
  # Creates the nodejs/node_modules/@mhp/core directory structure required by the
  # Lambda Node.js runtime, then bundles core into a single CJS file inside it.
  # The archive_file data source in layer.tf zips this directory into core-layer.zip.
  provisioner "local-exec" {
    working_dir = "${path.module}/.."
    command     = <<-PS
      $dest = 'terraform\.terraform-build\core-layer\nodejs\node_modules\@mhp\core';
      New-Item -Force -ItemType Directory -Path $dest | Out-Null;
      npx esbuild packages/core/src/index.ts --bundle --platform=node --target=node20 --format=cjs --outfile="$dest\index.js";
      Set-Content -Path "$dest\package.json" -Value '{"name":"@mhp/core","version":"0.0.1","main":"index.js"}'
    PS
    interpreter = ["PowerShell", "-Command"]
  }

  # Step 3: bundle Discord Bot Lambda
  provisioner "local-exec" {
    working_dir = "${path.module}/.."
    command     = "npx esbuild packages/bot/src/index.ts --bundle --platform=node --target=node20 --external:@mhp/core --outfile=terraform/.terraform-build/discord-bot/index.js"
    interpreter = ["cmd", "/C"]
  }

  # Step 4: bundle GChat Bot Lambda
  provisioner "local-exec" {
    working_dir = "${path.module}/.."
    command     = "npx esbuild packages/gchat/src/index.ts --bundle --platform=node --target=node20 --external:@mhp/core --outfile=terraform/.terraform-build/gchat-bot/index.js"
    interpreter = ["cmd", "/C"]
  }

  # Step 5: bundle Summary Worker Lambda
  provisioner "local-exec" {
    working_dir = "${path.module}/.."
    command     = "npx esbuild packages/bot/src/worker.ts --bundle --platform=node --target=node20 --external:@mhp/core --outfile=terraform/.terraform-build/summary-worker/worker.js"
    interpreter = ["cmd", "/C"]
  }

  # Step 6: bundle Summary Scheduler Lambda
  provisioner "local-exec" {
    working_dir = "${path.module}/.."
    command     = "npx esbuild packages/bot/src/scheduler.ts --bundle --platform=node --target=node20 --external:@mhp/core --outfile=terraform/.terraform-build/summary-scheduler/scheduler.js"
    interpreter = ["cmd", "/C"]
  }

  # Step 7: bundle Discord Authorizer Lambda
  # No --external:@mhp/core — this handler has no dependency on core.
  provisioner "local-exec" {
    working_dir = "${path.module}/.."
    command     = "npx esbuild packages/bot/src/discord-authorizer.ts --bundle --platform=node --target=node20 --outfile=terraform/.terraform-build/discord-authorizer/index.js"
    interpreter = ["cmd", "/C"]
  }
}
