# API Gateway V2 (HTTP API)
#
# Routes:
#   POST /discord-interactions  → Discord Bot Lambda (no authorizer — signature verified inside handler)
#   POST /gchat-interactions    → GChat Bot Lambda   (protected by GChat JWT Authorizer)
#
# Discord does not use a Lambda Authorizer because API Gateway V2 Lambda Authorizers
# do not receive the request body. Ed25519 signature verification requires the raw body,
# so it is done inside the Discord Bot Lambda handler instead.
# See docs/discord-authorizer-finding.md for full details.

resource "aws_apigatewayv2_api" "bot_api" {
  name          = "${var.app_name}-api"
  protocol_type = "HTTP"

  tags = { Name = "${var.app_name}-api" }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.bot_api.id
  name        = "$default"
  auto_deploy = true
}

# ---------------------------------------------------------------
# GChat Authorizer
# identitySource: Authorization header — Google sends a Bearer JWT here.
# ttl: 0 — Google JWTs expire quickly; no value in caching.
# JWT verification only checks the Authorization header — no body needed,
# so a Lambda Authorizer works correctly for GChat.
# ---------------------------------------------------------------
resource "aws_apigatewayv2_authorizer" "gchat" {
  api_id                            = aws_apigatewayv2_api.bot_api.id
  authorizer_type                   = "REQUEST"
  name                              = "GChatAuthorizer"
  authorizer_uri                    = aws_lambda_function.gchat_authorizer.invoke_arn
  authorizer_payload_format_version = "2.0"
  identity_sources                  = ["$request.header.Authorization"]
  authorizer_result_ttl_in_seconds  = 0
  enable_simple_responses           = true
}

resource "aws_lambda_permission" "gchat_authorizer_apigw" {
  statement_id  = "AllowAPIGatewayInvokeGChatAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.gchat_authorizer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.bot_api.execution_arn}/*"
}

# ---------------------------------------------------------------
# Discord Bot route — POST /discord-interactions
# No Lambda Authorizer — signature verification happens inside the bot Lambda.
# ---------------------------------------------------------------
resource "aws_apigatewayv2_integration" "discord_bot" {
  api_id                 = aws_apigatewayv2_api.bot_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.discord_bot.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "discord_interactions" {
  api_id             = aws_apigatewayv2_api.bot_api.id
  route_key          = "POST /discord-interactions"
  target             = "integrations/${aws_apigatewayv2_integration.discord_bot.id}"
  authorization_type = "NONE"
}

resource "aws_lambda_permission" "discord_bot_apigw" {
  statement_id  = "AllowAPIGatewayInvokeDiscordBot"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.discord_bot.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.bot_api.execution_arn}/*"
}

# ---------------------------------------------------------------
# GChat Bot route — POST /gchat-interactions
# ---------------------------------------------------------------
resource "aws_apigatewayv2_integration" "gchat_bot" {
  api_id                 = aws_apigatewayv2_api.bot_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.gchat_bot.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "gchat_interactions" {
  api_id             = aws_apigatewayv2_api.bot_api.id
  route_key          = "POST /gchat-interactions"
  target             = "integrations/${aws_apigatewayv2_integration.gchat_bot.id}"
  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.gchat.id
}

resource "aws_lambda_permission" "gchat_bot_apigw" {
  statement_id  = "AllowAPIGatewayInvokeGChatBot"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.gchat_bot.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.bot_api.execution_arn}/*"
}
