variable "aws_region" {
  description = "AWS region to deploy all resources"
  default     = "ap-south-1"
}

variable "app_name" {
  description = "Short name used to prefix all resource names and tags"
  default     = "mhp-v2"
}

# ---------------------------------------------------------------
# Discord secrets — set these before running terraform apply.
# Store them in terraform.tfvars (git-ignored) or pass via -var.
# ---------------------------------------------------------------
variable "discord_public_key" {
  description = "Discord application public key — used by Discord Authorizer Lambda for Ed25519 signature verification"
  type        = string
  sensitive   = true
}

# ---------------------------------------------------------------
# Google Chat secrets
# ---------------------------------------------------------------
variable "gchat_endpoint_url" {
  description = "Full API Gateway URL of the gchat-interactions route — used as JWT audience in GChat Authorizer. Set AFTER first apply once you know the API Gateway URL, then re-apply."
  type        = string
  default     = ""
}
