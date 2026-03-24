const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER_LOG:', msg.type(), msg.text()));
  page.on('pageerror', error => console.error('BROWSER_ERROR:', error));
  
  await page.goto('http://localhost:3000');
  
  // Wait for the app to initialize
  await page.waitForTimeout(1000);
  
  console.log("Navigating to settings...");
  
  // Click the settings button
  await page.evaluate(() => {
     window.location.hash = '/settings';
  });
  
  await page.waitForTimeout(1000); // give time for route to render
  
  // Dump the main content HTML
  const content = await page.evaluate(() => document.getElementById('main-content').innerHTML);
  console.log("MAIN CONTENT HTML:", content.substring(0, 500) + "...");
  
  await browser.close();
})();
