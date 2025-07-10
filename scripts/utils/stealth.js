export async function setupStealthMode(page) {
  await page.evaluateOnNewDocument(() => {
    delete navigator.__proto__.webdriver;
  });

  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // Grant clipboard permissions using browser context
  const context = page.browser().defaultBrowserContext();
  await context.overridePermissions('https://www.linkedin.com', ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  await context.overridePermissions('https://linkedin.com', ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'plugins', { 
      get: () => [1, 2, 3, 4, 5] 
    });
    
    Object.defineProperty(navigator, 'languages', { 
      get: () => ['en-US', 'en'] 
    });
    
    Object.defineProperty(navigator, 'platform', { 
      get: () => 'MacIntel' 
    });
    
    Object.defineProperty(navigator, 'hardwareConcurrency', { 
      get: () => 8 
    });
    
    Object.defineProperty(navigator, 'deviceMemory', { 
      get: () => 8 
    });
    
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => {
      if (parameters.name === 'notifications') {
        return Promise.resolve({ state: 'default' });
      } else if (parameters.name === 'clipboard-read' || parameters.name === 'clipboard-write') {
        return Promise.resolve({ state: 'granted' });
      } else {
        return originalQuery(parameters);
      }
    };
    
    window.chrome = {
      runtime: {},
    };
  });
}

export const stealthLaunchOptions = {
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-web-security',
    '--disable-features=IsolateOrigins',
    '--disable-site-isolation-trials',
    '--enable-features=VaapiVideoDecoder',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--enable-features=ClipboardAPIRead,ClipboardAPIWrite'
  ]
};