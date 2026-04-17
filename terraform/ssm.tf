# SSM Parameter Store — intentionally empty.
#
# SSM was removed because:
#   1. No Lambda reads from SSM — all secrets are passed as env vars from Terraform.
#   2. The craftsmen-EnforceMFA IAM policy denies KMS/SSM calls without an MFA session,
#      causing every `terraform apply` to fail during the refresh step.
#   3. SecureString params (e.g. discord_bot_token) trigger KMS API calls even on refresh.
#
# Where secrets now live:
#   - DISCORD_PUBLIC_KEY  → Lambda env var (lambdas.tf, safe as plain env var — it's a public key)
#   - MHP_TABLE           → Lambda env var (lambdas.tf, derived from DynamoDB resource name)
#   - DISCORD_BOT_TOKEN   → set locally in terraform.tfvars (git-ignored) for scripts only
#   - DISCORD_APP_ID      → set locally in terraform.tfvars (git-ignored) for scripts only
#   - GCHAT_ENDPOINT_URL  → Lambda env var (lambdas.tf, set after first deploy)
