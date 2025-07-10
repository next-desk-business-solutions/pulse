import puppeteer from 'puppeteer';
import { setupStealthMode, stealthLaunchOptions } from './utils/stealth.js';
import { moveMouse, randomDelay, randomScroll, humanLikeClick } from './utils/human-behavior.js';
import { loadCookies, validateSession, COOKIES_PATH } from './utils/cookie-manager.js';

async function findMostRecentPost(page, profileUrl) {
  console.log('[PHASE2] Searching for recent posts...');
  
  await page.waitForTimeout(randomDelay(3000, 5000));
  await randomScroll(page);
  await page.waitForTimeout(randomDelay(2000, 3000));
  
  const postSelectors = [
    '.feed-shared-update-v2',
    '.feed-shared-post',
    '.artdeco-card',
    '[data-urn*="activity"]'
  ];
  
  let posts = [];
  const maxPostsToScan = parseInt(process.env.MAX_POSTS_TO_SCAN) || 5;
  
  for (const selector of postSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 10000 });
      const foundPosts = await page.$$(selector);
      
      if (foundPosts.length > 0) {
        console.log(`[PHASE2] Found ${foundPosts.length} potential posts with selector: ${selector}`);
        posts = foundPosts.slice(0, maxPostsToScan);
        break;
      }
    } catch (e) {
      continue;
    }
  }
  
  if (posts.length === 0) {
    return null;
  }
  
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    let totalScrolledDown = 0;
    
    try {
      const isShare = await post.$('.feed-shared-reshare');
      if (isShare) {
        console.log(`[PHASE2] Skipping shared post ${i + 1}`);
        continue;
      }
      
      console.log(`[PHASE2] Processing post ${i + 1} - getting post URL first`);
      
      let sendButton = null;
      let modalVisible = false;
      let scrollAttempts = 0;
      const maxScrollAttempts = 10;
      const scrollAmount = 200;
      
      sendButton = await post.$('button[aria-label*="Send in a private message"], .send-privately-button');
      
      while (!modalVisible && scrollAttempts < maxScrollAttempts) {
        scrollAttempts++;
        console.log(`[PHASE2] Scroll attempt ${scrollAttempts} - scrolling DOWN to find Send button...`);
        
        await page.evaluate((amount) => {
          window.scrollBy({ top: amount, behavior: 'smooth' });
        }, scrollAmount);
        totalScrolledDown += scrollAmount;
        await page.waitForTimeout(randomDelay(1000, 2000));
        
        sendButton = await post.$('button[aria-label*="Send in a private message"], .send-privately-button');
        
        if (sendButton) {
          console.log(`[PHASE2] Found Send button after scrolling down ${totalScrolledDown}px, attempting to click...`);
          
          await humanLikeClick(page, sendButton);
          console.log(`[PHASE2] Clicked Send button, waiting for modal...`);
          
          await page.waitForTimeout(randomDelay(2000, 4000));
          
          const modal = await page.$('[role="dialog"], .msg-overlay-bubble-header, .send-privately');
          if (modal) {
            console.log(`[PHASE2] Modal appeared successfully!`);
            modalVisible = true;
            break;
          } else {
            console.log(`[PHASE2] Modal did not appear, scrolling MORE...`);
            sendButton = null;
          }
        } else {
          console.log(`[PHASE2] Send button still not found, scrolling MORE...`);
        }
      }
      
      let postUrl = null;
      
      if (modalVisible) {
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
          console.log(`[PHASE2] Found and clicked copy link button, getting URL...`);
          await page.waitForTimeout(randomDelay(1000, 2000));
          
          try {
            let clipboardText = await page.evaluate(async () => {
              return await navigator.clipboard.readText();
            });
            
            if (!clipboardText || !clipboardText.includes('linkedin.com')) {
              await page.waitForTimeout(1000);
              clipboardText = await page.evaluate(async () => {
                return await navigator.clipboard.readText();
              });
            }
            
            if (clipboardText && clipboardText.includes('linkedin.com')) {
              postUrl = clipboardText.trim().split('\n')[0].split(' ')[0];
              console.log(`[PHASE2] Successfully extracted post URL`);
            }
          } catch (e) {
            console.log(`[PHASE2] Clipboard read failed: ${e.message}`);
          }
        } else {
          console.log(`[PHASE2] Could not find copy link button`);
        }
        
        await page.keyboard.press('Escape');
        await page.waitForTimeout(randomDelay(500, 1000));
      }
      
      // FAIL THE JOB IF NO URL WAS EXTRACTED
      if (!postUrl || !postUrl.includes('linkedin.com')) {
        console.log(`[PHASE2] FAILED - No valid post URL extracted, continuing to next post...`);
        if (totalScrolledDown > 0) {
          await page.evaluate((amount) => {
            window.scrollBy({ top: -amount, behavior: 'smooth' });
          }, totalScrolledDown);
        }
        continue;
      }
      
      if (totalScrolledDown > 0) {
        console.log(`[PHASE2] Scrolling back up ${totalScrolledDown}px to extract content...`);
        await page.evaluate((amount) => {
          window.scrollBy({ top: -amount, behavior: 'smooth' });
        }, totalScrolledDown);
        await page.waitForTimeout(randomDelay(1000, 2000));
      }
      
      const postContent = await extractPostContent(page, post);
      
      if (postContent.text && postContent.text.trim().length > 0) {
        console.log(`[PHASE2] Found post with content: ${postContent.text.substring(0, 100)}...`);
        
        return { 
          element: post, 
          url: postUrl || `${profileUrl}/recent-activity/`,
          content: postContent 
        };
      } else {
        console.log(`[PHASE2] Post ${i + 1} found but no extractable text content`);
      }
      
    } catch (e) {
      console.log(`[PHASE2] Error processing post ${i + 1}: ${e.message}`);
      
      if (totalScrolledDown > 0) {
        await page.evaluate((amount) => {
          window.scrollBy({ top: -amount, behavior: 'smooth' });
        }, totalScrolledDown);
      }
      continue;
    }
  }
  
  return null;
}

