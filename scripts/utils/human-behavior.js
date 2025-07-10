export function randomDelay(min = 2000, max = 7000) {
  return Math.floor(Math.random() * (max - min) + min);
}

export async function humanLikeType(page, selector, text) {
  await page.click(selector);
  for (const char of text) {
    await page.type(selector, char);
    await page.waitForTimeout(randomDelay(50, 150));
  }
}

export async function moveMouse(page) {
  const viewport = await page.viewport();
  const startX = Math.random() * viewport.width;
  const startY = Math.random() * viewport.height;
  const endX = Math.random() * viewport.width;
  const endY = Math.random() * viewport.height;
  
  await page.mouse.move(startX, startY);
  await page.mouse.move(endX, endY, { steps: 10 });
}

export async function randomScroll(page) {
  const scrollAmount = Math.floor(Math.random() * 300) + 100;
  await page.evaluate((amount) => {
    window.scrollBy({
      top: amount,
      behavior: 'smooth'
    });
  }, scrollAmount);
}

export async function humanLikeClick(page, selectorOrElement) {
  let element;
  
  if (typeof selectorOrElement === 'string') {
    element = await page.$(selectorOrElement);
    if (!element) throw new Error(`Element not found: ${selectorOrElement}`);
  } else {
    element = selectorOrElement;
  }
  
  const box = await element.boundingBox();
  const x = box.x + box.width * Math.random();
  const y = box.y + box.height * Math.random();
  
  await page.mouse.move(x, y, { steps: 5 });
  await page.waitForTimeout(randomDelay(100, 300));
  await page.mouse.click(x, y);
}

export async function randomPause() {
  await new Promise(resolve => setTimeout(resolve, randomDelay()));
}