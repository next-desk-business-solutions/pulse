import puppeteer from 'puppeteer';
import { loadCookies } from './utils/cookie-manager.js';
import { setupStealthMode } from './utils/stealth.js';
import { humanLikeClick, randomScroll, randomDelay, moveMouse, randomPause } from './utils/human-behavior.js';

const ENGAGEMENT_DELAY_MIN = parseInt(process.env.ENGAGEMENT_DELAY_MIN || '4000');
const ENGAGEMENT_DELAY_MAX = parseInt(process.env.ENGAGEMENT_DELAY_MAX || '10000');
const POST_DISCOVERY_TIMEOUT = parseInt(process.env.POST_DISCOVERY_TIMEOUT || '45000');

async function waitForPageLoad(page) {
  console.error('[PHASE2] Waiting for page to fully load...');
  await randomDelay(3500, 5000);
  
  const isLoggedIn = await page.$('nav[aria-label="Primary Navigation"]');
  if (!isLoggedIn) {
    throw {
      type: 'session_expired',
      message: 'LinkedIn session has expired'
    };
  }
  
  console.error('[PHASE2] Waiting for posts to load...');
  try {
    await page.waitForSelector('.feed-shared-update-v2', { timeout: 10000 });
  } catch (error) {
    throw {
      type: 'no_posts',
      message: 'No posts found on profile activity page'
    };
  }
  await randomPause();
}

async function scrollWithAntiBot(page, scrollCount) {
  await randomScroll(page, 'down');
  
  if (scrollCount % 5 === 0) {
    await moveMouse(page);
    await randomPause();
  } else if (scrollCount % 3 === 0) {
    await randomPause();
  } else {
    await randomPause();
  }
  
  if (Math.random() < 0.2) {
    await moveMouse(page);
    await randomPause();
  }
}

async function findPostWithSendButton(page) {
  console.error('[PHASE2] Searching for posts with send button...');
  let scrollCount = 0;
  const startTime = Date.now();
  
  while (Date.now() - startTime < POST_DISCOVERY_TIMEOUT) {
    const sendButton = await page.$('button[aria-label="Send in a private message"]');
    
    if (sendButton && await sendButton.isIntersectingViewport()) {
      console.error('[PHASE2] Found send button in viewport');
      
      const postContainer = await sendButton.evaluateHandle(el => {
        let parent = el;
        while (parent && !parent.classList?.contains('feed-shared-update-v2')) {
          parent = parent.parentElement;
        }
        return parent;
      });

      if (postContainer) {
        const likeButton = await postContainer.$('button.react-button__trigger');
        if (likeButton) {
          console.error('[PHASE2] Found like button in the same post');
          return { sendButton, likeButton, scrollCount };
        }
      }
    }

    scrollCount++;
    await scrollWithAntiBot(page, scrollCount);
    console.error(`[PHASE2] Scrolled ${scrollCount} times`);
  }
  
  throw {
    type: 'no_posts_found',
    message: 'No posts with send button found'
  };
}

async function likePost(page, likeButton) {
  const isLiked = await likeButton.evaluate(el => 
    el.getAttribute('aria-pressed') === 'true' || 
    el.classList.contains('react-button--active')
  );

  if (!isLiked) {
    console.error('[PHASE2] Liking the post...');
    await moveMouse(page);
    await randomPause();
    await humanLikeClick(page, likeButton);
    await randomPause();
    console.error('[PHASE2] Post liked successfully');
    await randomPause();
    await moveMouse(page);
  } else {
    console.error('[PHASE2] Post already liked');
    await randomPause();
  }
  
  return !isLiked;
}

async function clickSendButton(page, sendButton) {
   console.error('[PHASE2] Ensuring send button is clickable...');
  await sendButton.scrollIntoViewIfNeeded();
   
  console.error('[PHASE2] Clicking send button...');
  await moveMouse(page);
  await randomPause();
  
  try {
    await sendButton.click();
  } catch (clickError) {
    console.error('[PHASE2] Direct click failed, trying humanLikeClick...');
    await humanLikeClick(page, sendButton);
  }
  
  await randomPause();
  
  console.error('[PHASE2] Waiting for share modal to appear...');
  try {
    await page.waitForSelector('.artdeco-modal', { timeout: 10000 });
    console.error('[PHASE2] Share modal appeared');
  } catch (error) {
    console.error('[PHASE2] Share modal did not appear - send button click may have failed');
    throw {
      type: 'modal_not_found',
      message: 'Share modal did not appear after clicking send button'
    };
  }
}

async function copyPostUrl(page) {
  await randomPause();
  await moveMouse(page);
  
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const copyBtn = buttons.find(btn => btn.textContent.includes('Copy link to post'));
    if (copyBtn) {
      copyBtn.setAttribute('data-copy-link-button', 'true');
    }
  });
  
  const copyButton = await page.$('button[data-copy-link-button="true"]');
  
  if (copyButton) {
    console.error('[PHASE2] Copy link button found, clicking...');
    await randomPause();
    await moveMouse(page);
    await randomPause();
    await humanLikeClick(page, copyButton);
    await randomPause();
    
    const postUrl = await page.evaluate(async () => {
      try {
        const text = await navigator.clipboard.readText();
        return text;
      } catch (err) {
        console.error('Failed to read clipboard:', err);
        return null;
      }
    });

    console.error('[PHASE2] Post URL copied:', postUrl);
    
    await randomPause();
    await moveMouse(page);
    await randomPause();
    
    await page.keyboard.press('Escape');
    await randomPause();
    
    return postUrl;
  }
  
  return null;
}

