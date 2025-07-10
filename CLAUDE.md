# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LinkedIn Lead Warmer is an automation tool for warming up leads through a 3-phase LinkedIn engagement workflow. The scripts are called by n8n workflows and must incorporate robust anti-bot detection measures.

## Development Commands

```bash
# Install dependencies
bun install

# Run scripts (called by n8n in production)
bun run login          # Authenticate with LinkedIn
bun run view-profile   # View LinkedIn profiles
bun run engage-post    # Engage with LinkedIn posts
```

## Critical Anti-Bot Requirements

**EVERY Puppeteer script MUST include these anti-detection measures:**

1. **Stealth Configuration**
```javascript
// Remove automation indicators
await page.evaluateOnNewDocument(() => {
  delete navigator.__proto__.webdriver;
});

// Set realistic user agent
await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

// Override automation properties
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
});
```

2. **Human-like Behavior**
- Random delays between actions (2-7 seconds)
- Curved mouse movements using Bezier curves
- Typing with variable speed (50-150ms between keystrokes)
- Random scrolling and viewport interactions
- Occasional mouse movements without clicks

3. **Session Management**
- Store cookies in `/data/cookies.json`
- Reuse existing sessions when valid
- Implement session validation before each action

## Architecture

### Script Responsibilities
- **Puppeteer scripts**: ONLY handle browser automation
- **n8n workflows**: ALL business logic, orchestration, error handling
- **PostgreSQL**: State management and tracking
- **Cookie storage**: Shared between scripts for session persistence

### Integration Flow
1. n8n calls scripts with specific parameters
2. Scripts return structured JSON responses
3. Scripts handle only browser interactions
4. n8n manages retries, timing, and workflow logic

### Error Response Format
```json
{
  "status": "error",
  "message": "Descriptive error message",
  "errorType": "session_expired|rate_limit|captcha|network|unknown",
  "requiresManualIntervention": true|false
}
```

## LinkedIn-Specific Considerations

1. **Rate Limiting**: Implement exponential backoff
2. **Session Validation**: Check for login state before actions
3. **CAPTCHA Detection**: Return specific error for manual resolution
4. **Profile View Limits**: Track daily view counts externally (n8n)
5. **Content Generation**: Use varied, contextual messages (handled by n8n + LLM)