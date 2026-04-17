# Outputs — printed after terraform apply completes.

output "api_gateway_url" {
  description = "Base URL of the API Gateway — use this to set GCHAT_ENDPOINT_URL"
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "discord_interactions_url" {
  description = "Paste this URL into Discord Developer Portal → Interactions Endpoint URL"
  value       = "${trimsuffix(aws_apigatewayv2_stage.default.invoke_url, "/")}/discord-interactions"
}

output "gchat_interactions_url" {
  description = "Paste this URL into Google Cloud Console → Google Chat app → HTTP endpoint URL. Then set var.gchat_endpoint_url to this value and run terraform apply again."
  value       = "${trimsuffix(aws_apigatewayv2_stage.default.invoke_url, "/")}/gchat-interactions"
}

output "dynamodb_table_name" {
  description = "DynamoDB table name — pass to seed scripts as MHP_TABLE=<value>"
  value       = aws_dynamodb_table.mhp.name
}

output "register_commands_instructions" {
  description = "How to register Discord slash commands after deploy"
  value       = "cd .. && MHP_TABLE=${aws_dynamodb_table.mhp.name} npx tsx scripts/register-commands.ts"
}
