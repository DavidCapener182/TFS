import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import puppeteer, { type Browser, type LaunchOptions, type Page } from 'puppeteer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const EXACT_TEMPLATE_VERSION = 'exact-v2'

interface ExactPdfRequestBody {
  html?: string
  filename?: string
}

function sanitizeFileName(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function resolveChromeExecutablePath(): string | undefined {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
  ].filter(Boolean) as string[]

  return candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate)
    } catch {
      return false
    }
  })
}

function clampPdfDimensionPx(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.max(1, Math.min(Math.ceil(value), 14_400))
}

async function waitForFontsAndImages(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const fontSet = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts
    if (fontSet) {
      await fontSet.ready.catch(() => undefined)
    }

    const pendingImages = Array.from(document.images).filter((image) => !image.complete)
    if (pendingImages.length === 0) return

    await Promise.all(
      pendingImages.map(
        (image) =>
          new Promise<void>((resolve) => {
            let settled = false
            const done = () => {
              if (settled) return
              settled = true
              resolve()
            }
            image.addEventListener('load', done, { once: true })
            image.addEventListener('error', done, { once: true })
            setTimeout(done, 5000)
          })
      )
    )
  })
}

export async function POST(request: NextRequest) {
  let browser: Browser | null = null

  try {
    const body = ((await request.json().catch(() => ({}))) || {}) as ExactPdfRequestBody
    const html = typeof body.html === 'string' ? body.html.trim() : ''

    if (!html) {
      return NextResponse.json({ error: 'Missing newsletter HTML for PDF export.' }, { status: 400 })
    }

    const preferredName =
      typeof body.filename === 'string' && body.filename.trim().length > 0
        ? sanitizeFileName(body.filename.trim())
        : `monthly-newsletter-${Date.now()}-exact.pdf`
    const fileName = preferredName.endsWith('.pdf') ? preferredName : `${preferredName}.pdf`

    const launchOptions: LaunchOptions = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    }

    const chromeExecutable = resolveChromeExecutablePath()
    if (chromeExecutable) {
      launchOptions.executablePath = chromeExecutable
    }

    browser = await puppeteer.launch(launchOptions)
    const page = await browser.newPage()
    await page.setViewport({ width: 1800, height: 2400, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: 'networkidle0' })
    await page.emulateMediaType('screen')
    await waitForFontsAndImages(page)
    await new Promise((resolve) => setTimeout(resolve, 160))

    const contentSize = await page.evaluate(() => {
      const doc = document.documentElement
      const body = document.body
      return {
        width: Math.max(
          doc?.scrollWidth || 0,
          body?.scrollWidth || 0,
          doc?.offsetWidth || 0,
          body?.offsetWidth || 0
        ),
        height: Math.max(
          doc?.scrollHeight || 0,
          body?.scrollHeight || 0,
          doc?.offsetHeight || 0,
          body?.offsetHeight || 0
        ),
      }
    })
    const pdfWidthPx = clampPdfDimensionPx(contentSize.width, 1400)
    const pdfHeightPx = clampPdfDimensionPx(contentSize.height, 2100)

    const pdfBuffer = await page.pdf({
      width: `${pdfWidthPx}px`,
      height: `${pdfHeightPx}px`,
      printBackground: true,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm',
      },
      preferCSSPageSize: false,
      pageRanges: '1',
    })

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
        'X-Pdf-Template-Version': EXACT_TEMPLATE_VERSION,
      },
    })
  } catch (error: any) {
    console.error('Error generating exact newsletter PDF:', error)

    const launchHint = resolveChromeExecutablePath()
      ? ''
      : ` No Chrome executable was found. Set PUPPETEER_EXECUTABLE_PATH to your browser binary (for example: ${path.join(
          '/Applications',
          'Google Chrome.app',
          'Contents',
          'MacOS',
          'Google Chrome'
        )}).`

    return NextResponse.json(
      {
        error: `${error?.message || 'Failed to generate exact newsletter PDF.'}${launchHint}`,
      },
      { status: 500 }
    )
  } finally {
    if (browser) {
      await browser.close().catch(() => {})
    }
  }
}
