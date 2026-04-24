/**
 * parser.js - WhatsApp Command Parser
 * Extracts contact name and message from user input
 */

/**
 * Parse a natural language WhatsApp command
 * Example: "Send WhatsApp message to Rahul: Hello bro"
 * @param {string} input - Raw user command
 * @returns {{ name: string, message: string } | null}
 */
function parseWhatsAppCommand(input) {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim();

  // Pattern 1: "send whatsapp message to NAME: MESSAGE"
  // Pattern 2: "message NAME: MESSAGE"
  // Pattern 3: "send to NAME: MESSAGE"
  const patterns = [
    /(?:send\s+)?(?:whatsapp\s+)?(?:message|msg)\s+(?:to\s+)?([^:]+):\s*(.+)/i,
    /(?:send\s+)?(?:to\s+)([^:]+):\s*(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      return {
        name: match[1].trim(),
        message: match[2].trim(),
      };
    }
  }

  return null;
}

/**
 * Parse direct name + message from object input
 * @param {string} name
 * @param {string} message
 */
function buildCommand(name, message) {
  return { name: name?.trim(), message: message?.trim() };
}

module.exports = { parseWhatsAppCommand, buildCommand };
