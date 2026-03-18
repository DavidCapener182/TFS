/**
 * Capture Store/CRM screenshots for the admin guide.
 * Run with: node scripts/capture-store-crm-screenshots.js
 *
 * Prereqs:
 * 1. Start the app: npm run dev
 * 2. Ensure you can log in at http://localhost:3000
 *
 * This script opens a browser. If you're not logged in, log in when it opens.
 * After 8 seconds it will navigate to Stores, open the first store, and capture
 * three screenshots into docs/admin-guides/.
 */

const puppeteer = require('puppeteer')
const path = require('path')
const fs = require('fs')

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const OUTPUT_DIR = path.join(__dirname, '..', 'docs', 'admin-guides')
const LOGIN_WAIT_MS = 8000
const EMAIL = process.env.SCREENSHOT_USER_EMAIL || process.env.TEST_USER_EMAIL
const PASSWORD = process.env.SCREENSHOT_USER_PASSWORD || process.env.TEST_USER_PASSWORD

async function loginIfNeeded(page) {
  const url = page.url()
  if (!url.includes('login') && !url.includes('auth') && !url.includes('sign')) return true
  if (EMAIL && PASSWORD) {
    console.log('Logging in with SCREENSHOT_USER_EMAIL...')
    await page.type('#email', EMAIL, { delay: 50 })
    await page.type('#password', PASSWORD, { delay: 50 })
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ])
    await new Promise((r) => setTimeout(r, 2000))
    return !page.url().includes('login')
  }
  if (process.env.HEADLESS === '0') {
    console.log('Please log in in the browser window. Waiting 25 seconds...')
    await new Promise((r) => setTimeout(r, 25000))
    await page.goto(BASE_URL + '/stores', { waitUntil: 'networkidle2', timeout: 15000 })
    await new Promise((r) => setTimeout(r, 2000))
    return true
  }
  console.log('Set SCREENSHOT_USER_EMAIL and SCREENSHOT_USER_PASSWORD to capture without opening a browser.')
  return false
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    console.error('Output dir missing:', OUTPUT_DIR)
    process.exit(1)
  }

  const headless = process.env.HEADLESS !== '0'
  if (!headless) console.log('Browser will open. Log in if needed.')
  const browser = await puppeteer.launch({
    headless,
    defaultViewport: { width: 1200, height: 800 },
  })

  try {
    const page = await browser.newPage()
    await page.goto(BASE_URL + '/stores', { waitUntil: 'networkidle2', timeout: 15000 })
    await new Promise((r) => setTimeout(r, LOGIN_WAIT_MS))

    if (!(await loginIfNeeded(page))) {
      await browser.close()
      process.exit(1)
    }

    const url = page.url()
    if (url.includes('login') || url.includes('auth') || url.includes('sign')) {
      console.error('Still on login page. Set SCREENSHOT_USER_EMAIL and SCREENSHOT_USER_PASSWORD, or run with HEADLESS=0 and log in.')
      await browser.close()
      process.exit(1)
    }

    // Find first store link and go to store detail (CRM page)
    const storeLink = await page.$('a[href^="/stores/"]')
    if (!storeLink) {
      console.error('Could not find a store link. Are you on the stores list?')
      await browser.close()
      process.exit(1)
    }
    await storeLink.click()
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {})
    await new Promise((r) => setTimeout(r, 1500))

    // 1) Store detail page with CRM tabs (viewport so CRM panel is in view)
    await page.screenshot({
      path: path.join(OUTPUT_DIR, 'stores-step-1-detail.png'),
      type: 'png',
      fullPage: false,
    })
    console.log('Saved stores-step-1-detail.png')

    // 2) Add Contact form – click "Add Contact" then capture viewport
    const addContactClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const btn = buttons.find(b => b.textContent.includes('Add Contact') && !b.textContent.includes('Cancel'))
      if (btn) { btn.click(); return true }
      return false
    })
    if (addContactClicked) await new Promise((r) => setTimeout(r, 800))
    await page.screenshot({
      path: path.join(OUTPUT_DIR, 'stores-step-2-add-contact.png'),
      type: 'png',
      fullPage: false,
    })
    console.log('Saved stores-step-2-add-contact.png')

    // 3) Store Notes tab → New Note → capture viewport
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Store Notes'))
      if (tabs) tabs.click()
    })
    await new Promise((r) => setTimeout(r, 600))
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('New Note'))
      if (btn) btn.click()
    })
    await new Promise((r) => setTimeout(r, 800))
    await page.screenshot({
      path: path.join(OUTPUT_DIR, 'stores-step-3-new-note.png'),
      type: 'png',
      fullPage: false,
    })
    console.log('Saved stores-step-3-new-note.png')

    console.log('Done. Screenshots saved to docs/admin-guides/')
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
