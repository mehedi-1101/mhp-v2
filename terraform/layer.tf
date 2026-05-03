# Lambda Layer for @mhp/core shared business logic.
#
# Mounts at /opt/nodejs/node_modules/@mhp/core inside every Lambda that references it.
# Each main Lambda bundle is built with --external:@mhp/core so Node.js resolves the
# package from the Layer at runtime instead of inlining it.
#
# Layer zip structure (required by Lambda Node.js runtime):
#   nodejs/
#   └── node_modules/
#       └── @mhp/core/
#           ├── package.json
#           └── index.js   ← esbuild CJS bundle of all @mhp/core exports
#
# Layer versions are immutable — a source change produces a new version number and
# Terraform updates each Lambda's layers = [...] to point at the new version.
#
# Production value: ~9 KB saving per Lambda (negligible at 1.4 MB bundle size).
# Learning value: Layer definition, versioning, build pipeline split, /opt/ mount.

data "archive_file" "core_layer" {
  type        = "zip"
  source_dir  = "${path.module}/.terraform-build/core-layer"
  output_path = "${path.module}/.terraform-build/core-layer.zip"

  depends_on = [null_resource.build]
}

resource "aws_lambda_layer_version" "core" {
  layer_name               = "${var.app_name}-core"
  filename                 = data.archive_file.core_layer.output_path
  source_code_hash         = data.archive_file.core_layer.output_base64sha256
  compatible_runtimes      = ["nodejs20.x"]
  compatible_architectures = ["arm64"]
  description              = "@mhp/core — types, headcount computation, validation, cutoff rules"
}
