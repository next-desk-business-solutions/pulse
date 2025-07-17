import puppeteer from 'puppeteer';
import { setupStealthMode, stealthLaunchOptions } from './utils/stealth.js';
import { moveMouse, randomDelay, randomScroll, humanLikeClick } from './utils/human-behavior.js';
import { loadCookies, validateSession, COOKIES_PATH } from './utils/cookie-manager.js';

async function extractAboutSection(page) {
  try {
    // First scroll down to find about section
    await randomScroll(page, 'down');
    await page.waitForTimeout(randomDelay(1000, 1500));
    
    // Look for about section - it's usually an anchor div followed by content
    const aboutSection = await page.$('#about');
    if (!aboutSection) {
      console.error('[PHASE1] About section not found on profile');
      return null;
    }
    
    // Scroll the about section into view
    await page.evaluate((element) => {
      // Find the parent section that contains the actual content
      const parentSection = element.closest('section');
      if (parentSection) {
        parentSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, aboutSection);
    
    await page.waitForTimeout(randomDelay(1500, 2500));
    
    // Look for "see more" button in about section
    const seeMoreButton = await page.evaluate(() => {
      const aboutAnchor = document.querySelector('#about');
      if (!aboutAnchor) return null;
      
      // Find the parent section that contains the content
      const parentSection = aboutAnchor.closest('section');
      if (!parentSection) return null;
      
      // Look for buttons with "see more" text in the section
      const buttons = parentSection.querySelectorAll('button');
      for (const button of buttons) {
        const text = button.textContent?.toLowerCase().trim();
        if (text && (text === '…see more' || text.includes('see more') || text.includes('show more'))) {
          button.setAttribute('data-see-more', 'true');
          return true;
        }
      }
      return false;
    });
    
    if (seeMoreButton) {
      const buttonElement = await page.$('section:has(#about) button[data-see-more="true"]');
      if (buttonElement) {
        console.error('[PHASE1] Found "see more" button in about section, clicking...');
        await humanLikeClick(page, buttonElement);
        await page.waitForTimeout(randomDelay(1000, 2000));
      }
    }
    
    // Extract about content
    const aboutContent = await page.evaluate(() => {
      const aboutAnchor = document.querySelector('#about');
      if (!aboutAnchor) return null;
      
      // Find the parent section
      const parentSection = aboutAnchor.closest('section');
      if (!parentSection) return null;
      
      // Look for the inline-show-more-text div that contains the about content
      const showMoreDiv = parentSection.querySelector('.inline-show-more-text');
      if (showMoreDiv) {
        // First try to get the visible text (aria-hidden="true" span)
        const visibleSpan = showMoreDiv.querySelector('span[aria-hidden="true"]');
        if (visibleSpan && visibleSpan.textContent?.trim()) {
          return visibleSpan.textContent.trim();
        }
        
        // If not found, try the visually-hidden span
        const hiddenSpan = showMoreDiv.querySelector('span.visually-hidden');
        if (hiddenSpan && hiddenSpan.textContent?.trim()) {
          return hiddenSpan.textContent.trim();
        }
      }
      
      // Fallback: look for any text content in the section
      const textContainers = parentSection.querySelectorAll('.t-14, .t-normal');
      for (const container of textContainers) {
        const text = container.textContent?.trim();
        if (text && text.length > 50 && !text.includes('About') && !text.includes('Top skills')) {
          return text;
        }
      }
      
      return null;
    });
    
    return aboutContent;
  } catch (error) {
    console.error(`[PHASE1] Error extracting about section: ${error.message}`);
    return null;
  }
}

async function extractProfileData(page) {
  const data = {};
  
  try {
    // Wait for profile content to load
    await page.waitForSelector('h1', { timeout: 10000 });
    
    // Extract full name with multiple fallback selectors
    const nameSelectors = [
      'h1.text-heading-xlarge',
      'h1[data-generated-suggestion-target]',
      '.pv-text-details__left-panel h1',
      '.ph5 h1',
      'h1'
    ];
    
    for (const selector of nameSelectors) {
      try {
        const nameElement = await page.$(selector);
        if (nameElement) {
          data.fullName = await page.evaluate(el => el.textContent?.trim(), nameElement);
          if (data.fullName) break;
        }
      } catch (e) {
        continue;
      }
    }
    
    // Extract headline with fallbacks
    const headlineSelectors = [
      '.text-body-medium.break-words',
      '.pv-text-details__left-panel .text-body-medium',
      '.ph5 .text-body-medium',
      '.pv-entity__sub-title'
    ];
    
    for (const selector of headlineSelectors) {
      try {
        const headlineElement = await page.$(selector);
        if (headlineElement) {
          data.headline = await page.evaluate(el => el.textContent?.trim(), headlineElement);
          if (data.headline) break;
        }
      } catch (e) {
        continue;
      }
    }
    
    // Extract location with fallbacks
    const locationSelectors = [
      '.text-body-small.inline.t-black--light.break-words',
      '.pv-text-details__left-panel .text-body-small',
      '.ph5 .text-body-small',
      '.pv-entity__location'
    ];
    
    for (const selector of locationSelectors) {
      try {
        const locationElement = await page.$(selector);
        if (locationElement) {
          data.location = await page.evaluate(el => el.textContent?.trim(), locationElement);
          if (data.location && !data.location.includes('Edit') && !data.location.includes('Contact info')) break;
        }
      } catch (e) {
        continue;
      }
    }
    
    // Check connection degree
    try {
      const connectionElement = await page.$('.dist-value');
      if (connectionElement) {
        data.connectionDegree = await page.evaluate(el => el.textContent?.trim(), connectionElement);
      } else {
        // Fallback: check for connection indicators
        const connectButton = await page.$('button[aria-label*="Connect"]');
        const messageButton = await page.$('button[aria-label*="Message"]');
        
        if (messageButton) {
          data.connectionDegree = '1st';
        } else if (connectButton) {
          data.connectionDegree = '2nd or 3rd';
        } else {
          data.connectionDegree = 'Unknown';
        }
      }
    } catch (e) {
      data.connectionDegree = 'Unknown';
    }
    
    // Check if profile is public/accessible
    data.isPublic = !await page.$('.profile-unavailable');
    
    // Check if premium required
    data.premiumRequired = !!(await page.$('.premium-upsell-link'));
    
  } catch (error) {
    console.error(`[PHASE1] Error extracting profile data: ${error.message}`);
  }
  
  return data;
}

async function viewProfile() {
  const profileUrl = process.argv[2];
  
  if (!profileUrl) {
    return {
      status: 'error',
      message: 'Profile URL is required',
      errorType: 'invalid_input',
      requiresManualIntervention: false
    };
  }
  
  if (!profileUrl.includes('linkedin.com/in/')) {
    return {
      status: 'error',
      message: 'Invalid LinkedIn profile URL format',
      errorType: 'invalid_input',
      requiresManualIntervention: false,
      profileUrl
    };
  }
  
  const browser = await puppeteer.launch({
    headless: process.env.PUPPETEER_HEADLESS !== 'false',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: stealthLaunchOptions.args
  });

  try {
    const page = await browser.newPage();
    
    await setupStealthMode(page);
    await page.setViewport({ width: 1280, height: 800 });
    
    // Load session cookies
    const cookiesLoaded = await loadCookies(page);
    
    if (!cookiesLoaded) {
      return {
        status: 'error',
        message: 'No session cookies found - login required',
        errorType: 'session_expired',
        requiresManualIntervention: false,
        profileUrl
      };
    }
    
    console.error(`[PHASE1] Navigating to profile: ${profileUrl}`);
    
    // Navigate to profile with timeout
    await page.goto(profileUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    // Check if redirected to login (session expired)
    await page.waitForTimeout(randomDelay(2000, 3000));
    const currentUrl = await page.url();
    
    if (currentUrl.includes('/login') || currentUrl.includes('/uas/login')) {
      return {
        status: 'error',
        message: 'Session expired - redirected to login',
        errorType: 'session_expired',
        requiresManualIntervention: false,
        profileUrl
      };
    }
    
    // Check for rate limiting or access restrictions
    if (await page.$('.profile-unavailable') || await page.$('.blocked-profile')) {
      return {
        status: 'error',
        message: 'Profile unavailable or access restricted',
        errorType: 'profile_private',
        requiresManualIntervention: true,
        profileUrl
      };
    }
    
    // Human-like behavior before data extraction
    await page.waitForTimeout(randomDelay(3000, 5000));
    await moveMouse(page);
    await randomScroll(page);
    await page.waitForTimeout(randomDelay(2000, 3000));
    
    console.error(`[PHASE1] Extracting profile data...`);
    
    // Extract profile information
    const profileData = await extractProfileData(page);
    
    // Validate that we got essential data
    if (!profileData.fullName) {
      return {
        status: 'error',
        message: 'Could not extract profile name - profile may be private or page structure changed',
        errorType: 'extraction_failed',
        requiresManualIntervention: true,
        profileUrl
      };
    }
    
    // More human-like behavior
    await moveMouse(page);
    await page.waitForTimeout(randomDelay(1000, 2000));
    
    // Extract about section
    console.error(`[PHASE1] Extracting about section...`);
    const aboutContent = await extractAboutSection(page);
    
    console.error(`[PHASE1] Profile data extracted successfully for: ${profileData.fullName}`);
    
    return {
      status: 'success',
      viewedProfile: profileUrl,
      fullName: profileData.fullName,
      profileData: {
        headline: profileData.headline || 'Not available',
        location: profileData.location || 'Not available',
        isPublic: profileData.isPublic,
        connectionDegree: profileData.connectionDegree,
        premiumRequired: profileData.premiumRequired,
        about: aboutContent || 'Not available'
      },
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`[PHASE1] Error viewing profile: ${error.message}`);
    
    // Determine error type based on error message
    let errorType = 'unknown';
    if (error.message.includes('timeout') || error.message.includes('Navigation timeout')) {
      errorType = 'network';
    } else if (error.message.includes('net::')) {
      errorType = 'network';
    }
    
    return {
      status: 'error',
      message: `Profile viewing failed: ${error.message}`,
      errorType,
      requiresManualIntervention: errorType === 'network' ? false : true,
      profileUrl
    };
  } finally {
    await browser.close();
  }
}

viewProfile().then(result => {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
});
