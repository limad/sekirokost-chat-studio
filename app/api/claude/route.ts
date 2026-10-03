import type { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiKey, apiUrl, model, messages, stream = true } = body;

    console.log('API Request received:', { 
      hasApiKey: !!apiKey, 
      apiUrl, 
      model, 
      messagesCount: messages?.length,
      stream 
    });

    if (!apiKey) {
      return Response.json(
        { error: 'API key is required' },
        { status: 400 }
      );
    }

    if (!messages || messages.length === 0) {
      return Response.json(
        { error: 'Messages are required' },
        { status: 400 }
      );
    }

    const claudeUrl = `${apiUrl}/messages`;
    console.log('Calling Claude API:', claudeUrl);

    const response = await fetch(claudeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-5-5',
        max_tokens: 4096,
        messages: messages,
        stream: stream,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      console.error('Claude API error:', data);
      return Response.json(
        { 
          error: data.error?.message || data.error?.type || 'API request failed', 
          details: data,
          status: response.status 
        },
        { status: response.status }
      );
    }

    // Si streaming désactivé, retourner la réponse complète
    if (!stream) {
      const data = await response.json();
      return Response.json(data);
    }

    // Streaming SSE : transférer le stream de Claude au client
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            // Transférer les chunks directement au client
            controller.enqueue(value);
          }
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Claude API proxy error:', error);
    return Response.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
