import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export default async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
  const origin = req.headers.origin;
  const corsOrigin =
    allowedOrigin === '*' ? '*' : origin === allowedOrigin ? origin : '';

  res.setHeader('Access-Control-Allow-Origin', corsOrigin || allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, weekLabel, categories, tasks, habits } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'Missing action' });
  }

  try {
    if (action === 'weekly_review') {
      if (!tasks && !habits) {
        return res.status(400).json({ error: 'No week data provided' });
      }

      // The client pre-aggregates the week. `categories` is a list of
      // { name, done, total, titles }, `habits` is a list of { name, completed, total }.
      const categoryLines = (categories || [])
        .map(
          (c) =>
            `- ${c.name}: ${c.done}/${c.total} tasks done` +
            (c.titles && c.titles.length ? ` — ${c.titles.join(', ')}` : '')
        )
        .join('\n');

      const habitLines = (habits || [])
        .map((h) => `- ${h.name}: completed ${h.completed}/${h.total} days`)
        .join('\n');

      const taskTotals = (tasks && tasks.total) || 0;
      const taskDone = (tasks && tasks.done) || 0;

      const userContent = `Week: ${weekLabel || 'this week'}

Tasks overall: ${taskDone}/${taskTotals} completed

Tasks by category:
${categoryLines || '(no tasks planned this week)'}

Habits:
${habitLines || '(no habits tracked this week)'}

Review how this week went and give me concrete, specific adjustments for next week.`;

      const stream = client.messages.stream({
        model: 'claude-opus-4-6',
        max_tokens: 1024,
        system: `You are a thoughtful, encouraging weekly planning coach. You review how someone's week went based on their planned tasks (and how many they completed), how those tasks were spread across life categories, and their habit consistency. A low completion rate is not a failure — it usually means the week was over-planned, priorities shifted, or energy went elsewhere; reflect that with warmth rather than judgment. Be specific and grounded in the actual numbers and task titles provided. Avoid generic platitudes.

Respond ONLY with valid JSON in this exact format — no markdown, no code blocks, just raw JSON:
{
  "summary": "<2-3 sentence read on how the week went overall>",
  "wins": ["<1-3 specific things that went well, grounded in the data>"],
  "challenges": ["<1-3 specific struggles, e.g. a neglected category or a dropped habit>"],
  "categoryBalance": "<2-3 sentences on which categories got attention vs were neglected>",
  "habitInsights": ["<1-3 observations about habit consistency>"],
  "suggestions": ["<2-4 concrete, actionable adjustments for next week's plan>"]
}`,
        messages: [{ role: 'user', content: userContent }],
      });

      const response = await stream.finalMessage();
      const text = response.content[0].text.trim();

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('No JSON found in weekly_review response:', text);
        return res.status(500).json({ error: 'Invalid AI response format' });
      }

      const data = JSON.parse(jsonMatch[0]);
      return res.status(200).json(data);
    } else {
      return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error) {
    console.error('Claude API error:', error);
    return res.status(500).json({ error: 'AI service error. Please try again.' });
  }
}
