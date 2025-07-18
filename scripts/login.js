import puppeteer from 'puppeteer';
import { setupStealthMode, stealthLaunchOptions } from './utils/stealth.js';
import { humanLikeType, moveMouse, randomDelay } from './utils/human-behavior.js';
import { loadCookies, saveCookies, validateSession, COOKIES_PATH } from './utils/cookie-manager.js';
import fs from 'fs/promises';

async function login() {
  const waitForCaptcha = process.argv.includes('--wait-for-captcha');
  
  const browser = await puppeteer.launch({
    headless: process.env.PUPPETEER_HEADLESS !== 'false',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: [...stealthLaunchOptions.args, '--remote-debugging-port=9222']
  });

  try {
    const page = await browser.newPage();
    
    await setupStealthMode(page);
    
    await page.setViewport({ width: 1280, height: 800 });
    
    const cookiesLoaded = await loadCookies(page);
    
    if (cookiesLoaded) {
      console.error('[LOGIN] Checking existing session...');
      const sessionValid = await validateSession(page);
      
      if (sessionValid) {
        console.error('[LOGIN] Session valid, already logged in');
        return {
          status: 'success',
          message: 'Already logged in with existing session',
          sessionValid: true,
          cookiesPath: COOKIES_PATH
        };
      }
    }
    
    console.error('[LOGIN] Navigating to LinkedIn login page...');
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
    
    console.error('[LOGIN] Entering credentials...');
    await humanLikeType(page, '#username', email);
    
    await page.waitForTimeout(randomDelay(1000, 2000));
    await moveMouse(page);
    
    await humanLikeType(page, '#password', password);
    
    await page.waitForTimeout(randomDelay(1000, 2000));
    
    console.error('[LOGIN] Submitting login form...');
    await page.click('button[type="submit"]');
    
    console.error('[LOGIN] Waiting for login to process...');
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
        console.error('[LOGIN] Security checkpoint detected');
        
        // Take screenshot for Slack notification
        const screenshotPath = `/data/captcha-${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        
        // Save browser endpoint for reconnection
        const wsEndpoint = browser.wsEndpoint();
        const sessionFile = '/data/browser-session.json';
        await fs.writeFile(sessionFile, JSON.stringify({
          wsEndpoint,
          pageUrl: currentUrl,
          timestamp: Date.now()
        }));
        
        await saveCookies(page);
        
        // If not waiting for CAPTCHA, return immediately for n8n notification
        if (!waitForCaptcha) {
          return {
            status: 'captcha_detected',
            message: 'CAPTCHA detected - manual intervention required',
            errorType: 'captcha',
            requiresManualIntervention: true,
            screenshotPath,
            debuggingPort: 9222,
            instructions: 'SSH tunnel: ssh -L 9222:localhost:9222 your-server, then open chrome://inspect',
            sessionFile,
            nextCommand: 'Run again with --wait-for-captcha flag after starting manual resolution'
          };
        }
        
        // Wait mode: actively wait for CAPTCHA completion
        console.error('[LOGIN] Waiting for manual CAPTCHA completion...');
        console.error('[LOGIN] SSH tunnel: ssh -L 9222:localhost:9222 your-server');
        console.error('[LOGIN] Then open chrome://inspect to complete CAPTCHA');
        
        let captchaPresent = true;
        let checkCount = 0;
        const maxChecks = 240; // 20 minutes max wait
        
        while (captchaPresent && checkCount < maxChecks) {
          await page.waitForTimeout(5000);
          
          const currentCheckUrl = await page.url();
          const stillOnCheckpoint = currentCheckUrl.includes('/checkpoint/');
          const challengeElement = await page.$('[data-js-module-id="challenge"]');
          
          captchaPresent = stillOnCheckpoint || challengeElement !== null;
          
          if (!captchaPresent) {
            console.error('[LOGIN] CAPTCHA completed!');
            break;
          }
          
          checkCount++;
          if (checkCount % 12 === 0) {
            console.error(`[LOGIN] Still waiting... (${checkCount * 5 / 60} minutes elapsed)`);
          }
        }
        
        if (checkCount >= maxChecks) {
          await fs.unlink('/data/browser-session.json').catch(() => {});
          return {
            status: 'error',
            message: 'CAPTCHA timeout - exceeded 20 minutes',
            errorType: 'captcha_timeout'
          };
        }
        
        // CAPTCHA completed, save cookies
        await saveCookies(page);
        await fs.unlink('/data/browser-session.json').catch(() => {});
        
        const finalUrl = await page.url();
        if (!finalUrl.includes('/login') && !finalUrl.includes('/checkpoint/')) {
          return {
            status: 'success',
            message: 'Successfully logged in after CAPTCHA',
            sessionValid: true,
            cookiesPath: COOKIES_PATH
          };
        }
      }
      
      // Check if login form disappeared (successful login)
      const hasLoginForm = await page.$('#username');
      if (!hasLoginForm || !currentUrl.includes('/login')) {
        console.error('[LOGIN] Login appears successful, saving session...');
        await saveCookies(page);
        return {
          status: 'success',
          message: 'Successfully logged in to LinkedIn',
          sessionValid: true,
          cookiesPath: COOKIES_PATH
        };
      }
      
      // Fallback: save cookies anyway for manual verification
      console.error('[LOGIN] Login state unclear, saving cookies...');
      await saveCookies(page);
      return {
        status: 'error',
        message: 'Login state unclear',
        errorType: 'unknown',
        requiresManualIntervention: true
      };
      
    } catch (error) {
      console.error('[LOGIN] Login processing error, saving cookies anyway...');
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
  process.exit(0);
});
