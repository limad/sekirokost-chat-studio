import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

// Liste les modèles réellement présents sur le serveur Ollama (GET {ollamaUrl}/api/tags)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ollamaUrl = typeof body.ollamaUrl === 'string' ? body.ollamaUrl.trim() : '';
    if (!ollamaUrl) {
      return NextResponse.json({ error: 'URL Ollama manquante' }, { status: 400 });
    }

    const response = await fetch(`${ollamaUrl.replace(/\/+$/, '')}/api/tags`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: `Ollama a répondu ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const models = (data.models || []).map((m: any) => ({
      id: m.name,
      size: m.size || 0,
      parameterSize: m.details?.parameter_size || '',
      thinking: Array.isArray(m.capabilities) && m.capabilities.includes('thinking'),
    }));
    return NextResponse.json({ models });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Impossible de joindre Ollama : ${error?.message || 'erreur inconnue'}` },
      { status: 502 }
    );
  }
}
