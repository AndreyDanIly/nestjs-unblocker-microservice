import {
  Injectable,
  Logger,
  HttpStatus,
  OnModuleDestroy,
} from '@nestjs/common';
import { Browser, HTTPRequest, TimeoutError } from 'puppeteer';

/**
 * Fake gamer profile based on Steam hardware survey (June 2025)
 * https://store.steampowered.com/hwsurvey/Steam-Hardware-Software-Survey-Welcome-to-Steam
 */
const GAMER_PROFILE = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
  userAgentData: {
    brands: [
      {
        brand: 'Not.A\\Brand', version: '8',
      },
      { brand: 'Chromium', version: '108' },
      { brand: 'Google Chrome', version: '108' },
    ],
    mobile: false,
    platform: 'Windows',
    architecture: 'x86',
    model: '',
    platformVersion: '15.0.0',
    bitness: '64',
    wow64: false,
  },
  gpu: {
    vendor: 'NVIDIA Corporation',
    renderer: 'NVIDIA GeForce RTX 4060 Laptop GPU'
  },
  platform: 'Win32',
  viewportWidth: 1920,
  viewportHeight: 1080,
  locale: 'en-US,en',
  timezone: 'America/New_York',
};

/**
 * The life cycle type (the value passed to waitUntil)
 *
 * 'load' - Waits for the 'load' event
 * 'domcontentloaded' - Waits for the 'DOMContentLoaded' event
 * 'networkidle0' - Waits till there are no more than 0 network connections for at least `500` ms
 * 'networkidle2' - Waits till there are no more than 2 network connections for at least `500` ms
 *
 * https://pptr.dev/api/puppeteer.puppeteerlifecycleevent
 */
const PUPPETEER_LIFE_CYCLE_TYPE = 'networkidle2';

/**
 * The network idle timeout in milliseconds.
 */
const NETWORK_IDLE_TIMEOUT = 60000;

/**
 * PX app ID pattern
 * Example: `58Asv359`
 */
const PXSCRIPT_PATTERN = /\/[A-Z0-9]+\/init\.js/i;

// A list of blocked third-party trackers urls to speed up page loading times for fast crawling
const BLOCKED_TRACKING_DOMAINS: string[] = [
  'google-analytics.com',
  'googletagmanager.com',
  'doubleclick.net',
  'facebook.net',
  'twitter.com',
  'analytics.yahoo.com',
  'adservice.google.com',
];

// Define a consistent return type for both success and failure
export interface PageContentResult {
  html: string | null;
  status: number;
  error?: string;
  finalUrl?: string;
}

@Injectable()
export class UnblockerService implements OnModuleDestroy {
  private readonly logger = new Logger(UnblockerService.name);
  private browser: Browser | null = null;

  /**
   * Gracefully close the browser instance when the NestJS module is destroyed.
   */
  async onModuleDestroy() {
    this.logger.log('Destroying module, closing browser...');
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Get a shared, lazy-loaded puppeteer browser instance.
   * This improves performance by avoiding repeated browser launches.
   * @private
   */
  private async getBrowser(): Promise<Browser> {
    // If the browser is already running and connected, the type guard ensures
    // `this.browser` is not null, so it can be returned safely.
    if (this.browser && this.browser.connected) {
      return this.browser;
    }

    this.logger.log('No active browser found. Launching a new instance...');
    const puppeteer = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteer.use(StealthPlugin());

    // Create a new browser instance and store it in a local constant.
    const newBrowser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    // Handle unexpected browser closure by setting the class property to null.
    newBrowser.on('disconnected', () => {
      this.logger.warn('Browser has been disconnected.');
      this.browser = null;
    });

    // Assign the new instance to the class property for future calls.
    this.browser = newBrowser;

    return newBrowser;
  }

  /**
   * Navigates to a URL and retrieves its content, handling bot detection and errors gracefully.
   * @param url The URL to access.
   * @returns A promise resolving to a PageContentResult object.
   */
  async getPageContent(url: string): Promise<PageContentResult> {
    const browser = await this.getBrowser();
    const context = await browser.createBrowserContext(); // Use a new context for isolation
    const page = await context.newPage();

    try {
      // Apply the gamer profile
      await page.setUserAgent(GAMER_PROFILE.userAgent, GAMER_PROFILE.userAgentData as any);
      await page.setViewport({
        width: GAMER_PROFILE.viewportWidth,
        height: GAMER_PROFILE.viewportHeight,
      });

      await page.evaluateOnNewDocument((profile) => {
        Object.defineProperty(navigator, 'platform', { get: () => profile.platform });
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'language', { get: () => profile.locale });
        Object.defineProperty(navigator, 'languages', { get: () => [profile.locale] });
        Intl.DateTimeFormat.prototype.resolvedOptions = () => ({
          locale: profile.locale.split(',')[0],
          timeZone: profile.timezone,
          calendar: 'gregory',
          numberingSystem: 'latn',
        });
      }, GAMER_PROFILE);

      // Intercept requests to block trackers and bot detection scripts
      await page.setRequestInterception(true);
      page.on('request', (request: HTTPRequest) => {
        const requestUrl = request.url();
        // The best way to block PerimeterX captcha? Is to just block its init.js file lol
        if (PXSCRIPT_PATTERN.test(requestUrl)) {
          this.logger.warn(`Aborting PerimeterX init.js: ${requestUrl}`);
          request.abort('aborted');
        } else if (BLOCKED_TRACKING_DOMAINS.some(domain => requestUrl.includes(domain))) {
          this.logger.log(`Aborting tracker: ${requestUrl}`);
          request.abort('aborted');
        } else {
          request.continue();
        }
      });

      this.logger.log(`Accessing ${url} with refined blocking enabled...`);
      const response = await page.goto(url, {
        waitUntil: PUPPETEER_LIFE_CYCLE_TYPE,
        timeout: NETWORK_IDLE_TIMEOUT,
      });

      if (!response) {
        // This case is rare but indicates a severe navigation failure.
        return {
          html: null,
          status: HttpStatus.BAD_GATEWAY,
          error: 'Navigation failed, no response received from the server.',
          finalUrl: page.url(),
        };
      }

      const status = response.status();
      const html = await page.content();
      const finalUrl = page.url();

      // Check for captcha even after blocking
      if (html.includes('px-captcha') || status === 403) {
        this.logger.error(`Captcha or block page detected at ${finalUrl} despite init.js blocking`);
        return {
          html,
          status: HttpStatus.FORBIDDEN,
          error: 'Bot detection or captcha was triggered.',
          finalUrl,
        };
      }

      this.logger.log(`Page successfully loaded with status ${status} from ${finalUrl}`);
      return { html, status, finalUrl };

    } catch (error) {
      // Instead of re-throwing, we catch the error, log it, and return a structured response.
      this.logger.error(`An error occurred while processing ${url}:`, error.stack);

      // Elaborate on the error type for better client-side handling
      if (error instanceof TimeoutError) {
        return {
          html: null,
          status: HttpStatus.GATEWAY_TIMEOUT,
          error: `Navigation timed out after ${NETWORK_IDLE_TIMEOUT / 1000}s. The target page is likely too slow or unresponsive.`,
          finalUrl: page.url() ?? url,
        };
      }

      // Return a generic server error for any other unexpected puppeteer or logic error.
      return {
        html: null,
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'An unexpected internal error occurred during page processing. See service logs for details.',
        finalUrl: page.url() ?? url,
      };

    } finally {
      await page.close();
    }
  }
}