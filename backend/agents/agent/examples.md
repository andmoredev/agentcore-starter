export AGENTCORE_MEMORY_ID=<your-memory-id>

curl -X POST http://localhost:8080/invocations \
  -H "Content-Type: application/json" \
  -d '{"request": "Hello! What can you help me with?", "session_id": "9f3c8a9b-7a7b-4b62-9b7f-5bbf7db0e7a1", "user_id": "user1"}'
