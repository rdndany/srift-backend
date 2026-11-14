// How the browser suites open their browser.
//
//   (nothing)             the graphics card, in a window that is not shown: the game runs at full speed
//   E2E_WATCH=1           the same in a window on the screen, each step slowed a little, to watch the suite play
//   E2E_SLOW=<ms>         how much each step is slowed while watching (150 by default)
//   E2E_RENDER=software   the software renderer, for a machine without a graphics card. The game then makes about
//                         one frame a second, and a second of the game takes many seconds: expect waits to run out.
import { chromium } from 'playwright';

const SOFTWARE = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'];
const CARD = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'];

export async function launchBrowser() {
  if (process.env.E2E_RENDER === 'software') return chromium.launch({ args: SOFTWARE });
  if (process.env.E2E_WATCH) return withoutIcon(await chromium.launch({ args: [...CARD, '--window-position=40,40'], headless: false, slowMo: Number(process.env.E2E_SLOW ?? 150) }));
  try {
    // (The full browser, not the headless shell: only it draws with the graphics card while hidden.)
    return withoutIcon(await chromium.launch({ args: CARD, channel: 'chromium' }));
  } catch (err) {
    console.log(`(no browser that can use the graphics card: ${String(err.message).split('\n')[0]}; using the software renderer)`);
    return chromium.launch({ args: SOFTWARE });
  }
}

/**
 * The full browser asks every site for its icon (/favicon.ico), and the game has none: the answer "not found" would be
 * counted by the suites as an error of the page. The request is answered here instead, with nothing.
 */
function withoutIcon(browser) {
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (options) => {
    const context = await newContext(options);
    await context.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
    return context;
  };
  browser.newPage = async (options) => (await browser.newContext(options)).newPage();
  return browser;
}
