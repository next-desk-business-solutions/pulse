import puppeteer from 'puppeteer';
import { loadCookies } from '../scripts/utils/cookie-manager.js';
import { setupStealthMode, stealthLaunchOptions } from '../scripts/utils/stealth.js';

const TEST_PROFILE_URL = 'https://www.linkedin.com/in/peterolusholabello-8980bb177/';

async function runTest(testName, testFn) {
  console.log(`\n🧪 Running: ${testName}`);
  try {
    const result = await testFn();
    console.log(`✅ ${testName}: PASSED`);
    return result;
  } catch (error) {
    console.error(`❌ ${testName}: FAILED - ${error.message}`);
    throw error;
  }
}

async function testSessionValidation() {
  const browser = await puppeteer.launch({
    headless: process.env.PUPPETEER_HEADLESS === 'true',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: stealthLaunchOptions.args
  });

  const page = await browser.newPage();
  await setupStealthMode(page);
  
  const cookiesLoaded = await loadCookies(page);
  if (!cookiesLoaded) {
    throw new Error('No session cookies found');
  }
  
  await page.goto('https://www.linkedin.com/feed');
  await page.waitForTimeout(2000);
  
  const currentUrl = await page.url();
  if (currentUrl.includes('/login')) {
    throw new Error('Session expired - redirected to login');
  }
  
  await browser.close();
  return 'Session is valid';
}

async function testPostEngagement() {
  const browser = await puppeteer.launch({
    headless: process.env.PUPPETEER_HEADLESS === 'true',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: stealthLaunchOptions.args
  });

  const page = await browser.newPage();
  await setupStealthMode(page);
  await page.setViewport({ width: 1280, height: 600 });
  
  const cookiesLoaded = await loadCookies(page);
  if (!cookiesLoaded) {
    throw new Error('No session cookies found');
  }
  
  // Clear clipboard
  await page.evaluate(async () => {
    try {
      await navigator.clipboard.writeText('');
    } catch (e) {
      // Ignore
    }
  });
  
  // Navigate to activity page
  const activityUrl = `${TEST_PROFILE_URL}recent-activity/all/`;
  await page.goto(activityUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  // Check for login redirect
  const currentUrl = await page.url();
  if (currentUrl.includes('/login')) {
    throw new Error('Redirected to login page');
  }
  
  // Wait for posts to load
  await page.waitForTimeout(3000);
  
  // Find posts
  const posts = await page.$$('.feed-shared-update-v2');
  if (posts.length === 0) {
    throw new Error('No posts found on profile');
  }
  
  const post = posts[0];
  
  // Extract post content
  const postText = await page.evaluate(el => {
    const textElement = el.querySelector('.feed-shared-text__text-view, .feed-shared-update-v2__description, .feed-shared-text');
    return textElement ? textElement.textContent?.trim() : null;
  }, post);
  
  if (!postText) {
    throw new Error('Could not extract post text');
  }
  
  // Test URL extraction via Send button
  let postUrl = null;
  try {
    const sendButton = await post.$('button[aria-label*="Send in a private message"]');
    if (sendButton) {
      await sendButton.click();
      await page.waitForTimeout(1000);
      
      // Look for copy link button
      const copyLinkClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const copyButton = buttons.find(button => 
          button.textContent?.includes('Copy link to post') ||
          button.getAttribute('aria-label')?.includes('Copy link')
        );
        
        if (copyButton && typeof copyButton.click === 'function') {
          copyButton.click();
          return true;
        }
        return false;
      });
      
      if (copyLinkClicked) {
        await page.waitForTimeout(1000);
        
        const clipboardText = await page.evaluate(async () => {
          return await navigator.clipboard.readText();
        });
        
        if (clipboardText && clipboardText.includes('linkedin.com')) {
          postUrl = clipboardText.trim().split('\n')[0].split(' ')[0];
        }
        
        // Close modal
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    }
  } catch (e) {
    console.log('URL extraction failed, continuing with test...');
  }
  
  // Test like functionality
  const likeButton = await post.$('button[aria-label*="Like"]');
  if (!likeButton) {
    throw new Error('Like button not found');
  }
  
  const wasAlreadyLiked = await page.evaluate(button => {
    return button.getAttribute('aria-pressed') === 'true' ||
           button.classList.contains('active') ||
           button.getAttribute('aria-label')?.includes('Unlike');
  }, likeButton);
  
  let likeActionTaken = false;
  if (!wasAlreadyLiked) {
    await likeButton.click();
    await page.waitForTimeout(2000);
    likeActionTaken = true;
  }
  
  // Verify like state
  const isNowLiked = await page.evaluate(button => {
    return button.getAttribute('aria-pressed') === 'true' ||
           button.classList.contains('active') ||
           button.getAttribute('aria-label')?.includes('Unlike');
  }, likeButton);
  
  if (!isNowLiked) {
    throw new Error('Post was not liked successfully');
  }
  
  await browser.close();
  
  return {
    postText: postText.substring(0, 100) + '...',
    postUrl: postUrl || 'URL extraction failed',
    wasAlreadyLiked,
    likeActionTaken,
    isNowLiked
  };
}

async function testClipboardPermissions() {
  const browser = await puppeteer.launch({
    headless: process.env.PUPPETEER_HEADLESS === 'true',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: stealthLaunchOptions.args
  });

  const page = await browser.newPage();
  await setupStealthMode(page);
  
  await page.goto('https://www.linkedin.com');
  
  // Test clipboard write
  await page.evaluate(async () => {
    await navigator.clipboard.writeText('test-clipboard-integration');
  });
  
  // Test clipboard read
  const clipboardText = await page.evaluate(async () => {
    return await navigator.clipboard.readText();
  });
  
  if (clipboardText !== 'test-clipboard-integration') {
    throw new Error(`Clipboard read failed: expected 'test-clipboard-integration', got '${clipboardText}'`);
  }
  
  await browser.close();
  return 'Clipboard permissions working';
}

async function runIntegrationTests() {
  console.log('🧪 LinkedIn Lead Warmer - Phase 2 Integration Tests');
  console.log('==================================================');
  
  const results = {};
  
  try {
    results.clipboard = await runTest('Clipboard Permissions', testClipboardPermissions);
    results.session = await runTest('Session Validation', testSessionValidation);
    results.engagement = await runTest('Post Engagement', testPostEngagement);
    
    console.log('\n🎉 All tests passed!');
    console.log('\n📊 Test Results:');
    console.log('================');
    console.log(`Clipboard: ${results.clipboard}`);
    console.log(`Session: ${results.session}`);
    console.log(`Post Text: ${results.engagement.postText}`);
    console.log(`Post URL: ${results.engagement.postUrl}`);
    console.log(`Was Already Liked: ${results.engagement.wasAlreadyLiked}`);
    console.log(`Like Action Taken: ${results.engagement.likeActionTaken}`);
    console.log(`Is Now Liked: ${results.engagement.isNowLiked}`);
    
  } catch (error) {
    console.error('\n💥 Test suite failed:', error.message);
    process.exit(1);
  }
}

runIntegrationTests();