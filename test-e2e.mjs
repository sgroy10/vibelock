/**
 * VibeLock End-to-End Browser Test
 * Uses Playwright to test the REAL browser experience — not API calls.
 * Takes screenshots at each step.
 */

import { chromium } from "playwright";
import { writeFileSync } from "fs";

const BASE_URL = "https://www.vibelock.in";
const SCREENSHOT_DIR = "C:/Users/HR-02/vibelock/test-screenshots";

async function takeScreenshot(page, name) {
  const path = `${SCREENSHOT_DIR}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  console.log(`  📸 Screenshot: ${name}.png`);
  return path;
}

async function test() {
  console.log("🚀 Starting VibeLock E2E Browser Test\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    // ═══════════════════════════════════════════
    // TEST 1: Landing page loads
    // ═══════════════════════════════════════════
    console.log("1️⃣  Landing page...");
    await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
    await takeScreenshot(page, "01-landing");

    const title = await page.title();
    console.log(`  Title: ${title}`);
    const heroText = await page.textContent("h1").catch(() => "NOT FOUND");
    console.log(`  Hero: ${heroText?.slice(0, 50)}`);
    console.log(`  ✅ Landing page loads\n`);

    // ═══════════════════════════════════════════
    // TEST 2: Workspace loads with prompt
    // ═══════════════════════════════════════════
    console.log("2️⃣  Workspace page...");
    const prompt = "Build a restaurant ordering app called FoodieHub with a landing page, menu page, and cart page";
    await page.goto(`${BASE_URL}/workspace/new?prompt=${encodeURIComponent(prompt)}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(5000);
    await takeScreenshot(page, "02-workspace-initial");

    // Check if sidebar exists
    const sidebar = await page.$('[class*="border-r"]').catch(() => null);
    console.log(`  Sidebar: ${sidebar ? "EXISTS" : "MISSING"}`);

    // Check if input exists and has cursor
    const input = await page.$("textarea").catch(() => null);
    console.log(`  Input: ${input ? "EXISTS" : "MISSING"}`);

    // Check for thinking indicator or building state
    await page.waitForTimeout(5000);
    await takeScreenshot(page, "03-workspace-building");

    const bodyText = await page.textContent("body");
    const hasThinking = bodyText.includes("thinking") || bodyText.includes("Building") || bodyText.includes("Generating");
    console.log(`  Building indicator: ${hasThinking ? "VISIBLE" : "NOT VISIBLE"}`);
    console.log(`  ✅ Workspace loads\n`);

    // ═══════════════════════════════════════════
    // TEST 3: Wait for app to build
    // ═══════════════════════════════════════════
    console.log("3️⃣  Waiting for build (up to 3 minutes)...");

    // Wait for either "ready" or "error" or "Max retries"
    let buildResult = "TIMEOUT";
    for (let i = 0; i < 36; i++) {
      // 36 * 5s = 3 minutes
      await page.waitForTimeout(5000);
      const text = await page.textContent("body");

      if (text.includes("Your app is ready")) {
        buildResult = "READY";
        break;
      }
      if (text.includes("Max retries")) {
        buildResult = "MAX_RETRIES";
        break;
      }
      if (text.includes("network error")) {
        buildResult = "NETWORK_ERROR";
        break;
      }

      // Log progress
      if (i % 3 === 0) {
        const phase = text.match(/Starting|Installing|Generating|Writing|Building|Fixing/)?.[0] || "waiting";
        console.log(`  ... ${phase} (${(i + 1) * 5}s)`);
      }
    }

    await takeScreenshot(page, "04-build-result");
    console.log(`  Build result: ${buildResult}`);

    if (buildResult === "READY") {
      // Check if preview iframe has content
      const iframe = await page.$("iframe");
      if (iframe) {
        const iframeSrc = await iframe.getAttribute("src");
        console.log(`  Preview URL: ${iframeSrc ? "SET" : "EMPTY"}`);
      }

      // Check for suggestion chips
      const suggestions = await page.$$('[class*="suggestion"], [class*="chip"]').catch(() => []);
      console.log(`  Suggestions: ${suggestions.length > 0 ? suggestions.length + " chips" : "NONE"}`);
    }

    // Take preview tab screenshot
    const previewTab = await page.$('button:has-text("Preview")').catch(() => null);
    if (previewTab) await previewTab.click();
    await page.waitForTimeout(2000);
    await takeScreenshot(page, "05-preview");

    // Take files tab screenshot
    const filesTab = await page.$('button:has-text("Files")').catch(() => null);
    if (filesTab) await filesTab.click();
    await page.waitForTimeout(1000);
    await takeScreenshot(page, "06-files");

    // Take console tab screenshot
    const consoleTab = await page.$('button:has-text("Console")').catch(() => null);
    if (consoleTab) await consoleTab.click();
    await page.waitForTimeout(1000);
    await takeScreenshot(page, "07-console");

    console.log(`  ✅ Build test complete\n`);

    // ═══════════════════════════════════════════
    // TEST 4: Send message 2 (if build succeeded)
    // ═══════════════════════════════════════════
    if (buildResult === "READY") {
      console.log("4️⃣  Testing message 2...");

      // Click back to preview tab
      if (previewTab) await previewTab.click();

      // Find and click textarea
      const textarea = await page.$("textarea");
      if (textarea) {
        await textarea.click();
        await textarea.fill("Add a reviews section with 3 testimonials and a footer with social links");
        await takeScreenshot(page, "08-msg2-input");

        // Press Enter
        await page.keyboard.press("Enter");
        console.log(`  Sent message 2`);

        // Wait for build
        let msg2Result = "TIMEOUT";
        for (let i = 0; i < 36; i++) {
          await page.waitForTimeout(5000);
          const text = await page.textContent("body");
          if (text.includes("Your app is ready") && text.includes("reviews")) {
            msg2Result = "READY";
            break;
          }
          if (text.includes("Max retries")) {
            msg2Result = "MAX_RETRIES";
            break;
          }
          if (i % 3 === 0) console.log(`  ... building (${(i + 1) * 5}s)`);
        }

        await takeScreenshot(page, "09-msg2-result");
        console.log(`  MSG 2 result: ${msg2Result}`);
      }
    }

    // ═══════════════════════════════════════════
    // VERDICT
    // ═══════════════════════════════════════════
    console.log("\n========================================");
    console.log("BROWSER TEST COMPLETE");
    console.log(`Build: ${buildResult}`);
    console.log("Screenshots saved to test-screenshots/");
    console.log("========================================");
  } catch (err) {
    console.error("Test error:", err.message);
    await takeScreenshot(page, "error").catch(() => {});
  } finally {
    await browser.close();
  }
}

test();
