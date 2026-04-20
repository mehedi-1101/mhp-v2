# EventBridge warm-up rule — invokes discord-bot every 10 minutes to prevent cold starts.
#
# Cold starts push execution time over Discord's 3-second response deadline.
# This keeps the Lambda warm so real interactions always hit a warm instance (~200ms).

resource "aws_cloudwatch_event_rule" "discord_bot_warmup" {
  name                = "${var.app_name}-discord-bot-warmup"
  schedule_expression = "rate(10 minutes)"
}

resource "aws_cloudwatch_event_target" "discord_bot_warmup" {
  rule = aws_cloudwatch_event_rule.discord_bot_warmup.name
  arn  = aws_lambda_function.discord_bot.arn
}

resource "aws_lambda_permission" "discord_bot_warmup" {
  statement_id  = "AllowEventBridgeInvokeWarmup"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.discord_bot.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.discord_bot_warmup.arn
}
