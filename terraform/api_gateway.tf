# API Gateway V2 (HTTP API)
#
# Routes:
#   POST /discord-interactions  → Discord Bot Lambda (header-presence authorizer + Ed25519 in handler)
#   POST /gchat-interactions    → GChat Bot Lambda   (protected by native JWT Authorizer)
#
# Discord uses a Lambda Authorizer that checks for the presence of x-signature-ed25519
# and x-signature-timestamp headers. API Gateway rejects requests missing either header
# before the authorizer Lambda is invoked. Full Ed25519 verification requires the request
# body, which API GW V2 authorizers do not receive — so the complete cryptographic check
# stays inside the discord-bot Lambda handler. This is a partial defense-in-depth pattern.
# See docs/discord-authorizer-finding.md for full details.
#
# GChat uses the native JWT Authorizer. Google Chat attaches a signed OIDC ID token to
# every request (Authorization: Bearer <jwt>). API Gateway verifies the signature and
# audience directly — no Lambda invocation needed for auth.

resource "aws_apigatewayv2_api" "bot_api" {
  name          = "${var.app_name}-api"
  protocol_type = "HTTP"

  tags = { Name = "${var.app_name}-api" }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.bot_api.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = 50
    throttling_burst_limit = 100
  }
}

# ---------------------------------------------------------------
# GChat JWT Authorizer (native — no Lambda)
# Google Chat signs every request with an OIDC ID token from accounts.google.com.
# API Gateway fetches Google's JWKS automatically and verifies the signature.
# The audience must match the endpoint URL set in var.gchat_endpoint_url.
# ---------------------------------------------------------------
resource "aws_apigatewayv2_authorizer" "gchat" {
  api_id           = aws_apigatewayv2_api.bot_api.id
  authorizer_type  = "JWT"
  name             = "GChatJWTAuthorizer"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    issuer   = "https://accounts.google.com"
    audience = [var.gchat_endpoint_url]
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ---------------------------------------------------------------
# Discord Lambda Authorizer — header-presence check
# Checks that x-signature-ed25519 and x-signature-timestamp are present.
# identity_sources causes API Gateway to return 401 without invoking the
# authorizer Lambda when either header is missing.
# authorizer_result_ttl_in_seconds = 0: no caching — every Discord request
# carries a unique signature so cached results would never be reusable.
# ---------------------------------------------------------------
resource "aws_apigatewayv2_authorizer" "discord" {
  api_id                            = aws_apigatewayv2_api.bot_api.id
  authorizer_type                   = "REQUEST"
  authorizer_uri                    = aws_lambda_function.discord_authorizer.invoke_arn
  name                              = "DiscordHeaderAuthorizer"
  authorizer_payload_format_version = "2.0"
  identity_sources                  = ["$request.header.x-signature-ed25519", "$request.header.x-signature-timestamp"]
  authorizer_result_ttl_in_seconds  = 0
  enable_simple_responses           = true
}

resource "aws_lambda_permission" "discord_authorizer_apigw" {
  statement_id  = "AllowAPIGatewayInvokeDiscordAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.discord_authorizer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.bot_api.execution_arn}/*"
}

# ---------------------------------------------------------------
# Discord Bot route — POST /discord-interactions
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
  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.discord.id
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
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.gchat.id
}

resource "aws_lambda_permission" "gchat_bot_apigw" {
  statement_id  = "AllowAPIGatewayInvokeGChatBot"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.gchat_bot.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.bot_api.execution_arn}/*"
}
