#!/bin/bash

# Script to build frontend with API configuration from backend stack outputs

set -e

# Default values
BACKEND_STACK_NAME="${BACKEND_STACK_NAME:-agentcore-chatbot-backend}"
AWS_REGION="${AWS_REGION:-us-east-1}"

echo "Fetching configuration from backend stack: $BACKEND_STACK_NAME"

# Get the API URL from CloudFormation stack outputs
API_URL=$(aws cloudformation describe-stacks \
    --stack-name "$BACKEND_STACK_NAME" \
    --region "$AWS_REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='BackendApiUrl'].OutputValue" \
    --output text 2>/dev/null || echo "")

if [ -z "$API_URL" ] || [ "$API_URL" = "None" ]; then
    echo "ERROR: Could not fetch API URL from stack $BACKEND_STACK_NAME"
    echo "   Make sure the backend stack is deployed and has BackendApiUrl output"
    exit 1
fi

echo "Found API URL: $API_URL"

# Create config directory if it doesn't exist
mkdir -p src/config

# Create environment configuration file
echo "Creating environment configuration..."
cat > src/config/api.ts << EOF
// Auto-generated API configuration from backend stack
// Generated at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
// Backend Stack: $BACKEND_STACK_NAME
// Region: $AWS_REGION

export const API_CONFIG = {
  baseUrl: '$API_URL',
  endpoints: {
    query: 'query'
  }
} as const;

export default API_CONFIG;
EOF

echo "Environment configuration created at src/config/api.ts"

# Build the frontend
echo "Building frontend..."
npm run build

echo "Frontend build completed with API configuration"
echo "   API Base URL: $API_URL"
