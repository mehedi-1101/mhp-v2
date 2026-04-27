# DynamoDB single table — defines the only DynamoDB table used by all Lambda functions.
#
# Key namespace:
#   User          PK: USER#<userId>       SK: USER#<userId>
#   Team          PK: TEAM#<teamId>       SK: TEAM#<teamId>
#   Participation PK: PART#<date>         SK: <userId>#<mealType>
#   WorkLocation  PK: LOC#<date>          SK: <userId>
#   SpecialDay    PK: SDAY#<yearMonth>    SK: <date>
#   Settings      PK: SETTINGS#global     SK: SETTINGS#global
#   SummaryJob    PK: JOB#<date>          SK: <jobId>
#
# GSI: userId-date-index — shared by Participation and WorkLocation items.
# Enables user meal history + WFH monthly history queries.

resource "aws_dynamodb_table" "mhp" {
  name         = "${var.app_name}-table"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  # GSI attributes — only key attributes need to be declared here.
  # All other item attributes are schema-free.
  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "date"
    type = "S"
  }

  global_secondary_index {
    name            = "userId-date-index"
    hash_key        = "userId"
    range_key       = "date"
    projection_type = "ALL"
  }

  tags = {
    Name = "${var.app_name}-table"
  }
}