async function extractPostContent(page, postElement) {
  const content = {};
  
  try {
    const expandSelectors = [
      'button[aria-label*="see more"]',
      'button[aria-label*="more"]',
      '.feed-shared-inline-show-more-text__see-more-less-toggle',
      '.feed-shared-text__see-more-less-toggle'
    ];
    
    for (const selector of expandSelectors) {
      try {
        const expandButton = await postElement.$(selector);
        if (expandButton) {
          console.log(`[PHASE2] Found expand button, clicking to show full content...`);
          await expandButton.click();
          await page.waitForTimeout(randomDelay(1000, 2000));
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    const textSelectors = [
      '.feed-shared-text__text-view',
      '.feed-shared-update-v2__description',
      '.feed-shared-text',
      '.attributed-text-segment-list__content'
    ];
    
    for (const selector of textSelectors) {
      try {
        const textElement = await postElement.$(selector);
        if (textElement) {
          content.text = await page.evaluate(el => el.textContent?.trim(), textElement);
          if (content.text) break;
        }
      } catch (e) {
        continue;
      }
    }
    
    try {
      const timestampElement = await postElement.$('time, .feed-shared-actor__sub-description time');
      if (timestampElement) {
        content.publishedDate = await page.evaluate(el => 
          el.textContent?.trim() || el.getAttribute('datetime'), timestampElement);
      }
    } catch (e) {
      content.publishedDate = 'Unknown';
    }
    
    content.postType = 'text';
    content.hasMedia = false;
    
    if (await postElement.$('.feed-shared-image, .feed-shared-mini-update-v2--image, .update-components-image')) {
      content.postType = 'image';
      content.hasMedia = true;
    } else if (await postElement.$('.feed-shared-video, .feed-shared-mini-update-v2--video, .update-components-video')) {
      content.postType = 'video';
      content.hasMedia = true;
    } else if (await postElement.$('.feed-shared-article')) {
      content.postType = 'article';
    } else if (await postElement.$('.feed-shared-poll')) {
      content.postType = 'poll';
    } else if (await postElement.$('.feed-shared-certification, .feed-shared-mini-update-v2--certification')) {
      content.postType = 'certification';
    } else if (await postElement.$('.feed-shared-achievement, .feed-shared-mini-update-v2--achievement')) {
      content.postType = 'achievement';
    }
    
    console.log(`[PHASE2] Detected post type: ${content.postType}`);
    
    if (content.hasMedia) {
      try {
        const mediaDescElement = await postElement.$('.feed-shared-image__description, .visually-hidden');
        if (mediaDescElement) {
          content.mediaDescription = await page.evaluate(el => el.textContent?.trim(), mediaDescElement);
        }
      } catch (e) {
        content.mediaDescription = 'Media description not available';
      }
    }
    
    try {
      const likesElement = await postElement.$('.social-counts-reactions__count, .feed-shared-social-action-bar__reaction-count');
      const commentsElement = await postElement.$('[aria-label*="comment"], .feed-shared-social-action-bar__comment-count');
      const sharesElement = await postElement.$('[aria-label*="share"], .feed-shared-social-action-bar__share-count');
      
      content.engagementStats = {
        likes: likesElement ? await page.evaluate(el => {
          const text = el.textContent?.trim() || '0';
          return parseInt(text.replace(/[^\d]/g, '')) || 0;
        }, likesElement) : 0,
        comments: commentsElement ? await page.evaluate(el => {
          const text = el.textContent?.trim() || '0';
          return parseInt(text.replace(/[^\d]/g, '')) || 0;
        }, commentsElement) : 0,
        shares: sharesElement ? await page.evaluate(el => {
          const text = el.textContent?.trim() || '0';
          return parseInt(text.replace(/[^\d]/g, '')) || 0;
        }, sharesElement) : 0
      };
    } catch (e) {
      content.engagementStats = { likes: 0, comments: 0, shares: 0 };
    }
    
  } catch (error) {
    console.log(`[PHASE2] Error extracting post content: ${error.message}`);
  }
  
  return content;
}

async function likePost(page, postElement) {
  console.log('[PHASE2] Attempting to like post...');
  
  try {
    const likeSelectors = [
      'button[aria-label*="Like"]',
      'button[data-control-name="like"]',
      '.feed-shared-social-action-bar__action-button[aria-pressed="false"]',
      '.social-action[aria-label*="Like"]'
    ];
    
    let likeButton = null;
    for (const selector of likeSelectors) {
      likeButton = await postElement.$(selector);
      if (likeButton) break;
    }
    
    if (!likeButton) {
      return { liked: false, alreadyLiked: false, error: 'Like button not found' };
    }
    
    const isAlreadyLiked = await page.evaluate(button => {
      return button.getAttribute('aria-pressed') === 'true' ||
             button.classList.contains('active') ||
             button.getAttribute('aria-label')?.includes('Unlike');
    }, likeButton);
    
    if (isAlreadyLiked) {
      console.log('[PHASE2] Post already liked');
      return { liked: true, alreadyLiked: true };
    }
    
    await moveMouse(page);
    await page.waitForTimeout(randomDelay(1000, 2000));
    
    await page.evaluate(button => {
      button.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, likeButton);
    
    await page.waitForTimeout(randomDelay(500, 1000));
    
    await humanLikeClick(page, likeButton);
    
    await page.waitForTimeout(randomDelay(2000, 3000));
    
    const likeSuccess = await page.evaluate(button => {
      return button.getAttribute('aria-pressed') === 'true' ||
             button.classList.contains('active') ||
             button.getAttribute('aria-label')?.includes('Unlike');
    }, likeButton);
    
    if (likeSuccess) {
      console.log('[PHASE2] Post liked successfully');
      return { liked: true, alreadyLiked: false };
    } else {
      return { liked: false, alreadyLiked: false, error: 'Like action may have failed' };
    }
    
  } catch (error) {
    console.log(`[PHASE2] Error liking post: ${error.message}`);
    return { liked: false, alreadyLiked: false, error: error.message };
  }
}

async function engageWithPost() {
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
    headless: process.env.PUPPETEER_HEADLESS === 'true',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: stealthLaunchOptions.args
  });

  try {
    const page = await browser.newPage();
    
    await setupStealthMode(page);
    await page.setViewport({ width: 1280, height: 600 });
    
    await page.evaluate(async () => {
      try {
        await navigator.clipboard.writeText('');
      } catch (e) {
        // Ignore errors
      }
    });
    
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
    
    const activityUrl = profileUrl.endsWith('/') 
      ? `${profileUrl}recent-activity/all/`
      : `${profileUrl}/recent-activity/all/`;
    
    console.log(`[PHASE2] Navigating to activity page: ${activityUrl}`);
    
    await page.goto(activityUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
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
    
    const postData = await findMostRecentPost(page, profileUrl);
    
    if (!postData) {
      return {
        status: 'error',
        message: 'No recent posts found on profile',
        errorType: 'no_posts_found',
        requiresManualIntervention: true,
        profileUrl,
        partialData: {
          postsFound: 0,
          profileAccessible: true
        }
      };
    }
    
    console.log(`[PHASE2] Using extracted post content...`);
    
    const postContent = postData.content;
    
    if (!postContent.text) {
      return {
        status: 'error',
        message: 'Could not extract post text content',
        errorType: 'extraction_failed',
        requiresManualIntervention: true,
        profileUrl,
        partialData: {
          postUrl: postData.url,
          postType: postContent.postType
        }
      };
    }
    
    const postElement = postData.element;
    
    const likeResult = await likePost(page, postElement);
    
    await moveMouse(page);
    await page.waitForTimeout(randomDelay(2000, 4000));
    
    console.log(`[PHASE2] Post engagement completed`);
    
    return {
      status: 'success',
      profileUrl,
      likedPostUrl: postData.url,
      postContent: postContent.text,
      postMetadata: {
        author: 'Profile Owner',
        publishedDate: postContent.publishedDate,
        postType: postContent.postType,
        engagementStats: postContent.engagementStats,
        hasMedia: postContent.hasMedia,
        mediaDescription: postContent.mediaDescription || null
      },
      actionsTaken: likeResult,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`[PHASE2] Error engaging with post: ${error.message}`);
    
    let errorType = 'unknown';
    if (error.message.includes('timeout') || error.message.includes('Navigation timeout')) {
      errorType = 'network';
    } else if (error.message.includes('net::')) {
      errorType = 'network';
    } else if (error.message.includes('rate') || error.message.includes('limit')) {
      errorType = 'rate_limit';
    }
    
    return {
      status: 'error',
      message: `Post engagement failed: ${error.message}`,
      errorType,
      requiresManualIntervention: errorType === 'network' ? false : true,
      profileUrl
    };
  } finally {
    await browser.close();
  }
}

engageWithPost().then(result => {
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === 'success' ? 0 : 1);
});