import puppeteer from 'puppeteer';
import { setupStealthMode, stealthLaunchOptions } from './utils/stealth.js';
import { humanLikeType, moveMouse, randomDelay } from './utils/human-behavior.js';
import { loadCookies, saveCookies, validateSession, COOKIES_PATH } from './utils/cookie-manager.js';

async function login() {
  const browser = await puppeteer.launch({
    headless: process.env.PUPPETEER_HEADLESS === 'true',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: stealthLaunchOptions.args
  });

  try {
    const page = await browser.newPage();
    
    await setupStealthMode(page);
    
    await page.setViewport({ width: 1280, height: 800 });
    
    const cookiesLoaded = await loadCookies(page);
    
    if (cookiesLoaded) {
      console.log('[LOGIN] Checking existing session...');
      const sessionValid = await validateSession(page);
      
      if (sessionValid) {
        console.log('[LOGIN] Session valid, already logged in');
        return {
          status: 'success',
          message: 'Already logged in with existing session',
          sessionValid: true,
          cookiesPath: COOKIES_PATH
        };
      }
    }
    
    console.log('[LOGIN] Navigating to LinkedIn login page...');
    await page.goto('https://www.linkedin.com/login', {
      waitUntil: 'networkidle2'
    });
    
    await page.waitForTimeout(randomDelay(2000, 4000));
    await moveMouse(page);
    
    const email = process.env.LINKEDIN_EMAIL;
    const password = process.env.LINKEDIN_PASSWORD;
    
    if (!email || !password) {
      throw new Error('LinkedIn credentials not found in environment variables');
    }
    
    console.log('[LOGIN] Entering credentials...');
    await humanLikeType(page, '#username', email);
    
    await page.waitForTimeout(randomDelay(1000, 2000));
    await moveMouse(page);
    
    await humanLikeType(page, '#password', password);
    
    await page.waitForTimeout(randomDelay(1000, 2000));
    
    console.log('[LOGIN] Submitting login form...');
    await page.click('button[type="submit"]');
    
    console.log('[LOGIN] Waiting for login to process...');
    await page.waitForTimeout(randomDelay(3000, 5000));
    
    try {
      // Wait for login form to disappear OR checkpoint to appear
      await Promise.race([
        page.waitForSelector('#username', { hidden: true, timeout: 15000 }),
        page.waitForSelector('[data-js-module-id="challenge"]', { timeout: 15000 }),
        page.waitForTimeout(15000)
      ]);
      
      const currentUrl = await page.url();
      
      // Check for security checkpoint
      if (currentUrl.includes('/checkpoint/') || await page.$('[data-js-module-id="challenge"]')) {
        console.log('[LOGIN] Security checkpoint detected');
        await saveCookies(page);
        return {
          status: 'error',
          message: 'Security checkpoint detected - manual intervention required',
          errorType: 'captcha',
          requiresManualIntervention: true
        };
      }
      
      // Check if login form disappeared (successful login)
      const hasLoginForm = await page.$('#username');
      if (!hasLoginForm || !currentUrl.includes('/login')) {
        console.log('[LOGIN] Login appears successful, saving session...');
        await saveCookies(page);
        return {
          status: 'success',
          message: 'Successfully logged in to LinkedIn',
          sessionValid: true,
          cookiesPath: COOKIES_PATH
        };
      }
      
      // Fallback: save cookies anyway for manual verification
      console.log('[LOGIN] Login state unclear, saving cookies...');
      await saveCookies(page);
      return {
        status: 'error',
        message: 'Login state unclear',
        errorType: 'unknown',
        requiresManualIntervention: true
      };
      
    } catch (error) {
      console.log('[LOGIN] Login processing error, saving cookies anyway...');
      await saveCookies(page);
      return {
        status: 'error',
        message: `Login processing failed: ${error.message}`,
        errorType: 'unknown',
        requiresManualIntervention: false
      };
    }
    
    return {
      status: 'success',
      message: 'Successfully logged in to LinkedIn',
      sessionValid: true,
      cookiesPath: COOKIES_PATH
    };
    
  } catch (error) {
    console.error('Error during login:', error.message);
    return {
      status: 'error',
      message: error.message,
      errorType: 'unknown',
      requiresManualIntervention: false
    };
  } finally {
    await browser.close();
  }
}

login().then(result => {
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === 'success' ? 0 : 1);
});
