import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { model, messages, stream = true, think = false } = body;
    const ollamaUrl = typeof body.ollamaUrl === 'string' ? body.ollamaUrl.trim().replace(/\/+$/, '') : body.ollamaUrl;

    console.log('Ollama API Request received:', {
      hasOllamaUrl: !!ollamaUrl,
      ollamaUrl,
      model,
      messagesCount: messages?.length,
      stream,
    });

    if (!ollamaUrl) {
      return NextResponse.json(
        { error: 'URL Ollama manquante' },
        { status: 400 }
      );
    }

    if (!model) {
      return NextResponse.json(
        { error: 'Modèle non spécifié' },
        { status: 400 }
      );
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: 'Messages manquants' },
        { status: 400 }
      );
    }

    const apiUrl = `${ollamaUrl}/api/chat`;
    console.log('Calling Ollama API:', apiUrl);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: stream,
        think,
      }),
    });

    console.log('Ollama API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Ollama API error:', errorText);
      
      return NextResponse.json(
        { 
          error: `Erreur Ollama: ${errorText}`,
          status: response.status,
        },
        { status: response.status }
      );
    }

    // Si streaming désactivé, retourner la réponse complète
    if (!stream) {
      const data = await response.json();
      return NextResponse.json({
        content: [{ text: data.message?.content || '' }],
        usage: {
          input_tokens: data.prompt_eval_count || 0,
          output_tokens: data.eval_count || 0,
        },
      });
    }

    // Streaming : traiter chaque ligne du Stream Ollama et la reformater
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    
    const readableStream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        try {
          let buffer = '';
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            // Décoder le chunk
            buffer += decoder.decode(value, { stream: true });
            
            // Traiter chaque ligne complète
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Garder la dernière ligne incomplète
            
            for (const line of lines) {
              if (!line.trim()) continue;
              
              try {
                const data = JSON.parse(line);
                
                // Ollama format: { message: { content: "..." }, done: false }
                if (data.message?.content) {
                  // Reformater au format SSE compatible avec Claude
                  const sseEvent = {
                    type: 'content_block_delta',
                    delta: {
                      type: 'text_delta',
                      text: data.message.content,
                    },
                  };
                  
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify(sseEvent)}\n\n`)
                  );
                }
                
                // Dernier message avec statistiques
                if (data.done) {
                  const doneEvent = {
                    type: 'message_done',
                    usage: {
                      input_tokens: data.prompt_eval_count || 0,
                      output_tokens: data.eval_count || 0,
                    },
                  };
                  
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify(doneEvent)}\n\n`)
                  );
                }
              } catch (e) {
                console.error('Error parsing Ollama stream line:', e);
              }
            }
          }
        } catch (error) {
          console.error('Ollama stream error:', error);
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

  } catch (error: any) {
    console.error('Ollama API error:', error);
    return NextResponse.json(
      { error: error.message || 'Erreur de connexion à Ollama' },
      { status: 500 }
    );
  }
}
