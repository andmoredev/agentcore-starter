/**
 * WebSocket Info Function
 *
 * Returns WebSocket connection information for frontend clients.
 * With JWT authentication, no signing is needed - the frontend
 * will connect directly with the JWT bearer token.
 */

export const handler = async (event) => {
    try {
        console.log('WebSocket info request received');

        const region = process.env.AWS_REGION;
        const runtimeArn = process.env.AGENT_RUNTIME_ARN;

        if (!runtimeArn) {
            throw new Error('AGENT_RUNTIME_ARN environment variable not set');
        }

        // Extract runtime ID from ARN
        // ARN format: arn:aws:bedrock-agentcore:region:account:runtime/runtime-id
        const runtimeId = runtimeArn.split('/').pop();

        // Construct WebSocket URL
        // Frontend will connect with JWT bearer token in Authorization header
        const wsUrl = `wss://bedrock-agentcore.${region}.amazonaws.com/runtimes/${runtimeId}/ws`;

        console.log('Returning WebSocket info:', { wsUrl, authType: 'JWT' });

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
                'Access-Control-Allow-Methods': 'GET,OPTIONS'
            },
            body: JSON.stringify({
                wsUrl,
                runtimeId,
                authType: 'JWT',
                message: 'Connect with JWT bearer token in Authorization header or first WebSocket message'
            })
        };

    } catch (error) {
        console.error('Error getting WebSocket info:', error);

        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Internal Server Error',
                message: 'Failed to get WebSocket connection information',
                details: error.message
            })
        };
    }
};
