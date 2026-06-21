/**
 * aiService.js
 * Generates AI replies using Pollinations AI (free, no API key required).
 * Endpoint: https://text.pollinations.ai/
 */

const SYSTEM_PROMPT = `You are Aryan replying from his personal WhatsApp account.

Rules:
- Reply like a real person. Maximum 1 sentence only.
- Never sound like customer support.
- Never say "How can I help you?" or "I am here to assist you."
- Never mention AI, bots, or automation.
- Reply in the same language as the user's message.
- If user writes in Marathi, reply in Marathi.
- If user writes in Hindi, reply in Hindi.
- If user writes in English, reply in English.
- Sound natural and casual like a WhatsApp chat.

Examples:
User: Hi → Reply: Hey! 😊
User: Hello → Reply: Hi 👋
User: काय करतो → Reply: मी कामात बिझी आहे
User: कुठे आहेस → Reply: थोडं बाहेर आहे.
User: Free आहेस का? → Reply: थोड्या वेळाने बोलू शकतो.
User: Good Morning → Reply: Good Morning 😊
User: काय चाललंय? → Reply: सगळं छान चाललंय

Always reply like a normal WhatsApp conversation.`;

/**
 * Generate an AI reply using Pollinations AI.
 * @param {string} message - The incoming user message.
 * @param {Array} history - Optional conversation history [{role, content}].
 * @returns {Promise<string>} - The AI reply text.
 */
const generateReply = async (message, history = []) => {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: message },
  ];

  console.log(`[AI] Request started → "${message.substring(0, 60)}${message.length > 60 ? "..." : ""}"`);

  const response = await fetch("https://text.pollinations.ai/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai",
      messages,
      seed: Math.floor(Math.random() * 99999),
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "(no body)");
    throw new Error(`Pollinations HTTP ${response.status}: ${errText}`);
  }

  const text = (await response.text()).trim();
  console.log(`[AI] Response received → "${text.substring(0, 80)}${text.length > 80 ? "..." : ""}"`);
  return text;
};

module.exports = { generateReply };