async function scrollBackUp(page, scrollCount) {
  await moveMouse(page);
  await randomPause();
  
  console.error(`[PHASE2] Scrolling back up ${scrollCount} times...`);
  for (let i = 0; i < scrollCount; i++) {
    await randomScroll(page, 'up');
    await randomPause();
    
    if (i % 10 === 0 && i > 0) {
      await moveMouse(page);
      await randomPause();
    }
  }
}

async function extractPostContent(page) {
  console.error('[PHASE2] Extracting post content...');
  return await page.evaluate(() => {
    const sendButton = document.querySelector('button[aria-label="Send in a private message"]');
    if (!sendButton) return null;

    let postContainer = sendButton.closest('.feed-shared-update-v2');
    if (!postContainer) return null;

    const textElement = postContainer.querySelector('.update-components-text');
    const postText = textElement ? textElement.innerText.trim() : '';

    const authorElement = postContainer.querySelector('.update-components-actor__title');
    const authorName = authorElement ? authorElement.innerText.trim() : '';

    const timeElement = postContainer.querySelector('.update-components-actor__sub-description');
    const publishedDate = timeElement ? timeElement.innerText.split('•')[0].trim() : '';

    const reactionsElement = postContainer.querySelector('.social-details-social-counts__reactions-count');
    const reactions = reactionsElement ? parseInt(reactionsElement.innerText.replace(/,/g, '')) : 0;

    const commentsElement = postContainer.querySelector('[aria-label*="comments"]');
    const comments = commentsElement ? parseInt(commentsElement.innerText.match(/\d+/)?.[0] || '0') : 0;

    const repostsElement = postContainer.querySelector('[aria-label*="reposts"]');
    const reposts = repostsElement ? parseInt(repostsElement.innerText.match(/\d+/)?.[0] || '0') : 0;

    const hasImage = !!postContainer.querySelector('.update-components-image');
    const hasVideo = !!postContainer.querySelector('.update-components-video');
    
    return {
      text: postText,
      author: authorName,
      publishedDate: publishedDate,
      engagementStats: {
        likes: reactions,
        comments: comments,
        shares: reposts
      },
      postType: hasVideo ? 'video' : hasImage ? 'image' : 'text',
      hasMedia: hasImage || hasVideo
    };
  });
}

async function engageWithPost(profileUrl) {
  console.error('[PHASE2] Starting post engagement process');
  console.error(`[PHASE2] Target profile: ${profileUrl}`);
  
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: process.env.PUPPETEER_HEADLESS !== 'false',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-web-security'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await setupStealthMode(page);
    
    const cookiesLoaded = await loadCookies(page);
    if (!cookiesLoaded) {
      throw new Error('Failed to load session cookies');
    }

    console.error('[PHASE2] Navigating directly to recent activity...');
    const activityUrl = profileUrl.endsWith('/') ? 
      `${profileUrl}recent-activity/all/` : 
      `${profileUrl}/recent-activity/all/`;
    
    await page.goto(activityUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForPageLoad(page);

    const { sendButton, likeButton, scrollCount } = await findPostWithSendButton(page);
    const wasLiked = await likePost(page, likeButton);
    await clickSendButton(page, sendButton);
    const postUrl = await copyPostUrl(page);
    await scrollBackUp(page, scrollCount);
    const postContent = await extractPostContent(page);

    if (!postContent) {
      throw {
        type: 'content_extraction_failed',
        message: 'Failed to extract post content'
      };
    }

    console.error('[PHASE2] Post engagement completed successfully');

    return {
      status: 'success',
      profileUrl: profileUrl,
      likedPostUrl: postUrl || 'URL copy failed',
      postContent: postContent.text,
      postMetadata: {
        author: postContent.author,
        publishedDate: postContent.publishedDate,
        postType: postContent.postType,
        engagementStats: postContent.engagementStats,
        hasMedia: postContent.hasMedia,
        mediaDescription: ''
      },
      actionsTaken: {
        liked: wasLiked,
        alreadyLiked: !wasLiked
      },
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('[PHASE2] Error during post engagement:', error);
    
    let errorType = error.type || 'unknown';
    if (error.name === 'TimeoutError') {
      errorType = 'network';
    }
    const requiresManualIntervention = ['session_expired', 'captcha', 'no_posts_found'].includes(errorType);

    return {
      status: 'error',
      message: error.message || 'Unexpected error during post engagement',
      errorType: errorType,
      requiresManualIntervention: requiresManualIntervention,
      profileUrl: profileUrl,
      partialData: {
        postsFound: 0,
        profileAccessible: true
      }
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Command line execution
if (process.argv[2]) {
  const profileUrl = process.argv[2];
  engageWithPost(profileUrl)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.status === 'success' ? 0 : 1);
    })
    .catch(error => {
      console.error('[PHASE2] Fatal error:', error);
      process.exit(1);
    });
}

export { engageWithPost };
