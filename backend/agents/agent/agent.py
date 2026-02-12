"""
Generic Assistant Agent - AgentCore Runtime with WebSocket Streaming

A conversational assistant with:
- Real-time streaming via WebSocket
- Memory persistence across conversations
- JWT-based user authentication
- Tool access (memory, LLM)

Required Environment Variables:
    - AGENTCORE_MEMORY_ID: AgentCore Memory resource ID for conversation persistence

Optional Environment Variables:
    - AWS_REGION: AWS region (default: us-east-1)
    - BEDROCK_MODEL_ID: Bedrock model ID (default: us.amazon.nova-lite-v1:0)
"""

import os
import json
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
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "us.amazon.nova-lite-v1:0")

if not AGENTCORE_MEMORY_ID:
    raise ValueError("AGENTCORE_MEMORY_ID environment variable is required but not set")

# ============================================================================

SYSTEM_PROMPT = """You are a helpful assistant. You can have multi-turn conversations with users,
remembering context from previous messages using your memory tool.

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


@app.websocket
async def websocket_handler(websocket, context):
    """
    WebSocket handler for real-time streaming agent responses.

    JWT authentication is handled by AgentCore Runtime before this handler is called.
    User identity information is available in the context.

    Args:
        websocket: WebSocket connection object
        context: Request context containing user identity from validated JWT
    """
    await websocket.accept()

    try:
        # Extract user identity from JWT context (already validated by AgentCore Runtime)
        user_id = context.get("user_id") or context.get("sub")  # JWT 'sub' claim
        client_id = context.get("client_id")  # JWT 'client_id' claim

        print(f"✅ WebSocket connection established")
        print(f"   User ID: {user_id}")
        print(f"   Client ID: {client_id}")

        # Receive initial request from client
        data = await websocket.receive_json()
        request = data.get("request", "")
        session_id = data.get("session_id")

        # Validate input
        if not request:
            await websocket.send_json({
                "type": "error",
                "error": "Missing required field: request"
            })
            return

        if not session_id:
            await websocket.send_json({
                "type": "error",
                "error": "Missing required field: session_id"
            })
            return

        print(f"📨 Request received - Session: {session_id}")
        print(f"   Request: {request[:100]}{'...' if len(request) > 100 else ''}")

        # Create agent with session manager using validated user_id
        session_manager = create_session_manager(session_id, user_id)

        agent = Agent(
            model=BedrockModel(model_id=BEDROCK_MODEL_ID),
            tools=[memory, use_llm],
            system_prompt=SYSTEM_PROMPT,
            session_manager=session_manager,
        )

        print(f"🤖 Agent initialized - Model: {BEDROCK_MODEL_ID}")

        # Stream events back to client in real-time
        async for event in agent.stream_async(request):
            # Transform event into structured message for client
            message = {
                "type": "stream_event",
                "event": event
            }

            # Send event to client
            await websocket.send_json(message)

            # Log important events for debugging
            if event.get("init_event_loop"):
                print("   🔄 Event loop initialized")
            elif event.get("current_tool_use"):
                tool_name = event["current_tool_use"].get("name")
                if tool_name:
                    print(f"   🔧 Using tool: {tool_name}")
            elif event.get("complete"):
                print("   ✅ Agent processing complete")
            elif event.get("data"):
                # Log text chunks (truncated)
                data_preview = event["data"][:50]
                if len(event["data"]) > 50:
                    data_preview += "..."
                print(f"   📝 Text chunk: {data_preview}")

        # Send completion signal
        await websocket.send_json({
            "type": "complete",
            "session_id": session_id
        })

        print(f"✅ Stream complete for session: {session_id}")

    except json.JSONDecodeError as e:
        print(f"❌ JSON decode error: {e}")
        try:
            await websocket.send_json({
                "type": "error",
                "error": "Invalid JSON in request"
            })
        except:
            pass  # Connection may already be closed

    except Exception as e:
        print(f"❌ Error in websocket_handler: {str(e)}")
        import traceback
        traceback.print_exc()

        try:
            await websocket.send_json({
                "type": "error",
                "error": str(e),
                "message": "An error occurred while processing your request"
            })
        except:
            pass  # Connection may already be closed

    finally:
        try:
            await websocket.close()
            print("🔌 WebSocket connection closed")
        except:
            pass


# Keep the HTTP entrypoint for backward compatibility (optional)
@app.entrypoint
def invoke(payload):
    """
    HTTP entrypoint (legacy support).

    For real-time streaming, use the WebSocket endpoint instead.
    """
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
