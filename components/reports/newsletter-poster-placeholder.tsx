import React from 'react'
import type {
  AreaNewsletterReport,
  NewsletterStoreActionFocusItem,
} from '@/lib/reports/monthly-newsletter-types'
import styles from './newsletter-poster-placeholder.module.css'

interface NewsletterPosterPlaceholderProps {
  report: AreaNewsletterReport
  newsletterMonth: string
}

type FocusTone = 'mint' | 'indigo' | 'rose' | 'amber' | 'cyan' | 'slate'
type ComplianceStatus = 'GREEN' | 'AMBER' | 'RED'

interface PosterFocusCard {
  title: string
  prompt: string
  imagePath: string
  tone: FocusTone
}

const MAX_POSTER_FOCUS_CARDS = 6
const FOCUS_TONES: FocusTone[] = ['mint', 'indigo', 'rose', 'amber', 'cyan', 'slate']
const FOCUS_IMAGE_FALLBACK_PATH = '/newsletter-placeholders/focus-generic.svg'

function formatMonthLabel(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})$/)
  if (!match) return value

  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const date = new Date(Date.UTC(year, month, 1))
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function resolveFocusImagePath(topic: string): string {
  const lower = topic.toLowerCase()
  if (lower.includes('emergency') && lower.includes('lighting')) {
    return '/newsletter-placeholders/focus-emergency-lighting-tests.png'
  }
  if (lower.includes('panel') && lower.includes('fault')) {
    return '/newsletter-placeholders/focus-fire-panel-fault-follow-up.png'
  }
  if (lower.includes('housekeeping') || lower.includes('slip') || lower.includes('trip')) {
    return '/newsletter-placeholders/focus-housekeeping-safe-access.png'
  }
  if (lower.includes('contractor') || lower.includes('visitor') || lower.includes('permit')) {
    return '/newsletter-placeholders/focus-contractor-visitor-controls.png'
  }
  if (
    lower.includes('fire') ||
    lower.includes('exit') ||
    lower.includes('door') ||
    lower.includes('escape')
  ) {
    return '/newsletter-placeholders/focus-fire-door-escape-routes.png'
  }
  if (lower.includes('height') || lower.includes('ladder') || lower.includes('step')) {
    return '/newsletter-placeholders/focus-work-at-height-equipment.png'
  }
  if (lower.includes('training') || lower.includes('refresher') || lower.includes('induction')) {
    return '/newsletter-placeholders/focus-training-refresher-completion.png'
  }
  if (
    lower.includes('coshh') ||
    lower.includes('hazardous') ||
    lower.includes('chemical') ||
    lower.includes('sds')
  ) {
    return '/newsletter-placeholders/focus-coshh-hazardous-substances.png'
  }
  return '/newsletter-placeholders/focus-generic.png'
}

function normalizeFocusTitle(topic: string, index: number): string {
  const trimmed = topic.trim()
  if (!trimmed) return `Focus Item ${index + 1}`

  const lower = trimmed.toLowerCase()
  if (lower.includes('housekeeping') || lower.includes('slip') || lower.includes('trip')) {
    return 'Stockroom Housekeeping'
  }
  if (lower.includes('contractor') || lower.includes('visitor') || lower.includes('permit')) {
    return 'Contractor / Visitor Controls'
  }
  if (
    lower.includes('fire') &&
    (lower.includes('door') || lower.includes('exit') || lower.includes('escape'))
  ) {
    return 'Fire Door & Escape Routes'
  }
  if (lower.includes('height') || lower.includes('ladder') || lower.includes('step')) {
    return 'Work-at-Height Equipment'
  }
  if (lower.includes('training') || lower.includes('refresher') || lower.includes('induction')) {
    return 'Training Completion'
  }
  if (
    lower.includes('coshh') ||
    lower.includes('hazardous') ||
    lower.includes('chemical') ||
    lower.includes('sds')
  ) {
    return 'COSHH Controls'
  }

  const compact = trimmed.replace(/\s+/g, ' ').replace(/[.?!]+$/, '')
  const words = compact.split(' ')
  if (words.length <= 4) return compact
  return `${words.slice(0, 4).join(' ')}...`
}

function tightenManagerPrompt(prompt: string): string {
  const trimmed = prompt.trim()
  if (!trimmed) return 'Ensure standards are maintained and evidence is uploaded.'

  return trimmed
    .replace(
      /reinforce daily housekeeping checks so walkways, stock areas, and exits stay clear throughout the trading day\./i,
      'Ensure sales floor and stock routes remain clear throughout trading hours.'
    )
    .replace(
      /check ladder and step equipment is uniquely identified, inspected, and used under the correct controls\./i,
      'Verify work-at-height equipment is identified, inspected and logged.'
    )
    .replace(/^ask store teams to\s+/i, 'Store teams must ')
    .replace(/^ask area managers to\s+/i, 'Area managers must ')
}

function resolveComplianceStatus(
  metrics: AreaNewsletterReport['storeActionMetrics']
): ComplianceStatus {
  if (metrics.overdueCount > 0) return 'RED'
  if (metrics.highPriorityCount > 0 || metrics.activeCount > 0) return 'AMBER'
  return 'GREEN'
}

function buildFocusImageStyle(imagePath: string): React.CSSProperties {
  return {
    backgroundImage: `url(${imagePath}), url(${FOCUS_IMAGE_FALLBACK_PATH})`,
  }
}

function toFocusCard(item: NewsletterStoreActionFocusItem, index: number): PosterFocusCard {
  return {
    title: normalizeFocusTitle(item.topic || '', index),
    prompt: tightenManagerPrompt(item.managerPrompt || ''),
    imagePath: resolveFocusImagePath(item.topic || ''),
    tone: FOCUS_TONES[index % FOCUS_TONES.length],
  }
}

