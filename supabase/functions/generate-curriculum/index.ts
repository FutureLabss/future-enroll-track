const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are an expert curriculum designer for a tech and coding academy.

Your task is to convert the provided document into a structured learning curriculum.

Return ONLY a valid JSON object (no markdown, no explanation, no code fences) with this exact structure:
{
  "title": "Curriculum title derived from the document",
  "description": "1-2 sentence summary of what this curriculum covers",
  "tracks": [
    {
      "title": "Track title",
      "description": "What this track covers",
      "modules": [
        {
          "title": "Module title",
          "description": "What this module covers",
          "units": [
            {
              "title": "Unit title",
              "description": "What learners will study",
              "lessons": [
                { "title": "Lesson title", "content": "Key points or notes" }
              ]
            }
          ]
        }
      ]
    }
  ]
}

Hierarchy: Track > Module > Unit > Lesson. Extract ALL relevant content. Map existing structure (chapters, weeks, topics) logically.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) throw new Error('LOVABLE_API_KEY not configured');

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const instructions = (formData.get('instructions') as string | null) || '';

    if (!file) throw new Error('No file provided');

    const suffix = instructions.trim()
      ? `\n\nAdditional instructions from the tutor: ${instructions.trim()}`
      : '';

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    // Build user content. Lovable AI Gateway (OpenAI-compatible) accepts
    // text + file blocks for PDFs and plain text for other formats.
    let userContent: unknown;

    if (isPdf) {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
      }
      const base64 = btoa(binary);

      userContent = [
        {
          type: 'file',
          file: {
            filename: file.name || 'document.pdf',
            file_data: `data:application/pdf;base64,${base64}`,
          },
        },
        {
          type: 'text',
          text: `Convert this document into a structured curriculum JSON.${suffix}`,
        },
      ];
    } else {
      const text = await file.text();
      if (!text.trim()) throw new Error('File appears to be empty');
      userContent = `Document content:\n\n${text}\n\nConvert this into a structured curriculum JSON.${suffix}`;
    }

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit reached. Try again in a moment.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Add credits to continue.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI gateway error ${aiRes.status}: ${err}`);
    }

    const aiData = await aiRes.json();
    const rawText: string = aiData.choices?.[0]?.message?.content || '';
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let structure: unknown;
    try {
      structure = JSON.parse(cleaned);
    } catch {
      throw new Error('AI returned invalid JSON. Try again or refine your instructions.');
    }

    return new Response(JSON.stringify({ structure }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('generate-curriculum error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
