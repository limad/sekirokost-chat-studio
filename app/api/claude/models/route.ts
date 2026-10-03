import type { NextRequest } from 'next/server';

export const runtime = 'edge';

// Liste les modèles disponibles pour la clé API (GET {apiUrl}/models)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    const apiUrl = (typeof body.apiUrl === 'string' && body.apiUrl.trim()
      ? body.apiUrl.trim()
      : 'https://api.anthropic.com/v1'
    ).replace(/\/+$/, '');

    if (!apiKey) {
      return Response.json({ error: 'Clé API manquante' }, { status: 400 });
    }

    const response = await fetch(`${apiUrl}/models?limit=100`, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return Response.json(
        { error: data.error?.message || `Erreur ${response.status}` },
        { status: response.status }
      );
    }

    const models = (data.data || []).map((m: any) => ({
      id: m.id,
      name: m.display_name || m.id,
    }));
    return Response.json({ models });
  } catch (error: any) {
    return Response.json(
      { error: `Impossible de joindre l'API : ${error?.message || 'erreur inconnue'}` },
      { status: 502 }
    );
  }
}
