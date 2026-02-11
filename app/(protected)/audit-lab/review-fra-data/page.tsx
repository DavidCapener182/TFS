'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, XCircle, FileText, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'

export default function ReviewFRADataPage({
  searchParams,
}: {
  searchParams: { instanceId?: string }
}) {
  const instanceId = searchParams?.instanceId
  const [extractedData, setExtractedData] = useState<any>(null)
  const [editedData, setEditedData] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creatingReport, setCreatingReport] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!instanceId) {
      setError('Missing audit instance ID')
      setLoading(false)
      return
    }

    const fetchData = async (retryCount = 0) => {
      try {
        setLoading(true)
        console.log('[REVIEW] Fetching extracted data for instance:', instanceId, 'retry:', retryCount)
        const response = await fetch(`/api/fra-reports/extract-data?instanceId=${instanceId}`)
        console.log('[REVIEW] Response status:', response.status)
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
          console.error('[REVIEW] API error:', errorData)
          throw new Error(errorData.error || `Failed to extract data (${response.status})`)
        }
        
        const data = await response.json()
        console.log('[REVIEW] Received data:', {
          hasPdfText: data.hasPdfText,
          hasDatabaseAudit: data.hasDatabaseAudit,
          pdfTextLength: data.pdfTextLength,
          pdfExtractedCount: data.pdfExtractedCount,
          dbExtractedCount: data.dbExtractedCount,
          fields: Object.keys(data).filter(k => !k.startsWith('_') && k !== 'sources' && k !== 'sourceQuestions' && k !== 'hasPdfText' && k !== 'hasDatabaseAudit' && k !== 'pdfTextLength' && k !== 'rawPdfText' && k !== 'pdfExtractedCount' && k !== 'dbExtractedCount')
        })
        
        // If no PDF text found, retry once after a short delay (PDF might still be processing after upload)
        if (!data.hasPdfText && !data.hasDatabaseAudit && retryCount < 1) {
          console.log('[REVIEW] No data yet, retrying once in 2 seconds...')
          await new Promise(resolve => setTimeout(resolve, 2000))
          return fetchData(retryCount + 1)
        }
        // After retries (or when we have data), show the page; do not retry again
        
        setExtractedData(data)
        // Initialize edited data with extracted values
        setEditedData({
          storeManager: data.storeManager || '',
          firePanelLocation: data.firePanelLocation || '',
          firePanelFaults: data.firePanelFaults || '',
          emergencyLightingSwitch: data.emergencyLightingSwitch || '',
          numberOfFloors: data.numberOfFloors || '',
          operatingHours: data.operatingHours || '',
          conductedDate: data.conductedDate || '',
          assessmentStartTime: data.assessmentStartTime || '',
          squareFootage: data.squareFootage || '',
          escapeRoutesEvidence: data.escapeRoutesEvidence || '',
          combustibleStorageEscapeCompromise: data.combustibleStorageEscapeCompromise || '',
          fireSafetyTrainingNarrative: data.fireSafetyTrainingNarrative || '',
          fireDoorsCondition: data.fireDoorsCondition || '',
          weeklyFireTests: data.weeklyFireTests || '',
          emergencyLightingMonthlyTest: data.emergencyLightingMonthlyTest || '',
          fireExtinguisherService: data.fireExtinguisherService || '',
          managementReviewStatement: data.managementReviewStatement || '',
          // High priority fields
          numberOfFireExits: data.numberOfFireExits || '',
          totalStaffEmployed: data.totalStaffEmployed || '',
          maxStaffOnSite: data.maxStaffOnSite || '',
          youngPersonsCount: data.youngPersonsCount || '',
          fireDrillDate: data.fireDrillDate || '',
          patTestingStatus: data.patTestingStatus || '',
          fixedWireTestDate: data.fixedWireTestDate || '',
          // Medium priority fields
          exitSignageCondition: data.exitSignageCondition || '',
          compartmentationStatus: data.compartmentationStatus || '',
          extinguisherServiceDate: data.extinguisherServiceDate || '',
          callPointAccessibility: data.callPointAccessibility || '',
        })
      } catch (err: any) {
        console.error('[REVIEW] Error loading extracted data:', err)
        setError(err.message || 'Failed to load extracted data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [instanceId])

  const handleCreateReport = async () => {
    if (!instanceId) return

    try {
      setCreatingReport(true)
      setSaveError(null)

      const response = await fetch('/api/fra-reports/save-extracted-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceId,
          extractedData: editedData,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || data.details || `Failed to save (${response.status})`)
      }

      // Navigate to the FRA report view with the saved data
      window.location.href = `/audit-lab/view-fra-report?instanceId=${instanceId}`
    } catch (err: any) {
      console.error('Error creating report:', err)
      setSaveError(err.message || 'Failed to create report')
      setCreatingReport(false)
    }
  }

  const getSourceBadge = (source: string) => {
    const colors: Record<string, string> = {
      PDF: 'bg-blue-100 text-blue-800 border-blue-300',
      DATABASE: 'bg-purple-100 text-purple-800 border-purple-300',
      NOT_FOUND: 'bg-gray-100 text-gray-800 border-gray-300',
    }
    const color = colors[source] || 'bg-gray-100 text-gray-800 border-gray-300'
    return (
      <Badge className={`ml-2 ${color}`}>
        {source === 'NOT_FOUND' ? 'Not Found' : source}
      </Badge>
    )
  }

  const getSourceQuestion = (fieldKey: string) => {
    const question = extractedData?.sourceQuestions?.[fieldKey]
    if (!question || typeof question !== 'string') return null
    return question
  }

  const renderFieldLabel = (title: string, fieldKey: string) => (
    <label className="block text-sm font-semibold text-slate-900 mb-2">
      <span className="inline-flex items-center gap-2 flex-wrap">
        <span>{title}</span>
        {extractedData?.sources?.[fieldKey] && getSourceBadge(extractedData.sources[fieldKey])}
      </span>
      {getSourceQuestion(fieldKey) ? (
        <span className="mt-1 block text-xs font-normal text-slate-500">
          Pulled from: {getSourceQuestion(fieldKey)}
        </span>
      ) : null}
    </label>
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-slate-600">Extracting data from H&S Audit...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="h-8 w-8 text-red-600 mx-auto mb-4" />
          <p className="text-red-600">{error}</p>
          <Link href="/audit-lab" className="mt-4 text-indigo-600 hover:underline">
            ← Back to Audits
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 flex items-center gap-4 bg-slate-900 text-white px-4 py-3 shadow">
        <Link href="/audit-lab" className="text-sm font-semibold uppercase tracking-wide">
          ← Back to Audits
        </Link>
        <span className="text-xs text-slate-300">
          Review Extracted Data
        </span>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Review Extracted Data from H&S Audit
            </CardTitle>
            <p className="text-sm text-slate-600 mt-2">
              Please review the extracted information below. You can edit any fields before creating the FRA report.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Data Source Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                    <span className="font-semibold text-blue-900">Data Sources</span>
                  </div>
                  {extractedData?.hasPdfText && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDebug(!showDebug)}
                      className="text-xs"
                    >
                      {showDebug ? 'Hide' : 'Show'} PDF Text
                    </Button>
                  )}
                </div>
                <div className="text-sm text-blue-800 space-y-1">
                  <div className="flex items-center gap-2">
                    <span>PDF Text:</span>
                    {extractedData?.hasPdfText ? (
                      <span className="text-green-700 font-semibold">✓ Found ({extractedData?.pdfTextLength} characters)</span>
                    ) : (
                      <span className="text-red-700 font-semibold">✗ Not found</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span>Database Audit:</span>
                    {extractedData?.hasDatabaseAudit ? (
                      <span className="text-green-700 font-semibold">✓ Found</span>
                    ) : (
                      <span className="text-red-700 font-semibold">✗ Not found</span>
                    )}
                  </div>
                  {extractedData && !extractedData.hasPdfText && (
                    <div className="mt-2 p-3 bg-amber-50 border border-amber-300 rounded text-sm text-amber-900">
                      <strong>No PDF text was extracted from the H&S audit.</strong>
                      <ul className="list-disc list-inside mt-2 space-y-0.5">
                        <li>Go back to the audit, remove the current PDF and upload the H&S audit PDF again (parsing works on Windows and Mac).</li>
                        <li>Or enter the information below manually and create the report.</li>
                      </ul>
                      <p className="mt-2">If you re-upload the same PDF and text still does not appear, check the server or browser console for errors.</p>
                    </div>
                  )}
                </div>
                {extractedData && Object.keys(extractedData).filter(k => !k.startsWith('_') && k !== 'sources' && k !== 'sourceQuestions' && k !== 'hasPdfText' && k !== 'hasDatabaseAudit' && k !== 'pdfTextLength').length === 0 && (
                  <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                    ⚠️ No data was extracted. Please check the browser console for extraction logs, or manually enter the information below.
                  </div>
                )}
                {showDebug && extractedData?.hasPdfText && (
                  <div className="mt-4 p-3 bg-white border border-blue-200 rounded max-h-96 overflow-auto">
                    <div className="text-xs font-mono text-slate-700 whitespace-pre-wrap break-words">
                      {extractedData.rawPdfText || 'PDF text not available in response'}
                    </div>
                  </div>
                )}
              </div>

              {/* Store Manager */}
              <div>
                {renderFieldLabel('Store Manager / Person in Charge', 'storeManager')}
                <Textarea
                  value={editedData.storeManager || ''}
                  onChange={(e) => setEditedData({ ...editedData, storeManager: e.target.value })}
                  placeholder="Store Manager name"
                  className="min-h-[60px]"
                />
              </div>

              {/* Assessment Date */}
              <div>
                {renderFieldLabel('Assessment Date (Conducted Date)', 'conductedDate')}
                <Textarea
                  value={editedData.conductedDate || ''}
                  onChange={(e) => setEditedData({ ...editedData, conductedDate: e.target.value })}
                  placeholder="e.g., 22 Jan 2026"
                  className="min-h-[40px]"
                />
              </div>

              {/* Assessment Start Time */}
              <div>
                {renderFieldLabel('Assessment start time', 'assessmentStartTime')}
                <Textarea
                  value={editedData.assessmentStartTime || ''}
                  onChange={(e) => setEditedData({ ...editedData, assessmentStartTime: e.target.value })}
                  placeholder="e.g., 12:00 pm"
                  className="min-h-[40px]"
                />
              </div>

              {/* Number of Floors */}
              <div>
                {renderFieldLabel('Number of Floors', 'numberOfFloors')}
                <Textarea
                  value={editedData.numberOfFloors || ''}
                  onChange={(e) => setEditedData({ ...editedData, numberOfFloors: e.target.value })}
                  placeholder="e.g., 1"
                  className="min-h-[40px]"
                />
              </div>

              {/* Square Footage */}
              <div>
                {renderFieldLabel('Square Footage / Floor Area', 'squareFootage')}
                <Textarea
                  value={editedData.squareFootage || ''}
                  onChange={(e) => setEditedData({ ...editedData, squareFootage: e.target.value })}
                  placeholder="e.g., 5000 sq ft"
                  className="min-h-[40px]"
                />
              </div>

              {/* Fire Panel Location */}
              <div>
                {renderFieldLabel('Fire Panel Location', 'firePanelLocation')}
                <Textarea
                  value={editedData.firePanelLocation || ''}
                  onChange={(e) => setEditedData({ ...editedData, firePanelLocation: e.target.value })}
                  placeholder="e.g., Electrical cupboard by the rear fire door"
                  className="min-h-[60px]"
                />
              </div>

              {/* Fire Panel Faults */}
              <div>
                {renderFieldLabel('Fire Panel Faults Status', 'firePanelFaults')}
                <Textarea
                  value={editedData.firePanelFaults || ''}
                  onChange={(e) => setEditedData({ ...editedData, firePanelFaults: e.target.value })}
                  placeholder="e.g., Yes / No / Panel status to be verified"
                  className="min-h-[60px]"
                />
              </div>

              {/* Emergency Lighting Switch Location */}
              <div>
                {renderFieldLabel('Emergency Lighting Test Switch Location', 'emergencyLightingSwitch')}
                <Textarea
                  value={editedData.emergencyLightingSwitch || ''}
                  onChange={(e) => setEditedData({ ...editedData, emergencyLightingSwitch: e.target.value })}
                  placeholder="e.g., Electrical cupboard by the rear fire doors"
                  className="min-h-[60px]"
                />
              </div>

              {/* Fire exit routes / escape routes */}
              <div>
                {renderFieldLabel('Fire exit routes / escape routes', 'escapeRoutesEvidence')}
                <Textarea
                  value={editedData.escapeRoutesEvidence || ''}
                  onChange={(e) => setEditedData({ ...editedData, escapeRoutesEvidence: e.target.value })}
                  placeholder="e.g., Observed during recent inspections: fire exits partially blocked... or leave blank if clear"
                  className="min-h-[60px]"
                />
              </div>

              {/* Combustible storage & escape routes */}
              <div>
                {renderFieldLabel('Combustible storage & escape routes', 'combustibleStorageEscapeCompromise')}
                <Textarea
                  value={editedData.combustibleStorageEscapeCompromise || ''}
                  onChange={(e) => setEditedData({ ...editedData, combustibleStorageEscapeCompromise: e.target.value })}
                  placeholder="e.g., OK or Escape routes compromised"
                  className="min-h-[40px]"
                />
              </div>

              {/* Fire safety training */}
              <div>
                {renderFieldLabel('Fire safety training', 'fireSafetyTrainingNarrative')}
                <Textarea
                  value={editedData.fireSafetyTrainingNarrative || ''}
                  onChange={(e) => setEditedData({ ...editedData, fireSafetyTrainingNarrative: e.target.value })}
                  placeholder="e.g., Fire safety training is delivered via induction and toolbox talks; improvements currently underway."
                  className="min-h-[60px]"
                />
              </div>

              {/* Fire doors & compartmentation */}
              <div>
                {renderFieldLabel('Fire doors & compartmentation', 'fireDoorsCondition')}
                <Textarea
                  value={editedData.fireDoorsCondition || ''}
                  onChange={(e) => setEditedData({ ...editedData, fireDoorsCondition: e.target.value })}
                  placeholder="e.g., Good condition; intumescent strips present; not wedged open"
                  className="min-h-[60px]"
                />
              </div>

              {/* Weekly fire alarm tests */}
              <div>
                {renderFieldLabel('Weekly fire alarm tests', 'weeklyFireTests')}
                <Textarea
                  value={editedData.weeklyFireTests || ''}
                  onChange={(e) => setEditedData({ ...editedData, weeklyFireTests: e.target.value })}
                  placeholder="e.g., Documented or Yes"
                  className="min-h-[40px]"
                />
              </div>

              {/* Monthly emergency lighting tests */}
              <div>
                {renderFieldLabel('Monthly emergency lighting tests', 'emergencyLightingMonthlyTest')}
                <Textarea
                  value={editedData.emergencyLightingMonthlyTest || ''}
                  onChange={(e) => setEditedData({ ...editedData, emergencyLightingMonthlyTest: e.target.value })}
                  placeholder="e.g., Conducted or Yes"
                  className="min-h-[40px]"
                />
              </div>

              {/* Fire extinguishers serviced */}
              <div>
                {renderFieldLabel('Fire extinguishers serviced', 'fireExtinguisherService')}
                <Textarea
                  value={editedData.fireExtinguisherService || ''}
                  onChange={(e) => setEditedData({ ...editedData, fireExtinguisherService: e.target.value })}
                  placeholder="e.g., Serviced and accessible"
                  className="min-h-[40px]"
                />
              </div>

              {/* Management review statement */}
              <div>
                {renderFieldLabel('Management review statement', 'managementReviewStatement')}
                <Textarea
                  value={editedData.managementReviewStatement || ''}
                  onChange={(e) => setEditedData({ ...editedData, managementReviewStatement: e.target.value })}
                  placeholder="This assessment has been informed by recent health and safety inspections and site observations."
                  className="min-h-[60px]"
                />
              </div>

              {/* HIGH PRIORITY: Number of fire exits */}
              <div>
                {renderFieldLabel('Number of fire exits', 'numberOfFireExits')}
                <Textarea
                  value={editedData.numberOfFireExits || ''}
                  onChange={(e) => setEditedData({ ...editedData, numberOfFireExits: e.target.value })}
                  placeholder="e.g., 2"
                  className="min-h-[40px]"
                />
              </div>

              {/* HIGH PRIORITY: Total staff employed */}
              <div>
                {renderFieldLabel('Total staff employed', 'totalStaffEmployed')}
                <Textarea
                  value={editedData.totalStaffEmployed || ''}
                  onChange={(e) => setEditedData({ ...editedData, totalStaffEmployed: e.target.value })}
                  placeholder="e.g., 9"
                  className="min-h-[40px]"
                />
              </div>

              {/* HIGH PRIORITY: Maximum staff on site */}
              <div>
                {renderFieldLabel('Maximum staff on site at any time', 'maxStaffOnSite')}
                <Textarea
                  value={editedData.maxStaffOnSite || ''}
                  onChange={(e) => setEditedData({ ...editedData, maxStaffOnSite: e.target.value })}
                  placeholder="e.g., 3"
                  className="min-h-[40px]"
                />
              </div>

              {/* HIGH PRIORITY: Young persons count */}
              <div>
                {renderFieldLabel('Young persons employed', 'youngPersonsCount')}
                <Textarea
                  value={editedData.youngPersonsCount || ''}
                  onChange={(e) => setEditedData({ ...editedData, youngPersonsCount: e.target.value })}
                  placeholder="e.g., 1"
                  className="min-h-[40px]"
                />
              </div>

              {/* HIGH PRIORITY: Fire drill date */}
              <div>
                {renderFieldLabel('Last fire drill date', 'fireDrillDate')}
                <Textarea
                  value={editedData.fireDrillDate || ''}
                  onChange={(e) => setEditedData({ ...editedData, fireDrillDate: e.target.value })}
                  placeholder="e.g., 15 July 2025"
                  className="min-h-[40px]"
                />
              </div>

              {/* HIGH PRIORITY: PAT testing status */}
              <div>
                {renderFieldLabel('PAT / electrical testing status', 'patTestingStatus')}
                <Textarea
                  value={editedData.patTestingStatus || ''}
                  onChange={(e) => setEditedData({ ...editedData, patTestingStatus: e.target.value })}
                  placeholder="e.g., Satisfactory"
                  className="min-h-[40px]"
                />
              </div>

              {/* HIGH PRIORITY: Fixed wire test date */}
              <div>
                {renderFieldLabel('Fixed wire installation – date inspected/tested', 'fixedWireTestDate')}
                <Textarea
                  value={editedData.fixedWireTestDate || ''}
                  onChange={(e) => setEditedData({ ...editedData, fixedWireTestDate: e.target.value })}
                  placeholder="e.g., 01/09/2025 or 1 September 2025"
                  className="min-h-[40px]"
                />
              </div>

              {/* MEDIUM PRIORITY: Exit signage condition */}
              <div>
                {renderFieldLabel('Exit signage condition', 'exitSignageCondition')}
                <Textarea
                  value={editedData.exitSignageCondition || ''}
                  onChange={(e) => setEditedData({ ...editedData, exitSignageCondition: e.target.value })}
                  placeholder="e.g., Good condition"
                  className="min-h-[40px]"
                />
              </div>

              {/* MEDIUM PRIORITY: Compartmentation status */}
              <div>
                {renderFieldLabel('Compartmentation / ceiling tiles', 'compartmentationStatus')}
                <Textarea
                  value={editedData.compartmentationStatus || ''}
                  onChange={(e) => setEditedData({ ...editedData, compartmentationStatus: e.target.value })}
                  placeholder="e.g., No breaches identified"
                  className="min-h-[40px]"
                />
              </div>

              {/* MEDIUM PRIORITY: Extinguisher service date */}
              <div>
                {renderFieldLabel('Last fire extinguisher service date', 'extinguisherServiceDate')}
                <Textarea
                  value={editedData.extinguisherServiceDate || ''}
                  onChange={(e) => setEditedData({ ...editedData, extinguisherServiceDate: e.target.value })}
                  placeholder="e.g., 10 January 2025"
                  className="min-h-[40px]"
                />
              </div>

              {/* MEDIUM PRIORITY: Call point accessibility */}
              <div>
                {renderFieldLabel('Call point accessibility', 'callPointAccessibility')}
                <Textarea
                  value={editedData.callPointAccessibility || ''}
                  onChange={(e) => setEditedData({ ...editedData, callPointAccessibility: e.target.value })}
                  placeholder="e.g., Accessible and unobstructed"
                  className="min-h-[40px]"
                />
              </div>
            </div>

            {saveError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                {saveError}
              </div>
            )}
            <div className="mt-8 pt-6 border-t flex justify-end gap-3">
              <Link href="/audit-lab">
                <Button variant="outline">Cancel</Button>
              </Link>
              <Button
                onClick={handleCreateReport}
                disabled={creatingReport}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {creatingReport ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating Report...
                  </>
                ) : (
                  <>
                    Create FRA Report
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
