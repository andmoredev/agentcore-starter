# AgentCore Chatbot

AI-powered chatbot built on AWS Bedrock AgentCore Runtime with conversation memory.

## Architecture

- **Frontend**: React + TypeScript (S3 + CloudFront)
- **Backend**: AWS Lambda + API Gateway + Step Functions (Express)
- **AI/ML**: AgentCore Runtime + Bedrock
- **Agent**: Strands framework with memory and tool usage

## Project Structure

```
backend/
  agents/agent/        # AgentCore agent (Python/Strands)
  functions/           # Lambda functions
  workflows/           # Step Functions state machine
  template.yaml        # SAM template
  openapi.yaml         # API Gateway OpenAPI spec
frontend/
  src/                 # React application
  template.yaml        # SAM template (S3 + CloudFront)
.github/
  workflows/           # CI/CD pipelines
  actions/             # Reusable GitHub Actions
```

## Getting Started

```bash
./setup-local-dev.sh
```

Or manually:

```bash
# Backend
cd backend && sam build && sam deploy --guided

# Frontend
cd frontend && npm install && npm run dev
```
