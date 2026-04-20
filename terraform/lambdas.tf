# Lambda functions — three total:
#   1. discord-bot         — handles Discord slash commands (includes Ed25519 verification)
#   2. gchat-authorizer    — Google OIDC JWT verification
#   3. gchat-bot           — handles Google Chat slash commands
#
# Note: The discord-authorizer Lambda has been removed. API Gateway V2 Lambda Authorizers
# do not receive the request body, making Ed25519 signature verification impossible there.
# Verification is now done inside the discord-bot Lambda handler.
# See docs/discord-authorizer-finding.md for full details.

# ---------------------------------------------------------------
# Discord Bot Lambda
# entry: packages/bot/src/index.ts → .terraform-build/discord-bot/index.js
# Verifies Ed25519 signature at the start of every request.
# ---------------------------------------------------------------
data "archive_file" "discord_bot" {
  type        = "zip"
  source_dir  = "${path.module}/.terraform-build/discord-bot"
  output_path = "${path.module}/.terraform-build/discord-bot.zip"

  depends_on = [null_resource.build]
}

resource "aws_lambda_function" "discord_bot" {
  function_name    = "${var.app_name}-discord-bot"
  role             = aws_iam_role.discord_bot.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.discord_bot.output_path
  source_code_hash = data.archive_file.discord_bot.output_base64sha256
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      MHP_TABLE          = aws_dynamodb_table.mhp.name
      DISCORD_PUBLIC_KEY = var.discord_public_key
    }
  }

  tags = { Name = "${var.app_name}-discord-bot" }
}

# ---------------------------------------------------------------
# GChat Authorizer Lambda
# entry: packages/gchat/src/authorizer.ts → .terraform-build/gchat-authorizer/authorizer.js
# ---------------------------------------------------------------
data "archive_file" "gchat_authorizer" {
  type        = "zip"
  source_dir  = "${path.module}/.terraform-build/gchat-authorizer"
  output_path = "${path.module}/.terraform-build/gchat-authorizer.zip"

  depends_on = [null_resource.build]
}

resource "aws_lambda_function" "gchat_authorizer" {
  function_name    = "${var.app_name}-gchat-authorizer"
  role             = aws_iam_role.gchat_authorizer.arn
  runtime          = "nodejs20.x"
  handler          = "authorizer.handler"
  filename         = data.archive_file.gchat_authorizer.output_path
  source_code_hash = data.archive_file.gchat_authorizer.output_base64sha256
  timeout          = 10

  environment {
    variables = {
      GCHAT_ENDPOINT_URL = var.gchat_endpoint_url
    }
  }

  tags = { Name = "${var.app_name}-gchat-authorizer" }
}

# ---------------------------------------------------------------
# GChat Bot Lambda
# entry: packages/gchat/src/index.ts → .terraform-build/gchat-bot/index.js
# ---------------------------------------------------------------
data "archive_file" "gchat_bot" {
  type        = "zip"
  source_dir  = "${path.module}/.terraform-build/gchat-bot"
  output_path = "${path.module}/.terraform-build/gchat-bot.zip"

  depends_on = [null_resource.build]
}

resource "aws_lambda_function" "gchat_bot" {
  function_name    = "${var.app_name}-gchat-bot"
  role             = aws_iam_role.gchat_bot.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.gchat_bot.output_path
  source_code_hash = data.archive_file.gchat_bot.output_base64sha256
  timeout          = 30

  environment {
    variables = {
      MHP_TABLE = aws_dynamodb_table.mhp.name
    }
  }

  tags = { Name = "${var.app_name}-gchat-bot" }
}
