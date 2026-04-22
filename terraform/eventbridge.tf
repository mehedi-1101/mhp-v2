# EventBridge — daily summary trigger
#
# Fires at 9 PM Asia/Dhaka every day (3:00 PM UTC, UTC+6).
# At this time the cutoff has passed — participation records for tomorrow are final.
# The scheduler Lambda creates a SummaryJob for tomorrow and pushes it to SQS.

resource "aws_cloudwatch_event_rule" "daily_summary" {
  name                = "${var.app_name}-daily-summary"
  description         = "Triggers summary generation at 9 PM Dhaka (cutoff time)"
  schedule_expression = "cron(0 15 * * ? *)"
}

resource "aws_cloudwatch_event_target" "daily_summary" {
  rule      = aws_cloudwatch_event_rule.daily_summary.name
  target_id = "summary-scheduler"
  arn       = aws_lambda_function.summary_scheduler.arn
}

resource "aws_lambda_permission" "allow_eventbridge_scheduler" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.summary_scheduler.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily_summary.arn
}
