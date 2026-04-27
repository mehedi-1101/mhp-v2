# Lambda functions — four total:
#   1. discord-bot         — handles Discord slash commands (includes Ed25519 verification)
#   2. gchat-bot           — handles Google Chat slash commands
#   3. summary-worker      — processes async summary generation from SQS
#   4. summary-scheduler   — EventBridge cron creates daily SummaryJob and pushes to SQS
#
# GChat JWT verification is handled by API Gateway's native JWT Authorizer — no Lambda needed.
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
      SUMMARY_QUEUE_URL  = aws_sqs_queue.summary_queue.url
    }
  }

  tags = { Name = "${var.app_name}-discord-bot" }
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
      MHP_TABLE          = aws_dynamodb_table.mhp.name
      SUMMARY_QUEUE_URL  = aws_sqs_queue.summary_queue.url
    }
  }

  tags = { Name = "${var.app_name}-gchat-bot" }
}

# ---------------------------------------------------------------
# Summary Scheduler Lambda
# entry: packages/bot/src/scheduler.ts → .terraform-build/summary-scheduler/scheduler.js
# Triggered by EventBridge at 9 PM Dhaka — creates SummaryJob for tomorrow and pushes to SQS.
# ---------------------------------------------------------------
data "archive_file" "summary_scheduler" {
  type        = "zip"
  source_dir  = "${path.module}/.terraform-build/summary-scheduler"
  output_path = "${path.module}/.terraform-build/summary-scheduler.zip"

  depends_on = [null_resource.build]
}

resource "aws_lambda_function" "summary_scheduler" {
  function_name    = "${var.app_name}-summary-scheduler"
  role             = aws_iam_role.summary_scheduler.arn
  runtime          = "nodejs20.x"
  handler          = "scheduler.handler"
  filename         = data.archive_file.summary_scheduler.output_path
  source_code_hash = data.archive_file.summary_scheduler.output_base64sha256
  timeout          = 30

  environment {
    variables = {
      MHP_TABLE         = aws_dynamodb_table.mhp.name
      SUMMARY_QUEUE_URL = aws_sqs_queue.summary_queue.url
    }
  }

  tags = { Name = "${var.app_name}-summary-scheduler" }
}

# ---------------------------------------------------------------
# Summary Worker Lambda
# entry: packages/bot/src/worker.ts → .terraform-build/summary-worker/worker.js
# Consumes SQS messages, generates summaries, posts to Discord + GChat.
# ---------------------------------------------------------------
data "archive_file" "summary_worker" {
  type        = "zip"
  source_dir  = "${path.module}/.terraform-build/summary-worker"
  output_path = "${path.module}/.terraform-build/summary-worker.zip"

  depends_on = [null_resource.build]
}

resource "aws_lambda_function" "summary_worker" {
  function_name    = "${var.app_name}-summary-worker"
  role             = aws_iam_role.summary_worker.arn
  runtime          = "nodejs20.x"
  handler          = "worker.handler"
  filename         = data.archive_file.summary_worker.output_path
  source_code_hash = data.archive_file.summary_worker.output_base64sha256
  timeout          = 60
  memory_size      = 256

  environment {
    variables = {
      MHP_TABLE                  = aws_dynamodb_table.mhp.name
      DISCORD_SUMMARY_CHANNEL_ID = var.discord_summary_channel_id
      DISCORD_BOT_TOKEN          = var.discord_bot_token
      GCHAT_SUMMARY_WEBHOOK_URL  = var.gchat_summary_webhook_url
    }
  }

  tags = { Name = "${var.app_name}-summary-worker" }
}
