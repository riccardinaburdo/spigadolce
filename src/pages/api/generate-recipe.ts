import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';

export const prerender = false;

// Schema the model must fill in. With output_config the response is guaranteed
// to be valid JSON matching this shape, so no parsing fallbacks are needed.
const RECIPE_SCHEMA = {
  type: 'object',
  properties: {
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          qty: { type: ['number', 'null'] },
          unit: { type: 'string', enum: ['g', 'kg', 'ml', 'l', 'tbsp', 'tsp', 'clove', ''] },
          name: { type: 'string' }
        },
        required: ['qty', 'unit', 'name'],
        additionalProperties: false
      }
    },
    mediaCaptions: {
      type: 'array',
      items: { type: 'string' }
    },
    nutrition: {
      type: 'object',
      properties: {
        calories: { type: 'number' },
        protein: { type: 'number' },
        carbs: { type: 'number' },
        fat: { type: 'number' },
        detail: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              value: { type: 'string' },
              sub: { type: 'boolean' }
            },
            required: ['name', 'value', 'sub'],
            additionalProperties: false
          }
        }
      },
      required: ['calories', 'protein', 'carbs', 'fat', 'detail'],
      additionalProperties: false
    },
    healthBenefits: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          icon: { type: 'string' },
          title: { type: 'string' },
          text: { type: 'string' }
        },
        required: ['icon', 'title', 'text'],
        additionalProperties: false
      }
    }
  },
  required: ['ingredients', 'mediaCaptions', 'nutrition', 'healthBenefits'],
  additionalProperties: false
};

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
  const { title, ingredientsText, preparationText, mediaFiles, baseServings } = body;

  const prompt = `You are a professional chef and nutritionist specializing in traditional Pugliese cuisine.

Given this recipe information, generate structured data.

Recipe title: ${title}
Base servings: ${baseServings || 4}
Ingredients (raw text from the user):
${ingredientsText}
${preparationText ? `\nPreparation steps:\n${preparationText}\n` : ''}
Media files uploaded (generate one caption for each — use the preparation steps to match each photo to the correct step):
${mediaFiles?.map((f: any, i: number) => `${i + 1}. ${f.filename} (${f.type})`).join('\n') || 'None yet'}

Field requirements:

1. "ingredients": parse the raw text into structured ingredients.
   - qty is a number (e.g. 1.5), or null for "to taste"
   - unit is one of: "g", "kg", "ml", "l", "tbsp", "tsp", "clove", "" (empty for count items)
   - name is the ingredient name in English

2. "mediaCaptions": exactly ${mediaFiles?.length || 0} captions, one per media file, in the same order.
   - Each caption is the corresponding preparation step translated into English
   - Photo 1 = step 1, photo 2 = step 2, and so on
   - Keep the translation faithful to the original text
   - If there are more photos than steps, describe what the remaining photos likely show based on context

3. "nutrition": per serving. In "detail" include Calories, Total Fat, Saturated Fat (sub: true),
   Monounsaturated Fat (sub: true), Carbohydrates, Dietary Fibre (sub: true), Sugars (sub: true),
   Protein, Sodium, and relevant vitamins/minerals with %DV. Set "sub" to false for top-level rows.

4. "healthBenefits": 4-6 entries focused on the specific health benefits of the key ingredients in
   this recipe. "icon" is a single emoji. Be factual and concise.`;

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  try {
    // Streaming keeps the request under the SDK's HTTP timeout on long generations.
    const stream = client.messages.stream({
      model: 'claude-sonnet-5',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: RECIPE_SCHEMA }
      },
      messages: [{ role: 'user', content: prompt }]
    });

    const response = await stream.finalMessage();

    if (response.stop_reason === 'max_tokens') {
      return new Response(JSON.stringify({
        error: 'AI response was cut off before finishing. Try again, or shorten the preparation steps.'
      }), { status: 500 });
    }

    const textBlock = response.content.find((b) => b.type === 'text');
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : '';

    let generated;
    try {
      generated = JSON.parse(text);
    } catch {
      return new Response(JSON.stringify({
        error: 'AI returned malformed JSON',
        raw: text.substring(0, 800)
      }), { status: 500 });
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
    if (err instanceof Anthropic.AuthenticationError) {
      return new Response(JSON.stringify({ error: 'Anthropic API key rejected (check ANTHROPIC_API_KEY on Vercel)' }), { status: 500 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return new Response(JSON.stringify({ error: 'Anthropic rate limit reached — wait a moment and try again' }), { status: 503 });
    }
    if (err instanceof Anthropic.APIError) {
      return new Response(JSON.stringify({ error: `Anthropic API error ${err.status}: ${err.message}` }), { status: 500 });
    }
    return new Response(JSON.stringify({ error: 'Server error', message: err.message }), { status: 500 });
  }
};
