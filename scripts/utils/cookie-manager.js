import fs from 'fs/promises';
import path from 'path';

const COOKIES_PATH = path.join(process.cwd(), 'data', 'cookies.json');

export async function loadCookies(page) {
  try {
    const cookiesString = await fs.readFile(COOKIES_PATH, 'utf-8');
    const cookies = JSON.parse(cookiesString);
    await page.setCookie(...cookies);
    return true;
  } catch (error) {
    return false;
  }
}

export async function saveCookies(page) {
  const cookies = await page.cookies();
  await fs.mkdir(path.dirname(COOKIES_PATH), { recursive: true });
  await fs.writeFile(COOKIES_PATH, JSON.stringify(cookies, null, 2));
}

export async function clearCookies() {
  try {
    await fs.unlink(COOKIES_PATH);
    return true;
  } catch (error) {
    return false;
  }
}

export async function validateSession(page) {
  try {
    await page.goto('https://www.linkedin.com/feed/', { 
      waitUntil: 'domcontentloaded',
      timeout: 10000 
    });
    
    // Wait a bit for potential redirects
    await page.waitForTimeout(2000);
    
    const currentUrl = await page.url();
    const isLoginPage = currentUrl.includes('/login');
    return !isLoginPage;
  } catch (error) {
    return false;
  }
}

export { COOKIES_PATH };