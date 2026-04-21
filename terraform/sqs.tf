# SQS queue for async summary generation
# Bot Lambda pushes messages, Worker Lambda consumes them.

resource "aws_sqs_queue" "summary_queue" {
  name                       = "${var.app_name}-summary-queue"
  visibility_timeout_seconds = 180
  message_retention_seconds  = 86400

  tags = { Name = "${var.app_name}-summary-queue" }
}

# Event source mapping — connects SQS to Worker Lambda
resource "aws_lambda_event_source_mapping" "summary_worker" {
  event_source_arn = aws_sqs_queue.summary_queue.arn
  function_name    = aws_lambda_function.summary_worker.arn
  batch_size       = 1
}
