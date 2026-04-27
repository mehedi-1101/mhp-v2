# IAM — roles and policies for all Lambda functions.
# Lambda functions assume roles to get DynamoDB, SQS, and CloudWatch Logs access — no hardcoded credentials.

# ---------------------------------------------------------------
# Shared trust policy — allows Lambda service to assume these roles
# ---------------------------------------------------------------
data "aws_iam_policy_document" "lambda_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# ---------------------------------------------------------------
# Discord Bot Lambda role
# Needs: DynamoDB (read/write), CloudWatch Logs
# DISCORD_PUBLIC_KEY is passed as a Lambda env var from Terraform — safe as plain text (it's a public key).
# ---------------------------------------------------------------
resource "aws_iam_role" "discord_bot" {
  name               = "${var.app_name}-discord-bot-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_iam_role_policy_attachment" "discord_bot_dynamo" {
  role       = aws_iam_role.discord_bot.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
}

resource "aws_iam_role_policy_attachment" "discord_bot_logs" {
  role       = aws_iam_role.discord_bot.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ---------------------------------------------------------------
# GChat Bot Lambda role
# Needs: DynamoDB (read/write), CloudWatch Logs
# ---------------------------------------------------------------
resource "aws_iam_role" "gchat_bot" {
  name               = "${var.app_name}-gchat-bot-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_iam_role_policy_attachment" "gchat_bot_dynamo" {
  role       = aws_iam_role.gchat_bot.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
}

resource "aws_iam_role_policy_attachment" "gchat_bot_logs" {
  role       = aws_iam_role.gchat_bot.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ---------------------------------------------------------------
# Summary Worker Lambda role
# Needs: DynamoDB (read/write), SQS (receive/delete), CloudWatch Logs
# ---------------------------------------------------------------
resource "aws_iam_role" "summary_worker" {
  name               = "${var.app_name}-summary-worker-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_iam_role_policy_attachment" "summary_worker_dynamo" {
  role       = aws_iam_role.summary_worker.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
}

resource "aws_iam_role_policy_attachment" "summary_worker_sqs" {
  role       = aws_iam_role.summary_worker.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole"
}

resource "aws_iam_role_policy_attachment" "summary_worker_logs" {
  role       = aws_iam_role.summary_worker.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ---------------------------------------------------------------
# Summary Scheduler Lambda role
# Needs: DynamoDB (write SummaryJob), SQS (send), CloudWatch Logs
# ---------------------------------------------------------------
resource "aws_iam_role" "summary_scheduler" {
  name               = "${var.app_name}-summary-scheduler-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_iam_role_policy_attachment" "summary_scheduler_dynamo" {
  role       = aws_iam_role.summary_scheduler.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
}

resource "aws_iam_role_policy_attachment" "summary_scheduler_sqs" {
  role       = aws_iam_role.summary_scheduler.name
  policy_arn = aws_iam_policy.sqs_send.arn
}

resource "aws_iam_role_policy_attachment" "summary_scheduler_logs" {
  role       = aws_iam_role.summary_scheduler.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ---------------------------------------------------------------
# Discord Bot + GChat Bot — SQS send permissions
# Both bots need to push messages to the summary queue.
# ---------------------------------------------------------------
resource "aws_iam_policy" "sqs_send" {
  name        = "${var.app_name}-sqs-send-policy"
  description = "Allow sending messages to summary queue"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = aws_sqs_queue.summary_queue.arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "discord_bot_sqs" {
  role       = aws_iam_role.discord_bot.name
  policy_arn = aws_iam_policy.sqs_send.arn
}

resource "aws_iam_role_policy_attachment" "gchat_bot_sqs" {
  role       = aws_iam_role.gchat_bot.name
  policy_arn = aws_iam_policy.sqs_send.arn
}
