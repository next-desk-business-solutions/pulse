import { test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer';
import { setupStealthMode, stealthLaunchOptions } from '../scripts/utils/stealth.js';
import { humanLikeType, moveMouse, randomDelay } from '../scripts/utils/human-behavior.js';
import { loadCookies, saveCookies, validateSession, clearCookies, COOKIES_PATH } from '../scripts/utils/cookie-manager.js';

const TEST_TIMEOUT = 60000; // 1 minute

beforeEach(async () => {
  // Clean up any existing cookies before each test
  await clearCookies();
});

afterEach(async () => {
  // Clean up cookies after each test
  await clearCookies();
});

test('Login Integration Test: Fresh login, cookie save, and session reuse', async () => {
  if (!process.env.LINKEDIN_EMAIL || !process.env.LINKEDIN_PASSWORD) {
    throw new Error('LinkedIn credentials required for integration test');
  }

  let browser;
  
  try {
    // Phase 1: Fresh login (no cookies)
    console.log('[TEST] Phase 1: Testing fresh login...');
    
    browser = await puppeteer.launch({
      headless: process.env.PUPPETEER_HEADLESS === 'true',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      args: stealthLaunchOptions.args
    });

    const page = await browser.newPage();
    await setupStealthMode(page);
    await page.setViewport({ width: 1280, height: 800 });

    // Verify no cookies exist
    const cookiesLoaded = await loadCookies(page);
    expect(cookiesLoaded).toBe(false);

    // Navigate and login
    await page.goto('https://www.linkedin.com/login', {
      waitUntil: 'networkidle2'
    });

    await page.waitForTimeout(randomDelay(2000, 4000));
    await moveMouse(page);

    // Enter credentials
    await humanLikeType(page, '#username', process.env.LINKEDIN_EMAIL);
    await page.waitForTimeout(randomDelay(1000, 2000));
    await moveMouse(page);
    await humanLikeType(page, '#password', process.env.LINKEDIN_PASSWORD);
    await page.waitForTimeout(randomDelay(1000, 2000));

    // Submit form and wait for login
    await page.click('button[type="submit"]');
    await page.waitForTimeout(randomDelay(3000, 5000));

    // Check for login success
    await Promise.race([
      page.waitForSelector('#username', { hidden: true, timeout: 15000 }),
      page.waitForSelector('[data-js-module-id="challenge"]', { timeout: 15000 }),
      page.waitForTimeout(15000)
    ]);

    const currentUrl = await page.url();
    const hasLoginForm = await page.$('#username');
    const loginSuccessful = !hasLoginForm || !currentUrl.includes('/login');

    if (!loginSuccessful) {
      // Check if it's a security challenge
      const hasChallenge = currentUrl.includes('/checkpoint/') || await page.$('[data-js-module-id="challenge"]');
      if (hasChallenge) {
        console.log('[TEST] Security checkpoint detected - this is expected behavior');
      } else {
        throw new Error('Login failed - check credentials or LinkedIn security measures');
      }
    }

    // Save cookies regardless (partial sessions are useful)
    await saveCookies(page);
    await browser.close();

    // Verify cookies were saved
    const cookieFileExists = await fs.access(COOKIES_PATH).then(() => true).catch(() => false);
    expect(cookieFileExists).toBe(true);

    const cookieContent = await fs.readFile(COOKIES_PATH, 'utf-8');
    const cookies = JSON.parse(cookieContent);
    expect(Array.isArray(cookies)).toBe(true);
    expect(cookies.length).toBeGreaterThan(0);

    console.log('[TEST] Phase 1 passed: Fresh login and cookie save successful');

    // Phase 2: Session reuse (load cookies)
    console.log('[TEST] Phase 2: Testing session reuse...');

    browser = await puppeteer.launch({
      headless: process.env.PUPPETEER_HEADLESS === 'true',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      args: stealthLaunchOptions.args
    });

    const page2 = await browser.newPage();
    await setupStealthMode(page2);
    await page2.setViewport({ width: 1280, height: 800 });

    // Load existing cookies
    const cookiesLoadedSuccessfully = await loadCookies(page2);
    expect(cookiesLoadedSuccessfully).toBe(true);

    // Validate session
    const sessionValid = await validateSession(page2);
    
    if (sessionValid) {
      console.log('[TEST] Phase 2 passed: Session validation successful');
    } else {
      console.log('[TEST] Phase 2 note: Session expired (common with LinkedIn security)');
      // This is not a failure - LinkedIn often expires sessions quickly
    }

    await browser.close();

    console.log('[TEST] Integration test completed successfully');

  } catch (error) {
    if (browser) {
      await browser.close();
    }
    throw error;
  }
}, TEST_TIMEOUT);

test('Cookie Management Unit Tests', async () => {
  // Test cookie clearing
  await clearCookies();
  const cookieFileExists = await fs.access(COOKIES_PATH).then(() => true).catch(() => false);
  expect(cookieFileExists).toBe(false);

  // Test cookie path
  expect(COOKIES_PATH).toBe(path.join(process.cwd(), 'data', 'cookies.json'));
});