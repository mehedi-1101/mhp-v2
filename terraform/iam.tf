# IAM — roles and policies for all Lambda functions.
# Lambda functions assume roles to get DynamoDB and SSM access — no hardcoded credentials.

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
# Does NOT need SSM — DISCORD_PUBLIC_KEY is passed as an env var from Terraform
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
# GChat Authorizer Lambda role
# Needs: CloudWatch Logs only — makes outbound HTTPS to Google's public keys (no AWS perms needed)
# ---------------------------------------------------------------
resource "aws_iam_role" "gchat_authorizer" {
  name               = "${var.app_name}-gchat-authorizer-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_iam_role_policy_attachment" "gchat_authorizer_logs" {
  role       = aws_iam_role.gchat_authorizer.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