function buildFocusCards(report: AreaNewsletterReport): PosterFocusCard[] {
  return report.storeActionMetrics.focusItems.slice(0, MAX_POSTER_FOCUS_CARDS).map(toFocusCard)
}

const focusToneClass: Record<FocusTone, string> = {
  mint: styles.priorityMint,
  indigo: styles.priorityIndigo,
  rose: styles.priorityRose,
  amber: styles.priorityAmber,
  cyan: styles.priorityCyan,
  slate: styles.prioritySlate,
}

export function NewsletterPosterPlaceholder({
  report,
  newsletterMonth,
}: NewsletterPosterPlaceholderProps) {
  const focusCards = buildFocusCards(report)
  const focusSlots = Array.from({ length: MAX_POSTER_FOCUS_CARDS }, (_, index) => focusCards[index] || null)
  const complianceStatus = resolveComplianceStatus(report.storeActionMetrics)
  const monthLabel = formatMonthLabel(newsletterMonth)

  const statusHeadline =
    complianceStatus === 'GREEN'
      ? 'On Track'
      : complianceStatus === 'AMBER'
        ? 'Action Required'
        : 'Critical'

  const statusMeta =
    complianceStatus === 'GREEN'
      ? 'No open actions. Maintain standards and continue daily checks.'
      : complianceStatus === 'AMBER'
        ? 'Open actions require active management and evidence upload.'
        : 'Escalation required. Immediate corrective action and evidence upload.'

  const statusClass =
    complianceStatus === 'GREEN'
      ? styles.statusGreen
      : complianceStatus === 'AMBER'
        ? styles.statusAmber
        : styles.statusRed

  return (
    <section className={styles.poster} aria-label={`${report.areaLabel} poster placeholder`}>
      <div className={styles.glowOne} aria-hidden="true" />
      <div className={styles.glowTwo} aria-hidden="true" />

      <header className={styles.header}>
        <p className={styles.brand}>FOOTASYLUM</p>
        <p className={styles.updatePill}>HEALTH &amp; SAFETY AUDIT UPDATE • {monthLabel.toUpperCase()}</p>
      </header>

      <div className={styles.metricsGrid}>
        <article className={styles.metricTile}>
          <p className={styles.metricLabel}>Open Actions</p>
          <p className={styles.metricValue}>{report.storeActionMetrics.activeCount}</p>
        </article>
        <article className={styles.metricTile}>
          <p className={styles.metricLabel}>High Risk</p>
          <p className={styles.metricValue}>{report.storeActionMetrics.highPriorityCount}</p>
        </article>
        <article className={styles.metricTile}>
          <p className={styles.metricLabel}>Overdue</p>
          <p className={styles.metricValue}>{report.storeActionMetrics.overdueCount}</p>
        </article>
        <article className={`${styles.statusTile} ${statusClass}`}>
          <p className={styles.metricLabel}>Current Status</p>
          <p className={styles.statusHeadline}>{statusHeadline}</p>
          <p className={styles.statusBadge}>{complianceStatus}</p>
          <p className={styles.statusMeta}>{statusMeta}</p>
        </article>
      </div>

      <p className={styles.trendLine}>
        Previous Month: Baseline pending | This Month: {report.storeActionMetrics.activeCount} Open |{' '}
        {report.storeActionMetrics.highPriorityCount} High Risk
      </p>

      <p className={styles.sectionTitle}>
        <span className={styles.sectionLine} />
        Priority Focus Areas
        <span className={styles.sectionLine} />
      </p>

      <div className={styles.focusGrid}>
        {focusSlots.map((card, index) =>
          card ? (
            <article key={`${card.title}-${index}`} className={styles.focusCard}>
              <p className={`${styles.priorityTag} ${focusToneClass[card.tone]}`}>PRIORITY {index + 1}</p>
              <h6 className={styles.focusTitle}>{card.title}</h6>
              <div className={styles.focusImage} style={buildFocusImageStyle(card.imagePath)} />
              <p className={styles.focusPrompt}>{card.prompt}</p>
            </article>
          ) : (
            <article key={`empty-${index}`} className={`${styles.focusCard} ${styles.focusCardEmpty}`}>
              <span>No active focus item</span>
            </article>
          )
        )}
      </div>

      <div className={styles.bottomRow}>
        <div className={styles.remindersPanel}>
          <div className={styles.remindersColumns}>
            <div className={styles.remindersColumn}>
              <p className={styles.remindersTitle}>Reminders &amp; Updates</p>
              {report.reminders.length > 0 ? (
                <ul className={styles.remindersList}>
                  {report.reminders.map((line, idx) => (
                    <li key={`reminder-${idx}`}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p className={styles.remindersEmpty}>No reminder text provided.</p>
              )}
            </div>

            <div className={styles.remindersDivider} />

            <div className={styles.remindersColumn}>
              <p className={styles.legislationTitle}>Legislation / Policy</p>
              {report.legislationUpdates.length > 0 ? (
                <ul className={styles.remindersList}>
                  {report.legislationUpdates.map((line, idx) => (
                    <li key={`legislation-${idx}`}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p className={styles.remindersEmpty}>No legislation updates provided.</p>
              )}
            </div>
          </div>
        </div>

        <div className={styles.targetPanel}>
          <p className={styles.targetValue}>{report.storeActionMetrics.activeCount === 0 ? '100%' : 'Action'}</p>
          <p className={styles.targetLabel}>Target Completion</p>
        </div>
      </div>

      <p className={styles.accountabilityLine}>
        All actions must include an owner, target date and evidence upload.
      </p>
      <p className={styles.footerMeta}>www.kssnwltd.co.uk - Health &amp; Safety Consultants</p>
    </section>
  )
}
