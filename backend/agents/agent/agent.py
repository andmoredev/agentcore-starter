"""
Generic Assistant Agent - AgentCore Runtime

A simple conversational assistant with memory persistence and tool access.

Required Environment Variables:
    - AGENTCORE_MEMORY_ID: AgentCore Memory resource ID for conversation persistence

Optional Environment Variables:
    - AWS_REGION: AWS region (default: us-east-1)
    - BEDROCK_MODEL_ID: Bedrock model ID (default: us.anthropic.claude-sonnet-4-5-20250929-v1:0)
"""

import os
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent
from strands_tools import use_llm, memory
from strands.models import BedrockModel
from bedrock_agentcore.memory.integrations.strands.config import AgentCoreMemoryConfig
from bedrock_agentcore.memory.integrations.strands.session_manager import AgentCoreMemorySessionManager

app = BedrockAgentCoreApp()

# ============================================================================
# Configuration
# ============================================================================

AGENTCORE_MEMORY_ID = os.environ.get("AGENTCORE_MEMORY_ID")
AWS_REGION = os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-5-20250929-v1:0")

if not AGENTCORE_MEMORY_ID:
    raise ValueError("AGENTCORE_MEMORY_ID environment variable is required but not set")

# ============================================================================

SYSTEM_PROMPT = """You are a helpful assistant. You can have multi-turn conversations with users, remembering context from previous messages using your memory tool.

When responding:
- Be concise and helpful
- Use your memory tool to recall previous conversation context when relevant
- Format responses in Markdown when appropriate
- If you're unsure about something, ask for clarification"""


def create_session_manager(runtime_session_id: str, user_id: str = None):
    """Create AgentCore Memory session manager for conversation persistence."""
    actor_id = user_id if user_id else "user"

    config = AgentCoreMemoryConfig(
        memory_id=AGENTCORE_MEMORY_ID,
        session_id=runtime_session_id,
        actor_id=actor_id
    )

    return AgentCoreMemorySessionManager(
        agentcore_memory_config=config,
        region_name=AWS_REGION
    )


@app.entrypoint
def invoke(payload):
    """Process user input and return agent response."""
    request = payload.get("request", "")

    if not request:
        return {"error": "Please provide a request"}

    try:
        runtime_session_id = payload.get("session_id")
        user_id = payload.get("user_id")

        if not runtime_session_id:
            import uuid
            runtime_session_id = f"session_{uuid.uuid4().hex[:16]}"
            print(f"Warning: Generated session ID: {runtime_session_id}")

        tools = [memory, use_llm]

        session_manager = create_session_manager(runtime_session_id, user_id)

        agent = Agent(
            model=BedrockModel(model_id=BEDROCK_MODEL_ID),
            tools=tools,
            system_prompt=SYSTEM_PROMPT,
            session_manager=session_manager,
        )

        print(f"Agent initialized with model: {BEDROCK_MODEL_ID}, session: {runtime_session_id}")

        result = agent(request)

        response_text = str(result)

        return {
            "request": request,
            "response": response_text,
        }

    except Exception as e:
        return {
            "error": "INTERNAL_SERVER_ERROR",
            "message": f"An error occurred while processing your request: {str(e)}",
        }

if __name__ == "__main__":
    app.run()
