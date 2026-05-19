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
      "title": "Track title (major subject area or learning path)",
      "description": "What this track covers",
      "modules": [
        {
          "title": "Module title (themed grouping of related topics)",
          "description": "What this module covers",
          "units": [
            {
              "title": "Unit title (a focused topic)",
              "description": "What learners will study in this unit",
              "lessons": [
                {
                  "title": "Lesson title (a single session)",
                  "content": "Key points, notes, or content for this lesson"
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}

Hierarchy rules:
- Track = a major learning path or subject area (e.g., "Frontend Development", "Data Analysis")
- Module = a themed group of related units within a track (e.g., "HTML & CSS Basics")
- Unit = a focused topic within a module (e.g., "Box Model & Layout")
- Lesson = a single class session within a unit (e.g., "Understanding Flexbox")

Extract ALL relevant content from the document. If the document is already structured (has chapters, topics, weeks), map them to this hierarchy logically.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const instructions = (formData.get('instructions') as string | null) || '';

    if (!file) throw new Error('No file provided');

    const suffix = instructions.trim()
      ? `\n\nAdditional instructions from the tutor: ${instructions.trim()}`
      : '';

    let messageContent: unknown[];

    const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');

    if (isPdf) {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);

      messageContent = [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        },
        {
          type: 'text',
          text: `Convert this document into a structured curriculum JSON.${suffix}`,
        },
      ];
    } else {
      const text = await file.text();
      if (!text.trim()) throw new Error('File appears to be empty');
      messageContent = [
        {
          type: 'text',
          text: `Document content:\n\n${text}\n\nConvert this into a structured curriculum JSON.${suffix}`,
        },
      ];
    }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: messageContent }],
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      throw new Error(`Anthropic API error ${anthropicRes.status}: ${err}`);
    }

    const anthropicData = await anthropicRes.json();
    const rawText = (anthropicData.content?.[0] as { text: string })?.text || '';

    // Strip any accidental markdown fences
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const structure = JSON.parse(cleaned);

    return new Response(JSON.stringify({ structure }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
