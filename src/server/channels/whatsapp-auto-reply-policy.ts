// Deterministic, provider-neutral Codeedge draft policy. This module never sends.
export type WhatsAppAutoReplyDecision =
  | { action: "draft"; suggestion: string }
  | { action: "opt_out" | "human_requested"; suggestion: "" };

const replies: { test: RegExp; answer: string }[] = [
  { test: /\b(how much|price|pricing|cost|rate|charges|package|quote|kitna|paisa)\b/i,
    answer: "Pricing depends on your requirements, so we do not quote a fixed amount without details. Which service do you need, and what is your approximate budget?" },
  { test: /\b(website|web\s?site|webpage|site|landing page)\b/i,
    answer: "Codeedge builds professional mobile-friendly websites with enquiry capture. What type of business is your website for?" },
  { test: /\b(tiktok|instagram|reels|shorts|social media|content|video)\b/i,
    answer: "Codeedge helps businesses with TikTok, Instagram Reels and social content. Which platform would you like to grow?" },
  { test: /\b(seo|google|search ranking|maps|business profile|local search)\b/i,
    answer: "Codeedge provides local SEO, Google Business Profile support and website optimisation. What is your business name and location?" },
  { test: /\b(whatsapp|automation|ai|chatbot|receptionist|auto.reply)\b/i,
    answer: "Codeedge helps with WhatsApp enquiries and AI-assisted follow-up. What would you like to automate?" },
  { test: /\b(hello|hi|hey|salam|assalam|aoa|start)\b/i,
    answer: "Welcome to Codeedge! We help with websites, social media, SEO and automation. What would you like help with today?" },
];

export function decideWhatsAppAutoReply(text: string): WhatsAppAutoReplyDecision {
  const trimmed = text.trim();
  if (/^(stop|unsubscribe|do not message|band karo)$/i.test(trimmed)) {
    return { action: "opt_out", suggestion: "" };
  }
  if (/\b(human|person|agent|staff|representative|real person)\b/i.test(trimmed)) {
    return { action: "human_requested", suggestion: "" };
  }
  const suggestion = replies.find(({ test }) => test.test(trimmed))?.answer
    ?? "Thank you for contacting Codeedge. What kind of business do you run, and how may we help?";
  return { action: "draft", suggestion };
}
