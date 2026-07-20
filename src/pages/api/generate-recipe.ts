import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const ADMIN_PASSWORD = import.meta.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
  const ANTHROPIC_API_KEY = import.meta.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;

  const auth = request.headers.get('Authorization');
  if (!auth || auth !== `Bearer ${ADMIN_PASSWORD}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured on server' }), { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON in request body' }), { status: 400 });
  }
  const { title, ingredientsText, mediaFiles, baseServings } = body;

  // Build prompt for Claude
  const prompt = `You are a professional chef and nutritionist specializing in traditional Pugliese cuisine.

Given this recipe information, generate structured data in JSON format.

Recipe title: ${title}
Base servings: ${baseServings || 4}
Ingredients (raw text from the user):
${ingredientsText}

Media files uploaded (generate captions for each):
${mediaFiles?.map((f: any, i: number) => `${i + 1}. ${f.filename} (${f.type})`).join('\n') || 'None yet'}

Generate a JSON object with these fields:

1. "ingredients": array of objects with { "qty": number|null, "unit": string, "name": string }
   - Parse the raw text into structured ingredients
   - qty should be a number (e.g., 1.5) or null for "to taste"
   - unit should be: "g", "kg", "ml", "l", "tbsp", "tsp", "clove", "" (empty for count items)
   - name should be the ingredient name in English

2. "mediaCaptions": array of strings, one caption per media file (short, descriptive, in English)

3. "nutrition": object with:
   - "calories": number (kcal per serving)
   - "protein": number (grams)
   - "carbs": number (grams)
   - "fat": number (grams)
   - "detail": array of { "name": string, "value": string, "sub": boolean? }
     Include: Calories, Total Fat, Saturated Fat (sub), Monounsaturated Fat (sub), Carbohydrates, Dietary Fibre (sub), Sugars (sub), Protein, Sodium, and relevant vitamins/minerals with %DV

4. "healthBenefits": array of 4-6 objects with { "icon": string (emoji), "title": string, "text": string }
   - Focus on specific health benefits of the key ingredients in this recipe
   - Be factual and concise

Return ONLY valid JSON, no markdown, no explanation.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 4000,
        thinking: { type: 'disabled' },
        messages: [
          { role: 'user', content: prompt },
          { role: 'assistant', content: '{' }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: `AI API error (${response.status}): ${errText}` }), { status: 500 });
    }

    const result = await response.json();
    // Handle thinking models: find the text block (not thinking block)
    const textBlock = result.content?.find((b: any) => b.type === 'text');
    const text = textBlock?.text || result.content?.[0]?.text || '';

    // Parse the JSON from Claude's response (prefilled with '{')
    const fullJson = '{' + text;
    let generated;
    try {
      generated = JSON.parse(fullJson);
    } catch {
      // Try to extract JSON from the combined text
      const searchText = fullJson + '\n' + text;
      const codeBlockMatch = searchText.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonMatch = searchText.match(/\{[\s\S]*\}/);
      if (codeBlockMatch) {
        try { generated = JSON.parse(codeBlockMatch[1].trim()); } catch {
          return new Response(JSON.stringify({ error: 'Failed to parse AI JSON', raw: fullJson.substring(0, 800) }), { status: 500 });
        }
      } else if (jsonMatch) {
        try { generated = JSON.parse(jsonMatch[0]); } catch {
          return new Response(JSON.stringify({ error: 'Failed to parse extracted JSON', raw: fullJson.substring(0, 800) }), { status: 500 });
        }
      } else {
        return new Response(JSON.stringify({ error: 'No JSON found in AI response', raw: fullJson.substring(0, 800) }), { status: 500 });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      generated,
      _aiGenerated: {
        mediaCaptions: true,
        ingredients: true,
        nutrition: true,
        healthBenefits: true,
        lastGenerated: new Date().toISOString()
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Server error', message: err.message }), { status: 500 });
  }
};
