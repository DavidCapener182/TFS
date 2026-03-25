import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'

// Define styles - compact version for more questions per page
const styles = StyleSheet.create({
  page: {
    backgroundColor: '#FFFFFF',
    paddingTop: 60, // Space for header
    paddingBottom: 50, // Space for footer
    paddingHorizontal: 40,
    fontFamily: 'Helvetica',
  },
  // Header styles
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 50,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingHorizontal: 40,
    paddingTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerText: {
    fontSize: 10,
    color: '#111827',
    fontWeight: 'bold',
  },
  headerDate: {
    fontSize: 10,
    color: '#6B7280',
  },
  // Footer styles
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 40,
    paddingTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 9,
    color: '#6B7280',
  },
  // Main content
  mainHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 2,
    borderBottomColor: '#111827',
    paddingBottom: 20,
    marginBottom: 24,
  },
  headerLeft: {
    flexDirection: 'column',
    gap: 8,
  },
  logo: {
    width: 40,
    height: 40,
    backgroundColor: '#4F46E5',
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    textTransform: 'uppercase',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 9,
    color: '#6B7280',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    fontStyle: 'italic',
    letterSpacing: 2,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  dateLabel: {
    fontSize: 9,
    color: '#9CA3AF',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  dateValue: {
    fontSize: 12,
    color: '#111827',
    fontWeight: 'bold',
  },
  badge: {
    backgroundColor: '#10B981',
    color: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginTop: 10,
  },
  scoreSection: {
    flexDirection: 'row',
    gap: 32,
    paddingVertical: 24,
    paddingHorizontal: 40,
    marginHorizontal: -40,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    marginBottom: 24,
  },
  scoreItem: {
    flexDirection: 'column',
    gap: 4,
  },
  scoreLabel: {
    fontSize: 9,
    color: '#9CA3AF',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  scoreValue: {
    fontSize: 48,
    color: '#111827',
    fontWeight: 'bold',
  },
  auditorNameText: {
    fontSize: 16,
    color: '#111827',
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  idText: {
    fontSize: 12,
    color: '#4F46E5',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    fontFamily: 'Courier',
  },
  // Disclaimer styles (text, not question)
  disclaimerContainer: {
    marginBottom: 24,
  },
  disclaimerText: {
    fontSize: 10,
    color: '#111827',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  },
  // General Site Information section
  siteInfoSection: {
    marginTop: 24,
    marginBottom: 24,
  },
  siteInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  siteInfoLabel: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: 'normal',
  },
  siteInfoValue: {
    fontSize: 10,
    color: '#111827',
    fontWeight: 'normal',
    textAlign: 'right',
    flex: 1,
  },
  siteInfoLocation: {
    fontSize: 10,
    color: '#111827',
    fontWeight: 'normal',
    textAlign: 'right',
    lineHeight: 1.4,
  },
  // Failed questions overview
  failedSection: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#FEF2F2',
    borderWidth: 2,
    borderColor: '#FCA5A5',
    borderRadius: 4,
  },
  failedSectionHeader: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#DC2626',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  failedQuestion: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#FCA5A5',
  },
  failedQuestionText: {
    fontSize: 10,
    color: '#111827',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  failedAnswerBadge: {
    backgroundColor: '#EF4444',
    color: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    alignSelf: 'flex-start',
  },
  // Section styles
  section: {
    marginTop: 16,
    marginBottom: 16,
    gap: 12,
  },
  sectionHeader: {
    backgroundColor: '#111827',
    color: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 3,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  questionContainer: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  questionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  questionText: {
    flex: 1,
    fontSize: 12,
    color: '#111827',
    fontWeight: 'bold',
    lineHeight: 1.3,
    paddingRight: 24,
  },
  // Answer badges - different colors based on type
  answerBadge: {
    backgroundColor: '#10B981',
    color: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  answerBadgeNo: {
    backgroundColor: '#EF4444',
  },
  answerBadgeInfo: {
    backgroundColor: '#9CA3AF', // Grey for info/N/A
    color: '#FFFFFF',
  },
  answerBadgeNa: {
    backgroundColor: '#9CA3AF', // Grey for N/A
    color: '#FFFFFF',
  },
  answerText: {
    fontSize: 10,
    color: '#111827',
    fontWeight: 'normal',
  },
  commentLabel: {
    fontSize: 8,
    color: '#6B7280',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 4,
  },
  commentText: {
    fontSize: 9,
    color: '#111827',
    marginTop: 2,
    lineHeight: 1.4,
  },
  // Media/photo styles
  mediaContainer: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mediaImage: {
    width: 80,
    height: 80,
    borderRadius: 4,
    objectFit: 'cover',
  },
  // Signature styles
  signatureContainer: {
    marginTop: 8,
  },
  signatureImage: {
    width: 200,
    height: 60,
    objectFit: 'contain',
  },
})

interface InspectionReportPDFProps {
  template: any
  instance: any
  store: any
  responses: any[]
  media: any[]
  overallScore: number
  auditorName: string
}

export const InspectionReportPDF = ({
  template,
  instance,
  store,
  responses,
  media,
  overallScore,
  auditorName,
}: InspectionReportPDFProps) => {
  const formatDate = (dateString: string) => {
    if (!dateString) return new Date().toLocaleDateString('en-GB')
    return new Date(dateString).toLocaleDateString('en-GB')
  }

  const formatDateTime = (dateString: string) => {
    if (!dateString) return new Date().toLocaleString('en-GB')
    const date = new Date(dateString)
    return date.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }) + ' GMT'
  }

  const formatLocation = () => {
    const parts: string[] = []
    if (store?.address_line_1) parts.push(store.address_line_1)
    if (store?.city) parts.push(store.city)
    if (store?.postcode) parts.push(store.postcode)
    if (store?.region) parts.push(store.region)
    if (store?.latitude && store?.longitude) {
      parts.push(`(${store.latitude},`)
      parts.push(`${store.longitude})`)
    }
    return parts.length > 0 ? parts.join('\n') : '—'
  }

  const getAnswer = (questionId: string) => {
    const response = responses.find((r: any) => r.question_id === questionId)
    // Check both response_value and response_json
    if (response?.response_value) {
      return response.response_value
    }
    if (response?.response_json) {
      // If response_json is a string (like data:image...), return it
      if (typeof response.response_json === 'string') {
        return response.response_json
      }
      // If it's an object, return the whole object
      return response.response_json
    }
    return null
  }

  const getComment = (questionId: string): string | null => {
    const response = responses.find((r: any) => r.question_id === questionId)
    if (!response?.response_json) return null
    if (typeof response.response_json === 'object' && response.response_json !== null) {
      const comment = response.response_json.comment
      if (typeof comment === 'string' && comment.trim().length > 0) {
        return comment.trim()
      }
    }
    return null
  }

  const formatAnswer = (answer: any): string => {
    if (typeof answer === 'string') return answer
    if (typeof answer === 'object' && answer !== null) {
      if (answer.value) return answer.value
      if (typeof answer === 'object' && !Array.isArray(answer)) {
        return JSON.stringify(answer)
      }
    }
    return 'UNANSWERED'
  }

  const isPass = (answer: any, question: any): boolean => {
    const str = formatAnswer(answer).toLowerCase()
    // Special case: enforcement action question - "no" is pass
    if (question.question_text?.toLowerCase().includes('enforcement action')) {
      return str === 'no' || str === 'n'
    }
    return str === 'yes' || str === 'y' || str === 'true'
  }

  const getAnswerBadgeStyle = (answer: any, question: any): any => {
    const answerStr = formatAnswer(answer).toLowerCase()
    if (answerStr === 'na' || answerStr === 'n/a') {
      return [styles.answerBadge, styles.answerBadgeNa]
    }
    if (question.question_type === 'yesno') {
      const passed = isPass(answer, question)
      return passed ? styles.answerBadge : [styles.answerBadge, styles.answerBadgeNo]
    }
    // For info questions (number, text, etc.), use grey - but only if they should show a badge
    // Most info questions won't show badges, but if they do, use grey
    return [styles.answerBadge, styles.answerBadgeInfo]
  }

  const getMediaForQuestion = (questionId: string) => {
    return media.filter((m: any) => m.question_id === questionId)
  }

  const isSignatureData = (answer: any): boolean => {
    if (typeof answer === 'string' && answer.startsWith('data:image')) {
      return true
    }
    if (typeof answer === 'object' && answer !== null) {
      const str = JSON.stringify(answer)
      return str.includes('data:image') || str.includes('base64')
    }
    return false
  }

  const getSignatureData = (answer: any): string | null => {
    if (!answer) return null
    
    // If answer is a string and starts with data:image, return it
    if (typeof answer === 'string' && answer.startsWith('data:image')) {
      return answer
    }
    
    // If answer is an object, check for signature data
    if (typeof answer === 'object' && answer !== null) {
      // Check common fields where signature might be stored
      if (answer.value && typeof answer.value === 'string' && answer.value.startsWith('data:image')) {
        return answer.value
      }
      if (answer.data && typeof answer.data === 'string' && answer.data.startsWith('data:image')) {
        return answer.data
      }
      // Check if the whole object stringified contains data:image
      const str = JSON.stringify(answer)
      if (str.includes('data:image')) {
        // Try to extract - look for data:image/png;base64, pattern
        const match = str.match(/data:image[^"]+/)
        if (match) {
          return match[0].replace(/\\"/g, '"')
        }
      }
    }
    
    return null
  }

  const formatAnswerForDisplay = (answer: any, question: any): string => {
    // If it's a signature, don't show the base64 data
    if (isSignatureData(answer)) {
      return 'SIGNED'
    }
    return formatAnswer(answer).toUpperCase() || 'UNANSWERED'
  }

  const getAllQuestions = () => {
    const allQuestions: any[] = []
    template.sections?.forEach((section: any) => {
      section.questions?.forEach((question: any) => {
        allQuestions.push({ ...question, sectionTitle: section.title })
      })
    })
    return allQuestions
  }

  // Get all failed questions (only yes/no questions where answer is "no")
  const getFailedQuestions = () => {
    const allQuestions = getAllQuestions()
    const failed: any[] = []
    
    allQuestions.forEach((question: any) => {
      if (question.question_type === 'yesno') {
        const answer = getAnswer(question.id)
        const answerStr = formatAnswer(answer).toLowerCase()
        if (answerStr === 'na' || answerStr === 'n/a') {
          return
        }
        const passed = isPass(answer, question)
        if (!passed) {
          failed.push(question)
        }
      }
    })
    
    return failed
  }

  const failedQuestions = getFailedQuestions()
  const storeName = store?.store_name || 'Site'
  const storeCode = store?.store_code ? ` (${store.store_code})` : ''
  const auditDate = formatDate(instance.conducted_at || instance.created_at)

  const pageStyle = styles.page

  return (
    <Document>
      {/* First Page - Header, Score, Disclaimer, Failed Overview */}
      <Page size="A4" orientation="portrait" style={pageStyle}>
        {/* Header on every page */}
        <View style={styles.header} fixed>
          <Text style={styles.headerText}>{storeName}{storeCode}</Text>
          <Text style={styles.headerDate}>{auditDate}</Text>
        </View>

        {/* Footer on every page */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{auditorName}</Text>
          <Text style={styles.footerText}>KSS NW LTD</Text>
        </View>

        {/* Main Header */}
        <View style={styles.mainHeader}>
          <View style={styles.headerLeft}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>SC</Text>
            </View>
            <Text style={styles.title}>INSPECTION REPORT</Text>
            <Text style={styles.subtitle}>
              {storeName}{storeCode}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.dateLabel}>DATE</Text>
            <Text style={styles.dateValue}>{auditDate}</Text>
            <View style={styles.badge}>
              <Text>
                {overallScore >= 90 ? 'CERTIFIED PASS' : 'ISSUES FLAG'}
              </Text>
            </View>
          </View>
        </View>

        {/* Score Section */}
        <View style={styles.scoreSection}>
          <View style={styles.scoreItem}>
            <Text style={styles.scoreLabel}>Score</Text>
            <Text style={styles.scoreValue}>{overallScore}%</Text>
          </View>
          <View style={styles.scoreItem}>
            <Text style={styles.scoreLabel}>Auditor</Text>
            <Text style={styles.auditorNameText}>{auditorName.toUpperCase()}</Text>
          </View>
          <View style={styles.scoreItem}>
            <Text style={styles.scoreLabel}>ID</Text>
            <Text style={styles.idText}>{instance.id.slice(-8).toUpperCase()}</Text>
          </View>
        </View>

        {/* General Site Information */}
        <View style={styles.siteInfoSection}>
          <View style={styles.siteInfoRow}>
            <Text style={styles.siteInfoLabel}>Site conducted</Text>
            <Text style={styles.siteInfoValue}>{storeName}{storeCode ? `, ${storeCode}` : ''}</Text>
          </View>
          <View style={styles.siteInfoRow}>
            <Text style={styles.siteInfoLabel}>Conducted on</Text>
            <Text style={styles.siteInfoValue}>{formatDateTime(instance.conducted_at || instance.created_at)}</Text>
          </View>
          <View style={styles.siteInfoRow}>
            <Text style={styles.siteInfoLabel}>Prepared by</Text>
            <Text style={styles.siteInfoValue}>{auditorName}</Text>
          </View>
          <View style={styles.siteInfoRow}>
            <Text style={styles.siteInfoLabel}>Location</Text>
            <Text style={styles.siteInfoLocation}>{formatLocation()}</Text>
          </View>
        </View>
      </Page>

      {/* Page 2 - Disclaimer */}
      {template.sections?.find((s: any) => s.title?.toLowerCase() === 'disclaimer') && (() => {
        const disclaimerSection = template.sections.find((s: any) => s.title?.toLowerCase() === 'disclaimer')
        const disclaimerQuestion = disclaimerSection?.questions?.[0]
        if (disclaimerQuestion) {
          return (
            <Page size="A4" orientation="portrait" style={pageStyle}>
              {/* Header on every page */}
              <View style={styles.header} fixed>
                <Text style={styles.headerText}>{storeName}{storeCode}</Text>
                <Text style={styles.headerDate}>{auditDate}</Text>
              </View>

              {/* Footer on every page */}
              <View style={styles.footer} fixed>
                <Text style={styles.footerText}>{auditorName}</Text>
                <Text style={styles.footerText}>KSS NW LTD</Text>
              </View>

              {/* Disclaimer Section */}
              <Text style={styles.sectionHeader}>Disclaimer</Text>
              <View style={styles.disclaimerContainer}>
                <Text style={styles.disclaimerText}>{disclaimerQuestion.question_text}</Text>
              </View>
            </Page>
          )
        }
        return null
      })()}

      {/* Page 3 - Failed Questions Overview */}
      {failedQuestions.length > 0 && (
        <Page size="A4" orientation="portrait" style={pageStyle}>
          {/* Header on every page */}
          <View style={styles.header} fixed>
            <Text style={styles.headerText}>{storeName}{storeCode}</Text>
            <Text style={styles.headerDate}>{auditDate}</Text>
          </View>

          {/* Footer on every page */}
          <View style={styles.footer} fixed>
            <Text style={styles.footerText}>{auditorName}</Text>
            <Text style={styles.footerText}>KSS NW LTD</Text>
          </View>

          <View style={styles.failedSection}>
            <Text style={styles.failedSectionHeader}>Failed Questions Overview</Text>
            {failedQuestions.map((question: any) => {
              const answer = getAnswer(question.id)
              const answerStr = formatAnswer(answer)
              return (
                <View key={question.id} style={styles.failedQuestion}>
                  <Text style={styles.failedQuestionText}>{question.question_text}</Text>
                  <View style={styles.failedAnswerBadge}>
                    <Text>{answerStr.toUpperCase() || 'UNANSWERED'}</Text>
                  </View>
                </View>
              )
            })}
          </View>
        </Page>
      )}

      {/* Each section on its own page */}
      {template.sections?.map((section: any) => {
        const sectionQuestions = section.questions || []
        const isDisclaimer = section.title?.toLowerCase() === 'disclaimer'
        
        // Skip disclaimer section as it's on the first page
        if (isDisclaimer) return null
        
        if (sectionQuestions.length === 0) return null

        return (
          <Page key={section.id} size="A4" orientation="portrait" style={pageStyle} wrap={false}>
            {/* Header on every page */}
            <View style={styles.header} fixed>
              <Text style={styles.headerText}>{storeName}{storeCode}</Text>
              <Text style={styles.headerDate}>{auditDate}</Text>
            </View>

            {/* Footer on every page */}
            <View style={styles.footer} fixed>
              <Text style={styles.footerText}>{auditorName}</Text>
              <Text style={styles.footerText}>KSS NW LTD</Text>
            </View>

            {/* Section Content */}
            <View style={styles.section}>
              <Text style={styles.sectionHeader}>{section.title}</Text>
              {sectionQuestions.map((question: any) => {
                const answer = getAnswer(question.id)
                const answerStr = formatAnswerForDisplay(answer, question)
                const questionMedia = getMediaForQuestion(question.id)
                const signatureData = getSignatureData(answer)
                const comment = getComment(question.id)

                // Check if this is Action Plan Sign Off section - don't show badges for text/date fields
                const isActionPlanSection = section.title?.toLowerCase().includes('action plan')
                // Only show badges for yes/no questions (avoid grey duplicates)
                const shouldShowBadge = question.question_type === 'yesno'

                return (
                  <View key={question.id} style={styles.questionContainer}>
                    <View style={styles.questionRow}>
                      <Text style={styles.questionText}>{question.question_text}</Text>
                      {shouldShowBadge && !isSignatureData(answer) && (
                        <View style={getAnswerBadgeStyle(answer, question)}>
                          <Text>{answerStr}</Text>
                        </View>
                      )}
                    </View>
                    
                    {/* Show signature image if available */}
                    {signatureData && (
                      <View style={styles.signatureContainer}>
                        {/* eslint-disable-next-line jsx-a11y/alt-text */}
                        <Image src={signatureData} style={styles.signatureImage} />
                      </View>
                    )}
                    
                    {/* Show answer text for non-badge answers (text, date, number, etc.) */}
                    {!isSignatureData(answer) && question.question_type !== 'yesno' && question.question_type !== 'signature' && (
                      <Text style={styles.answerText}>{formatAnswer(answer) || '—'}</Text>
                    )}

                    {/* Show comment if available */}
                    {comment && (
                      <View>
                        <Text style={styles.commentLabel}>Comment</Text>
                        <Text style={styles.commentText}>{comment}</Text>
                      </View>
                    )}

                    {/* Show media/photos if available */}
                    {questionMedia.length > 0 && (
                      <View style={styles.mediaContainer}>
                        {questionMedia.map((mediaItem: any, idx: number) => {
                          // Media URLs should be passed via props from API route
                          // For now, skip media rendering until we have URLs
                          return null
                        })}
                      </View>
                    )}
                  </View>
                )
              })}
            </View>
          </Page>
        )
      })}
    </Document>
  )
}
