'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { 
  ChevronRight,
  Plus,
  FileText,
  ClipboardCheck,
  History,
  ArrowLeft,
  Sparkles,
  Loader2,
  Trash2,
  Edit2,
  Upload,
  X,
  Camera,
  Image as ImageIcon,
  Download,
  CheckCircle2,
  Flame
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn, formatAppDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { getFRAStatusFromDate } from '@/lib/compliance-forecast'
import { extractFraRiskRatingFromResponses } from '@/lib/fra/risk-rating-from-responses'
import { 
  getTemplates, 
  getTemplate, 
  createTemplate,
  createAuditInstance,
  getAuditHistory,
  deleteAuditInstance,
  bulkDeleteAuditInstances,
  getAuditInstance,
  saveAuditResponse,
  uploadAuditMedia,
  completeAudit,
  getAuditDashboardData
} from '@/app/actions/safehub'

type ViewState = 'templates' | 'template-builder' | 'active-audits' | 'audit-form' | 'audit-execution' | 'audit-history'

interface Template {
  id: string
  title: string
  description?: string
  category: string
  created_at: string
  is_active: boolean
}

const getTemplateDisplayTitle = (template: { title?: string; category?: string }) => {
  if (template.category === 'footasylum_audit') {
    return 'Footasylum H&S Audit'
  }
  return template.title || 'Untitled Template'
}

const getTemplateDisplayDescription = (template: { description?: string; category?: string }) => {
  if (template.category === 'footasylum_audit') {
    return 'Comprehensive H&S audit template for Footasylum stores. Includes disclaimer and all standard sections.'
  }
  return template.description || ''
}

const getTemplateTheme = (category?: string) => {
  switch (category) {
    case 'fire_risk_assessment':
      return {
        card: 'border-l-4 border-l-orange-500',
        header: 'bg-orange-50/60',
        badge: 'border-orange-200 text-orange-700 bg-orange-50',
        action: 'text-orange-700',
      }
    case 'footasylum_audit':
      return {
        card: 'border-l-4 border-l-indigo-500',
        header: 'bg-indigo-50/60',
        badge: 'border-indigo-200 text-indigo-700 bg-indigo-50',
        action: 'text-indigo-700',
      }
    default:
      return {
        card: 'border-l-4 border-l-slate-300',
        header: 'bg-slate-50/60',
        badge: 'border-slate-200 text-slate-600 bg-slate-50',
        action: 'text-indigo-600',
      }
  }
}

const toTitleCase = (value: string): string =>
  value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

const extractFraRiskRating = (audit: any): string | null =>
  (typeof audit?.fra_overall_risk_rating === 'string' && audit.fra_overall_risk_rating.trim())
    ? audit.fra_overall_risk_rating
    : extractFraRiskRatingFromResponses(Array.isArray(audit?.fa_audit_responses) ? audit.fa_audit_responses : [])

const getFraRiskBadgeClass = (risk: string | null): string => {
  switch ((risk || '').toLowerCase()) {
    case 'tolerable':
      return 'text-emerald-700 bg-emerald-50 border-emerald-200'
    case 'moderate':
      return 'text-amber-700 bg-amber-50 border-amber-200'
    case 'substantial':
      return 'text-orange-700 bg-orange-50 border-orange-200'
    case 'intolerable':
      return 'text-rose-700 bg-rose-50 border-rose-200'
    default:
      return 'text-slate-600 bg-slate-50 border-slate-200'
  }
}


type PreviousFailure = {
  questionId: string
  questionText: string
  failedAt: string
}

type PreviousFailureMap = Record<string, PreviousFailure>

export function AuditLabClient() {
  const [activeTab, setActiveTab] = useState('templates')
  const [view, setView] = useState<'templates' | 'template-builder' | 'audit-form' | 'audit-execution'>('templates')
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [selectedAuditInstance, setSelectedAuditInstance] = useState<string | null>(null)
  const [activeAudits, setActiveAudits] = useState<any[]>([])
  const [loadingAudits, setLoadingAudits] = useState(true)
  const [auditHistory, setAuditHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [historyNotice, setHistoryNotice] = useState<string | null>(null)
  const [previousFailures, setPreviousFailures] = useState<PreviousFailureMap>({})
  const [dashboardAudits, setDashboardAudits] = useState<any[]>([])
  const [loadingDashboard, setLoadingDashboard] = useState(false)
  const [aiInsights, setAiInsights] = useState<string | null>(null)
  const [loadingInsights, setLoadingInsights] = useState(false)
  const [dashboardStoreFilter, setDashboardStoreFilter] = useState<string>('all')

  useEffect(() => {
    loadTemplates()
  }, [])

  useEffect(() => {
    if (activeTab === 'active-audits') {
      loadActiveAudits()
    } else if (activeTab === 'history') {
      loadAuditHistory()
    } else if (activeTab === 'dashboard') {
      loadDashboardAudits()
    }
  }, [activeTab])

  const loadTemplates = async () => {
    try {
      setLoading(true)
      const data = await getTemplates()
      setTemplates(data as Template[])
    } catch (error) {
      console.error('Error loading templates:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadActiveAudits = async () => {
    try {
      setLoadingAudits(true)
      const active = await getAuditHistory({ status: ['draft', 'in_progress'] })
      setActiveAudits(active)
    } catch (error) {
      console.error('Error loading active audits:', error)
    } finally {
      setLoadingAudits(false)
    }
  }

  const loadAuditHistory = async () => {
    try {
      setLoadingHistory(true)
      const data = await getAuditHistory({ status: 'completed' })
      setAuditHistory(data)
    } catch (error) {
      console.error('Error loading audit history:', error)
    } finally {
      setLoadingHistory(false)
    }
  }

  const loadDashboardAudits = async () => {
    try {
      setLoadingDashboard(true)
      const data = await getAuditDashboardData()
      setDashboardAudits(data)
    } catch (error) {
      console.error('Error loading dashboard audits:', error)
    } finally {
      setLoadingDashboard(false)
    }
  }

  const dashboardStats = useMemo(() => {
    const audits = dashboardAudits || []
    const scores = audits
      .map((a: any) => Number(a.overall_score))
      .filter((score: number) => !Number.isNaN(score))
    const avgScore = scores.length > 0
      ? Math.round((scores.reduce((acc, score) => acc + score, 0) / scores.length) * 10) / 10
      : 0

    const now = new Date()
    const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const last30Count = audits.filter((a: any) => {
      const date = new Date(a.conducted_at || a.created_at)
      return date >= last30
    }).length

    const recentAudits = audits
      .slice()
      .sort((a: any, b: any) => {
        const aDate = new Date(a.conducted_at || a.created_at).getTime()
        const bDate = new Date(b.conducted_at || b.created_at).getTime()
        return bDate - aDate
      })
      .slice(0, 6)

    const distinctStoresCount = new Set(audits.map((a: any) => a.store_id)).size
    const isFraOnly = audits.length > 0 && audits.every((a: any) => (a.fa_audit_templates as any)?.category === 'fire_risk_assessment')

    const storeMap = new Map<string, { count: number; total: number; latestDate: string | null }>()
    audits.forEach((a: any) => {
      const storeName = a.fa_stores?.store_name || 'Unknown Store'
      const score = Number(a.overall_score) || 0
      const dateStr = a.conducted_at || a.created_at
      const entry = storeMap.get(storeName) || { count: 0, total: 0, latestDate: null }
      const existingLatest = entry.latestDate ? new Date(entry.latestDate).getTime() : 0
      const thisDate = dateStr ? new Date(dateStr).getTime() : 0
      storeMap.set(storeName, {
        count: entry.count + 1,
        total: entry.total + score,
        latestDate: thisDate >= existingLatest ? dateStr : entry.latestDate,
      })
    })

    const storeStats = Array.from(storeMap.entries()).map(([name, data]) => ({
      name,
      count: data.count,
      avg: data.count > 0 ? Math.round((data.total / data.count) * 10) / 10 : 0,
      latestDate: data.latestDate,
    }))
    storeStats.sort((a, b) => b.count - a.count)

    const questionFailMap = new Map<string, { count: number; total: number; section: string }>()
    const sectionFailMap = new Map<string, { count: number; total: number }>()
    const storeFailMap = new Map<string, number>()

    audits.forEach((audit: any) => {
      const storeName = audit.fa_stores?.store_name || 'Unknown Store'
      const responses = audit.fa_audit_responses || []

      responses.forEach((response: any) => {
        const question = response.fa_audit_template_questions
        if (!question || question.question_type !== 'yesno') return

        const rawAnswer = response.response_value || response.response_json?.value || response.response_json
        if (!rawAnswer) return
        const answer = String(rawAnswer).toLowerCase()
        if (answer === 'na' || answer === 'n/a') return

        const key = question.question_text || 'Unnamed Question'
        const sectionTitle = question.fa_audit_template_sections?.title || 'Unknown Section'
        const existing = questionFailMap.get(key) || { count: 0, total: 0, section: sectionTitle }
        const sectionExisting = sectionFailMap.get(sectionTitle) || { count: 0, total: 0 }

        const failed = answer === 'no'
        questionFailMap.set(key, {
          count: existing.count + (failed ? 1 : 0),
          total: existing.total + 1,
          section: sectionTitle,
        })
        sectionFailMap.set(sectionTitle, {
          count: sectionExisting.count + (failed ? 1 : 0),
          total: sectionExisting.total + 1,
        })
        if (failed) {
          storeFailMap.set(storeName, (storeFailMap.get(storeName) || 0) + 1)
        }
      })
    })

    const topFailedQuestions = Array.from(questionFailMap.entries())
      .map(([question, data]) => ({
        question,
        section: data.section,
        fails: data.count,
        total: data.total,
        rate: data.total > 0 ? Math.round((data.count / data.total) * 100) : 0,
      }))
      .filter((item) => item.total > 0)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 8)

    const sectionFails = Array.from(sectionFailMap.entries())
      .map(([section, data]) => ({
        section,
        fails: data.count,
        total: data.total,
        rate: data.total > 0 ? Math.round((data.count / data.total) * 100) : 0,
      }))
      .filter((item) => item.total > 0)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 6)

    const storeFails = Array.from(storeFailMap.entries())
      .map(([name, fails]) => ({ name, fails }))
      .sort((a, b) => b.fails - a.fails)
      .slice(0, 6)

    const storeOptions = Array.from(storeMap.entries())
      .map(([name, data]) => ({ name, count: data.count }))
      .sort((a, b) => a.name.localeCompare(b.name))

    const filteredAudits = dashboardStoreFilter === 'all'
      ? audits
      : audits.filter((a: any) => a.fa_stores?.store_name === dashboardStoreFilter)

    const storeAuditHistory = filteredAudits
      .slice()
      .sort((a: any, b: any) => {
        const aDate = new Date(a.conducted_at || a.created_at).getTime()
        const bDate = new Date(b.conducted_at || b.created_at).getTime()
        return bDate - aDate
      })

    const latestAudit = storeAuditHistory[0] || null
    const previousAudit = storeAuditHistory[1] || null
    const latestScore = latestAudit ? Math.round(latestAudit.overall_score || 0) : null
    const previousScore = previousAudit ? Math.round(previousAudit.overall_score || 0) : null
    const scoreDelta = latestScore !== null && previousScore !== null
      ? latestScore - previousScore
      : null

    const selectedStore = dashboardStoreFilter === 'all'
      ? null
      : (audits.find((a: any) => a.fa_stores?.store_name === dashboardStoreFilter)?.fa_stores || null)

    const selectedStoreCity = selectedStore?.city || null
    const selectedStoreRegion = selectedStore?.region || null

    const selectedScores = filteredAudits
      .map((a: any) => Number(a.overall_score))
      .filter((s: number) => !Number.isNaN(s))
    const selectedAvg = selectedScores.length > 0
      ? Math.round((selectedScores.reduce((acc, s) => acc + s, 0) / selectedScores.length) * 10) / 10
      : null

    const areaAudits = audits.filter((a: any) => {
      if (!selectedStoreCity && !selectedStoreRegion) return false
      const cityMatch = selectedStoreCity && a.fa_stores?.city === selectedStoreCity
      const regionMatch = selectedStoreRegion && a.fa_stores?.region === selectedStoreRegion
      return cityMatch || regionMatch
    })
    const areaScores = areaAudits
      .map((a: any) => Number(a.overall_score))
      .filter((s: number) => !Number.isNaN(s))
    const areaAvg = areaScores.length > 0
      ? Math.round((areaScores.reduce((acc, s) => acc + s, 0) / areaScores.length) * 10) / 10
      : null

    const overallAvg = avgScore
    const storeRankList = storeStats
      .slice()
      .sort((a, b) => (b.avg - a.avg))
    const storeRank = dashboardStoreFilter === 'all'
      ? null
      : (storeRankList.findIndex((s) => s.name === dashboardStoreFilter) + 1 || null)

    return {
      totalAudits: audits.length,
      distinctStoresCount,
      isFraOnly,
      avgScore,
      last30Count,
      recentAudits,
      storeStats: storeStats.slice(0, 6),
      topFailedQuestions,
      sectionFails,
      storeFails,
      storeOptions,
      storeAuditHistory,
      latestAudit,
      previousAudit,
      latestScore,
      previousScore,
      scoreDelta,
      selectedStore,
      selectedAvg,
      areaAvg,
      overallAvg,
      storeRank,
      areaCount: areaAudits.length,
    }
  }, [dashboardAudits, dashboardStoreFilter])

  const handleGenerateInsights = async () => {
    try {
      setLoadingInsights(true)
      setAiInsights(null)
      const response = await fetch('/api/ai/audit-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metrics: {
            totalAudits: dashboardStats.totalAudits,
            avgScore: dashboardStats.avgScore,
            last30Count: dashboardStats.last30Count,
            distinctStoresCount: dashboardStats.distinctStoresCount,
            isFraOnly: dashboardStats.isFraOnly,
          },
          stores: dashboardStats.storeStats,
          topFailedQuestions: dashboardStats.topFailedQuestions,
          sectionFails: dashboardStats.sectionFails,
          recentAudits: dashboardStats.recentAudits.map((a: any) => ({
            store: a.fa_stores?.store_name || 'Unknown Store',
            score: a.overall_score,
            date: a.conducted_at || a.created_at,
          })),
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to generate insights')
      }
      setAiInsights(data.content || 'No insights returned.')
    } catch (error) {
      console.error('Error generating AI insights:', error)
      setAiInsights('Unable to generate insights at the moment.')
    } finally {
      setLoadingInsights(false)
    }
  }

  const handleTemplateClick = async (templateId: string) => {
    setSelectedTemplate(templateId)
    // Check if this is an FRA template - if so, we'll handle it differently
    try {
      const template = await getTemplate(templateId)
      if (template?.category === 'fire_risk_assessment') {
        // For FRA, go directly to store selection but with special handling
        setView('audit-form')
      } else {
        // Normal flow for other templates
        setView('audit-form')
      }
    } catch (error) {
      console.error('Error loading template:', error)
      setView('audit-form')
    }
  }

  const handleBackFromSubView = () => {
    setView('templates')
    setSelectedTemplate(null)
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground mb-3 md:mb-4 overflow-x-auto">
        <Link 
          href="/admin" 
          className="hover:text-foreground transition-colors whitespace-nowrap"
        >
          Admin
        </Link>
        <ChevronRight className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0" />
        <span className="text-foreground font-medium truncate">SafeHub</span>
        {selectedTemplate && view === 'audit-form' && (
          <>
            <ChevronRight className="h-3 w-3 md:h-4 md:w-4 flex-shrink-0" />
            <span className="text-foreground font-medium truncate">
              {templates.find(t => t.id === selectedTemplate)?.title || 'Template'}
            </span>
          </>
        )}
      </nav>

      {/* Main Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="overflow-x-auto pb-1">
          <TabsList className="inline-flex w-max min-w-full bg-slate-100 p-1 min-h-[44px] md:grid md:w-full md:max-w-[820px] md:grid-cols-5">
          <TabsTrigger 
            value="templates"
            className="whitespace-nowrap px-3 text-xs sm:text-sm md:min-w-0 data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm transition-all"
          >
            Templates
          </TabsTrigger>
          <TabsTrigger 
            value="active-audits"
            className="whitespace-nowrap px-3 text-xs sm:text-sm md:min-w-0 data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm transition-all"
          >
            Active Audits
          </TabsTrigger>
          <TabsTrigger 
            value="history"
            className="whitespace-nowrap px-3 text-xs sm:text-sm md:min-w-0 data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm transition-all"
          >
            History
          </TabsTrigger>
          <TabsTrigger
            value="dashboard"
            className="whitespace-nowrap px-3 text-xs sm:text-sm md:min-w-0 data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm transition-all"
          >
            Dashboard
          </TabsTrigger>
          <TabsTrigger
            value="import"
            className="whitespace-nowrap px-3 text-xs sm:text-sm md:min-w-0 data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm transition-all"
          >
            Import Audit
          </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="templates" className="mt-6">
          {view === 'templates' && (
            <TemplatesLibraryView 
              templates={templates}
              loading={loading}
              onTemplateClick={handleTemplateClick}
              onCreateNew={() => setView('template-builder')}
              onTemplatesReload={loadTemplates}
            />
          )}

          {view === 'template-builder' && (
            <TemplateBuilderView 
              onBack={handleBackFromSubView}
              onSave={() => {
                loadTemplates()
                setView('templates')
              }}
            />
          )}

          {view === 'audit-form' && selectedTemplate && (
            <AuditFormView 
              templateId={selectedTemplate}
              onBack={handleBackFromSubView}
              onStartAudit={(instanceId, failures) => {
                // Normal flow - FRA handling is done in handleStartAudit
                setSelectedAuditInstance(instanceId)
                setPreviousFailures(failures || {})
                setView('audit-execution')
              }}
            />
          )}

          {view === 'audit-execution' && selectedTemplate && selectedAuditInstance && (
            <AuditExecutionView 
              templateId={selectedTemplate}
              instanceId={selectedAuditInstance}
              previousFailures={previousFailures}
              onBack={() => {
                setSelectedAuditInstance(null)
                setView('audit-form')
              }}
            />
          )}
        </TabsContent>

        <TabsContent value="active-audits" className="mt-6">
          <ActiveAuditsView 
            audits={activeAudits} 
            loading={loadingAudits} 
            onReload={loadActiveAudits}
            onEdit={(auditInstanceId) => {
              // Find the audit to get its template_id
              const audit = activeAudits.find((a: any) => a.id === auditInstanceId)
              if (audit && audit.template_id) {
                // Set template and instance, switch to templates tab, and show audit execution view
                setSelectedTemplate(audit.template_id)
                setSelectedAuditInstance(auditInstanceId)
                setPreviousFailures({})
                setActiveTab('templates')
                setView('audit-execution')
              }
            }}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          {historyNotice && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {historyNotice}
            </div>
          )}
          <AuditHistoryView 
            audits={auditHistory} 
            loading={loadingHistory}
            onEdit={(auditId, templateId) => {
              // Find the audit to get its template_id
              const audit = auditHistory.find((a: any) => a.id === auditId)
              if (audit && (audit.template_id || templateId)) {
                // Set template and instance, switch to templates tab, and show audit execution view
                setSelectedTemplate(audit.template_id || templateId)
                setSelectedAuditInstance(auditId)
                setPreviousFailures({})
                setActiveTab('templates')
                setView('audit-execution')
              }
            }}
          />
        </TabsContent>

        <TabsContent value="dashboard" className="mt-6">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Compare Store Audits</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Select Store</label>
                  <select
                    value={dashboardStoreFilter}
                    onChange={(e) => setDashboardStoreFilter(e.target.value)}
                    className="w-full max-w-[360px] px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    disabled={loadingDashboard}
                  >
                    <option value="all">All stores</option>
                    {dashboardStats.storeOptions.map((store) => (
                      <option key={store.name} value={store.name}>
                        {store.name} ({store.count})
                      </option>
                    ))}
                  </select>
                </div>

                {dashboardStoreFilter !== 'all' && (
                  <div className="grid gap-4 md:grid-cols-12">
                    {dashboardStats.isFraOnly ? (
                      <>
                        <Card className="border-slate-200 md:col-span-4">
                          <CardHeader>
                            <CardTitle>Latest assessment</CardTitle>
                          </CardHeader>
                          <CardContent className="text-2xl font-semibold">
                            {dashboardStats.latestAudit
                              ? new Date(dashboardStats.latestAudit.conducted_at || dashboardStats.latestAudit.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                              : '—'}
                          </CardContent>
                        </Card>
                        <Card className="border-slate-200 md:col-span-4">
                          <CardHeader>
                            <CardTitle>Assessments</CardTitle>
                          </CardHeader>
                          <CardContent className="text-2xl font-semibold">
                            {dashboardStats.storeAuditHistory.length}
                          </CardContent>
                        </Card>
                        <Card className="border-slate-200 md:col-span-4">
                          <CardHeader>
                            <CardTitle>Template</CardTitle>
                          </CardHeader>
                          <CardContent className="text-sm font-medium text-slate-700">
                            {dashboardStats.latestAudit?.fa_audit_templates?.title || '—'}
                          </CardContent>
                        </Card>
                      </>
                    ) : (
                      <>
                        <Card className="border-slate-200 md:col-span-4">
                          <CardHeader>
                            <CardTitle>Latest Score</CardTitle>
                          </CardHeader>
                          <CardContent className="text-3xl font-semibold">
                            {dashboardStats.latestScore !== null ? `${dashboardStats.latestScore}%` : '—'}
                          </CardContent>
                        </Card>
                        <Card className="border-slate-200 md:col-span-4">
                          <CardHeader>
                            <CardTitle>Previous Score</CardTitle>
                          </CardHeader>
                          <CardContent className="text-3xl font-semibold">
                            {dashboardStats.previousScore !== null ? `${dashboardStats.previousScore}%` : '—'}
                          </CardContent>
                        </Card>
                        <Card className="border-slate-200 md:col-span-4">
                          <CardHeader>
                            <CardTitle>Change</CardTitle>
                          </CardHeader>
                          <CardContent className={`text-3xl font-semibold ${dashboardStats.scoreDelta !== null && dashboardStats.scoreDelta < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {dashboardStats.scoreDelta !== null ? `${dashboardStats.scoreDelta > 0 ? '+' : ''}${dashboardStats.scoreDelta}%` : '—'}
                          </CardContent>
                        </Card>
                        <Card className="border-slate-200 md:col-span-4">
                          <CardHeader>
                            <CardTitle>Store Average</CardTitle>
                          </CardHeader>
                          <CardContent className="text-2xl font-semibold">
                            {dashboardStats.selectedAvg !== null ? `${dashboardStats.selectedAvg}%` : '—'}
                          </CardContent>
                        </Card>
                        <Card className="border-slate-200 md:col-span-4">
                          <CardHeader>
                            <CardTitle>Area Average</CardTitle>
                          </CardHeader>
                          <CardContent className="text-2xl font-semibold">
                            {dashboardStats.areaAvg !== null ? `${dashboardStats.areaAvg}%` : '—'}
                            <span className="ml-2 text-xs text-slate-500">
                              ({dashboardStats.areaCount} audits)
                            </span>
                            {dashboardStats.selectedStore?.city || dashboardStats.selectedStore?.region ? (
                              <div className="text-xs font-normal text-slate-500 mt-1">
                                {dashboardStats.selectedStore?.city || '—'}
                                {dashboardStats.selectedStore?.region ? `, ${dashboardStats.selectedStore.region}` : ''}
                              </div>
                            ) : null}
                          </CardContent>
                        </Card>
                        <Card className="border-slate-200 md:col-span-4">
                          <CardHeader>
                            <CardTitle>Overall Average</CardTitle>
                          </CardHeader>
                          <CardContent className="text-2xl font-semibold">
                            {dashboardStats.overallAvg !== null ? `${dashboardStats.overallAvg}%` : '—'}
                          </CardContent>
                        </Card>
                        <Card className="border-slate-200 md:col-span-3">
                          <CardHeader>
                            <CardTitle>Store Rank</CardTitle>
                          </CardHeader>
                          <CardContent className="text-2xl font-semibold">
                            {dashboardStats.storeRank ? `#${dashboardStats.storeRank}` : '—'}
                          </CardContent>
                        </Card>
                      </>
                    )}
                    <Card className="border-slate-200 md:col-span-5">
                      <CardHeader>
                        <CardTitle>City / Region</CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm text-slate-700">
                        {dashboardStats.selectedStore?.city || '—'}
                        {dashboardStats.selectedStore?.region ? `, ${dashboardStats.selectedStore.region}` : ''}
                      </CardContent>
                    </Card>
                    <Card className="border-slate-200 md:col-span-4">
                      <CardHeader>
                        <CardTitle>Audit Count</CardTitle>
                      </CardHeader>
                      <CardContent className="text-2xl font-semibold">
                        {dashboardStats.storeAuditHistory.length}
                      </CardContent>
                    </Card>

                    <Card className="border-slate-200 md:col-span-12">
                      <CardHeader>
                        <CardTitle>Audit History</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {dashboardStats.storeAuditHistory.length === 0 && (
                          <p className="text-sm text-slate-500">No audits for this store yet.</p>
                        )}
                        {dashboardStats.storeAuditHistory.map((audit: any) => (
                          <div key={audit.id} className="flex items-center justify-between border-b pb-2 text-sm">
                            <div>
                              <div className="font-medium text-slate-800">
                                {new Date(audit.conducted_at || audit.created_at).toLocaleDateString('en-GB')}
                              </div>
                              <div className="text-xs text-slate-500">
                                {audit.fa_audit_templates?.title || 'Audit'}
                              </div>
                            </div>
                            {!dashboardStats.isFraOnly && (
                              <div className="font-semibold text-indigo-600">
                                {Math.round(audit.overall_score || 0)}%
                              </div>
                            )}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Completed Audits</CardTitle>
                </CardHeader>
                <CardContent className="text-3xl font-semibold">
                  {loadingDashboard ? '—' : dashboardStats.totalAudits}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{dashboardStats.isFraOnly ? 'Stores assessed' : 'Average Score'}</CardTitle>
                </CardHeader>
                <CardContent className={`text-3xl font-semibold ${dashboardStats.isFraOnly ? '' : 'text-indigo-600'}`}>
                  {loadingDashboard ? '—' : dashboardStats.isFraOnly ? dashboardStats.distinctStoresCount : `${dashboardStats.avgScore}%`}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Last 30 Days</CardTitle>
                </CardHeader>
                <CardContent className="text-3xl font-semibold">
                  {loadingDashboard ? '—' : dashboardStats.last30Count}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Audits</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {loadingDashboard && <p className="text-slate-500">Loading recent audits…</p>}
                  {!loadingDashboard && dashboardStats.recentAudits.length === 0 && (
                    <p className="text-slate-500">No completed audits yet.</p>
                  )}
                  {!loadingDashboard && dashboardStats.recentAudits.map((audit: any) => (
                    <div key={audit.id} className="flex items-center justify-between border-b pb-2">
                      <div className="text-slate-700">
                        <div className="font-medium">{audit.fa_stores?.store_name || 'Unknown Store'}</div>
                        <div className="text-xs text-slate-500">
                          {new Date(audit.conducted_at || audit.created_at).toLocaleDateString('en-GB')}
                          {audit.fa_audit_templates?.title && ` · ${audit.fa_audit_templates.title}`}
                        </div>
                      </div>
                      {!dashboardStats.isFraOnly && (
                        <div className="text-indigo-600 font-semibold">{Math.round(audit.overall_score || 0)}%</div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top Stores by Audit Count</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {loadingDashboard && <p className="text-slate-500">Loading store stats…</p>}
                  {!loadingDashboard && dashboardStats.storeStats.length === 0 && (
                    <p className="text-slate-500">No store data yet.</p>
                  )}
                  {!loadingDashboard && dashboardStats.storeStats.map((store) => (
                    <div key={store.name} className="flex items-center justify-between border-b pb-2">
                      <div className="text-slate-700">
                        <div className="font-medium">{store.name}</div>
                        <div className="text-xs text-slate-500">
                          {store.count} audit{store.count !== 1 ? 's' : ''}
                          {dashboardStats.isFraOnly && store.latestDate && ` · Latest ${new Date(store.latestDate).toLocaleDateString('en-GB')}`}
                        </div>
                      </div>
                      {!dashboardStats.isFraOnly && (
                        <div className="text-slate-700 font-semibold">{store.avg}%</div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Top Failed Questions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {loadingDashboard && <p className="text-slate-500">Loading failure data…</p>}
                  {!loadingDashboard && dashboardStats.topFailedQuestions.length === 0 && (
                    <p className="text-slate-500">No failures recorded yet.</p>
                  )}
                  {!loadingDashboard && dashboardStats.topFailedQuestions.map((item) => (
                    <div key={item.question} className="border-b pb-2">
                      <div className="font-medium text-slate-800">{item.question}</div>
                      <div className="text-xs text-slate-500">{item.section}</div>
                      <div className="text-xs text-red-600 font-semibold">
                        {item.fails} fails / {item.total} ({item.rate}%)
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Sections With Most Fails</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {loadingDashboard && <p className="text-slate-500">Loading section data…</p>}
                  {!loadingDashboard && dashboardStats.sectionFails.length === 0 && (
                    <p className="text-slate-500">No failures recorded yet.</p>
                  )}
                  {!loadingDashboard && dashboardStats.sectionFails.map((item) => (
                    <div key={item.section} className="flex items-center justify-between border-b pb-2">
                      <div>
                        <div className="font-medium text-slate-800">{item.section}</div>
                        <div className="text-xs text-slate-500">
                          {item.fails} fails / {item.total}
                        </div>
                      </div>
                      <div className="text-red-600 font-semibold">{item.rate}%</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Stores With Most Failures</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {loadingDashboard && <p className="text-slate-500">Loading store failures…</p>}
                {!loadingDashboard && dashboardStats.storeFails.length === 0 && (
                  <p className="text-slate-500">No failures recorded yet.</p>
                )}
                {!loadingDashboard && dashboardStats.storeFails.map((item) => (
                  <div key={item.name} className="flex items-center justify-between border-b pb-2">
                    <div className="font-medium text-slate-800">{item.name}</div>
                    <div className="text-red-600 font-semibold">{item.fails} fails</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>AI Insights</CardTitle>
                <Button
                  size="sm"
                  onClick={handleGenerateInsights}
                  disabled={loadingInsights || loadingDashboard}
                >
                  {loadingInsights ? 'Generating…' : 'Generate Insights'}
                </Button>
              </CardHeader>
              <CardContent className="text-sm text-slate-700">
                {loadingDashboard && <p className="text-slate-500">Load dashboard data to generate insights.</p>}
                {!loadingDashboard && !aiInsights && (
                  <p className="text-slate-500">
                    Generate a short summary of trends and risks using OpenAI.
                  </p>
                )}
                {!loadingDashboard && aiInsights && (
                  <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: aiInsights }} />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="import" className="mt-6">
          <ImportAuditView
            templates={templates}
            onAuditCreated={(templateId, instanceId) => {
              setSelectedTemplate(templateId)
              setSelectedAuditInstance(instanceId)
              setPreviousFailures({})
              setHistoryNotice('Imported audit saved to history.')
              setTimeout(() => setHistoryNotice(null), 8000)
              setActiveTab('history')
              loadAuditHistory()
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Templates Library View
function TemplatesLibraryView({
  templates,
  loading,
  onTemplateClick,
  onCreateNew,
  onTemplatesReload,
}: {
  templates: Template[]
  loading: boolean
  onTemplateClick: (id: string) => void
  onCreateNew: () => void
  onTemplatesReload?: () => void
}) {
  const [seeding, setSeeding] = useState(false)
  const [creatingFRA, setCreatingFRA] = useState(false)
  const hasFRATemplate = templates.some((template) => template.category === 'fire_risk_assessment')

  const handleSeedFootAsylumTemplate = async () => {
    if (!confirm('This will create the FootAsylum SafeHub template with all sections and questions. Continue?')) {
      return
    }

    try {
      setSeeding(true)
      const response = await fetch('/api/safehub/seed-template', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to seed template')
      }

      alert('FootAsylum SafeHub template created successfully!')
      if (onTemplatesReload) {
        onTemplatesReload()
      } else {
        window.location.reload()
      }
    } catch (error: any) {
      console.error('Error seeding template:', error)
      alert(`Failed to seed template: ${error.message}`)
    } finally {
      setSeeding(false)
    }
  }

  const handleCreateFRATemplate = async () => {
    if (!confirm('Create a Fire Risk Assessment template with no questions yet?')) {
      return
    }
    try {
      setCreatingFRA(true)
      await createTemplate({
        title: 'Fire Risk Assessment',
        description: 'Fire Risk Assessment template for stores that have completed H&S audits.',
        category: 'fire_risk_assessment',
        sections: [],
      })
      alert('Fire Risk Assessment template created successfully!')
      if (onTemplatesReload) {
        onTemplatesReload()
      } else {
        window.location.reload()
      }
    } catch (error: any) {
      console.error('Error creating FRA template:', error)
      alert(`Failed to create FRA template: ${error.message || 'Unknown error'}`)
    } finally {
      setCreatingFRA(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        <Button onClick={onCreateNew} className="bg-indigo-600 hover:bg-indigo-700">
          <Plus className="h-4 w-4 mr-2" />
          Create New Template
        </Button>
        {!hasFRATemplate && (
          <Button
            onClick={handleCreateFRATemplate}
            disabled={creatingFRA}
            variant="outline"
            className="border-orange-600 text-orange-600 hover:bg-orange-50"
          >
            {creatingFRA ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Flame className="h-4 w-4 mr-2" />
            )}
            Create Fire Risk Assessment Template
          </Button>
        )}
        {templates.length === 0 && (
          <Button 
            onClick={handleSeedFootAsylumTemplate} 
            disabled={seeding}
            variant="outline"
            className="border-indigo-600 text-indigo-600 hover:bg-indigo-50"
          >
            {seeding ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating FootAsylum Template...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Seed FootAsylum SafeHub Template
              </>
            )}
          </Button>
        )}
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500 mb-4">No templates yet</p>
            <Button onClick={onCreateNew} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => {
            const theme = getTemplateTheme(template.category)
            return (
            <Card 
              key={template.id}
              className={cn('hover:shadow-lg transition-shadow cursor-pointer', theme.card)}
              onClick={() => onTemplateClick(template.id)}
            >
              <CardHeader className={cn('rounded-t-lg', theme.header)}>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-xl font-extrabold tracking-tight text-slate-900">
                    {getTemplateDisplayTitle(template)}
                  </CardTitle>
                  <Badge variant="outline" className={cn('shrink-0 ml-2', theme.badge)}>
                    {template.category.replace('_', ' ')}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {getTemplateDisplayDescription(template) && (
                  <p className="text-sm text-slate-600 mb-4">{getTemplateDisplayDescription(template)}</p>
                )}
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Created {formatAppDate(template.created_at)}</span>
                  <Button variant="ghost" size="sm" className={theme.action}>
                    Start Audit <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )})}
        </div>
      )}
    </div>
  )
}

// Template Builder View
function TemplateBuilderView({
  onBack,
  onSave,
}: {
  onBack: () => void
  onSave: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<'footasylum_audit' | 'fire_risk_assessment' | 'custom'>('custom')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!title.trim()) {
      alert('Please enter a template title')
      return
    }

    try {
      setSaving(true)
      await createTemplate({
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        sections: [],
      })
      onSave()
    } catch (error) {
      console.error('Error creating template:', error)
      alert('Failed to create template')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <CardTitle>Create New Template</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="e.g., Daily Safety Inspection"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            rows={3}
            placeholder="Describe what this audit template is for..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as any)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="custom">Custom</option>
            <option value="footasylum_audit">Footasylum Audit</option>
            <option value="fire_risk_assessment">Fire Risk Assessment</option>
          </select>
        </div>

        <div className="pt-4 border-t">
          <p className="text-sm text-slate-600 mb-4">
            Template created. Sections and questions can be added after creation.
          </p>
          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Create Template
                </>
              )}
            </Button>
            <Button variant="outline" onClick={onBack} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Audit Form View (Store Selection)
function AuditFormView({
  templateId,
  onBack,
  onStartAudit,
}: {
  templateId: string
  onBack: () => void
  onStartAudit: (instanceId: string, failures: PreviousFailureMap) => void
}) {
  const [loading, setLoading] = useState(true)
  const [template, setTemplate] = useState<any>(null)
  const [stores, setStores] = useState<any[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [startingAudit, setStartingAudit] = useState(false)
  const [loadingPrevious, setLoadingPrevious] = useState(false)
  const [previousFailures, setPreviousFailures] = useState<PreviousFailureMap>({})
  const [previousAuditDate, setPreviousAuditDate] = useState<string | null>(null)
  const [hsAuditFile, setHsAuditFile] = useState<File | null>(null)
  const [hsAuditPastedText, setHsAuditPastedText] = useState('')
  const [uploadingHSAudit, setUploadingHSAudit] = useState(false)

  // Extract store name from PDF filename
  const extractStoreNameFromFilename = (filename: string): string | null => {
    // Remove file extension
    const nameWithoutExt = filename.replace(/\.pdf$/i, '')
    
    // Try to extract store name - common patterns:
    // "Aberdeen-22-Jan-2026-David-Capener.pdf" -> "Aberdeen"
    // "Aberdeen-2...Capener.pdf" -> "Aberdeen"
    // "StoreName-..." -> "StoreName"
    
    // Split by common separators and take the first part
    const parts = nameWithoutExt.split(/[-_\s]+/)
    if (parts.length > 0) {
      const firstPart = parts[0].trim()
      // Check if it looks like a date (starts with number) - if so, skip it
      if (!/^\d/.test(firstPart) && firstPart.length > 2) {
        return firstPart
      }
      // If first part is a date, try second part
      if (parts.length > 1) {
        const secondPart = parts[1].trim()
        if (!/^\d/.test(secondPart) && secondPart.length > 2) {
          return secondPart
        }
      }
    }
    
    return null
  }

  // Auto-select store from PDF filename
  const findStoreFromFilename = (filename: string) => {
    const extractedName = extractStoreNameFromFilename(filename)
    if (!extractedName || stores.length === 0) return null
    
    const searchTerm = extractedName.toLowerCase()
    
    // Try exact match first (store name)
    let match = stores.find(store => 
      store.store_name?.toLowerCase() === searchTerm
    )
    
    // Try partial match (store name contains)
    if (!match) {
      match = stores.find(store => 
        store.store_name?.toLowerCase().includes(searchTerm) ||
        searchTerm.includes(store.store_name?.toLowerCase() || '')
      )
    }
    
    // Try city match
    if (!match) {
      match = stores.find(store => 
        store.city?.toLowerCase() === searchTerm ||
        store.city?.toLowerCase().includes(searchTerm) ||
        searchTerm.includes(store.city?.toLowerCase() || '')
      )
    }
    
    return match?.id || null
  }

  useEffect(() => {
    loadTemplate()
  }, [templateId])

  useEffect(() => {
    loadStores()
  }, [template?.category])

  useEffect(() => {
    if (selectedStoreId) {
      loadPreviousFailures(selectedStoreId)
    } else {
      setPreviousFailures({})
      setPreviousAuditDate(null)
    }
  }, [selectedStoreId, templateId])

  // Auto-select store when PDF is uploaded (only if no store is selected yet)
  useEffect(() => {
    if (hsAuditFile && stores.length > 0 && !selectedStoreId) {
      const matchedStoreId = findStoreFromFilename(hsAuditFile.name)
      if (matchedStoreId) {
        setSelectedStoreId(matchedStoreId)
      }
    }
  }, [hsAuditFile, stores, selectedStoreId])

  const loadTemplate = async () => {
    try {
      setLoading(true)
      const data = await getTemplate(templateId)
      setTemplate(data)
    } catch (error) {
      console.error('Error loading template:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadStores = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('fa_stores')
        .select('id, store_code, store_name, city, region, compliance_audit_1_date, compliance_audit_2_date, fire_risk_assessment_date')
        .eq('is_active', true)
        .order('store_name', { ascending: true })

      if (!error && data) {
        if (template?.category === 'fire_risk_assessment') {
          const eligible = data.filter((store) => {
            const hasCompletedComplianceAudit = Boolean(
              store.compliance_audit_1_date || store.compliance_audit_2_date
            )
            if (!hasCompletedComplianceAudit) return false

            const fraStatus = getFRAStatusFromDate(store.fire_risk_assessment_date)
            return fraStatus !== 'up_to_date'
          })
          setStores(eligible)
        } else {
          setStores(data)
        }
      }
    } catch (error) {
      console.error('Error loading stores:', error)
    }
  }

  const handleStartAudit = async () => {
    if (!selectedStoreId) {
      alert('Please select a store')
      return
    }

    if (!templateId) {
      alert('Template ID is missing')
      return
    }

    try {
      setStartingAudit(true)
      console.log('Creating audit instance...', { templateId, selectedStoreId })
      
      const instance = await createAuditInstance(templateId, selectedStoreId)
      console.log('[AUDIT-LAB] Audit instance created:', instance.id)
      
      // For FRA templates, open the review/report flow and wait for explicit Save + Complete.
      if (template?.category === 'fire_risk_assessment') {
        console.log('[AUDIT-LAB] FRA template detected, checking for H&S audit file:', {
          hasFile: !!hsAuditFile,
          fileName: hsAuditFile?.name,
          storeId: selectedStoreId
        })
        // If H&S audit PDF is uploaded, try to parse it (but don't fail if it doesn't work)
        if (hsAuditFile) {
          setUploadingHSAudit(true)
          console.log('[AUDIT-LAB] Uploading H&S audit PDF:', {
            fileName: hsAuditFile.name,
            fileSize: hsAuditFile.size,
            fileType: hsAuditFile.type,
            fraInstanceId: instance.id,
            storeId: selectedStoreId
          })
          
          try {
            const formData = new FormData()
            formData.append('file', hsAuditFile)
            formData.append('fraInstanceId', instance.id)
            formData.append('storeId', selectedStoreId)
            
            const response = await fetch('/api/fra-reports/parse-hs-audit', {
              method: 'POST',
              body: formData,
            })
            
            console.log('[AUDIT-LAB] PDF upload response status:', response.status)
            
            if (!response.ok) {
              const error = await response.json().catch(() => ({ error: 'Unknown error' }))
              console.warn('[AUDIT-LAB] PDF parsing failed, will use database H&S audit:', error.error || 'Unknown error')
              // Continue - don't throw error
            } else {
              const result = await response.json()
              console.log('[AUDIT-LAB] H&S audit PDF uploaded successfully:', {
                success: result.success,
                textLength: result.textLength,
                hasText: result.hasText,
                parseError: result.parseError,
                message: result.message
              })
              
              if (!result.hasText && result.parseError) {
                console.error('[AUDIT-LAB] PDF parsing failed:', result.parseError)
              }
            }
          } catch (parseError: any) {
            // Log but don't throw - we'll use database audit instead
            console.error('[AUDIT-LAB] PDF upload/parsing error, continuing with database audit:', parseError?.message || parseError)
          } finally {
            setUploadingHSAudit(false)
          }
          
          // Wait longer after upload to ensure PDF text is stored in database
          console.log('[AUDIT-LAB] Waiting 2 seconds for PDF text to be stored in database...')
          await new Promise(resolve => setTimeout(resolve, 2000))
        } else if (hsAuditPastedText.trim()) {
          setUploadingHSAudit(true)
          try {
            console.log('[AUDIT-LAB] Storing pasted H&S audit text...')
            const res = await fetch('/api/fra-reports/store-hs-audit-text', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ instanceId: instance.id, text: hsAuditPastedText.trim() })
            })
            if (!res.ok) {
              const err = await res.json().catch(() => ({ error: 'Failed to store text' }))
              throw new Error(err.error || 'Failed to store pasted text')
            }
            const result = await res.json()
            console.log('[AUDIT-LAB] Pasted H&S audit text stored:', { textLength: result.textLength, hasText: result.hasText })
            console.log('[AUDIT-LAB] Waiting 2 seconds for text to be stored in database...')
            await new Promise(resolve => setTimeout(resolve, 2000))
          } catch (pasteError: any) {
            console.error('[AUDIT-LAB] Store pasted text error:', pasteError?.message || pasteError)
            alert(`Failed to store pasted text: ${pasteError?.message || 'Unknown error'}`)
            setUploadingHSAudit(false)
            setStartingAudit(false)
            return
          } finally {
            setUploadingHSAudit(false)
          }
        } else {
          console.log('[AUDIT-LAB] No H&S audit PDF file or pasted text - will use database audit only')
        }
        
        // Do not auto-complete FRA here.
        // Completion is performed from the report view when the user clicks Save.
        console.log('[AUDIT-LAB] FRA instance prepared; waiting for user to review and save before completion.')
        
        // Navigate to review page first to show extracted data
        // Use window.location instead of window.open to avoid popup blockers
        const url = `/audit-lab/review-fra-data?instanceId=${instance.id}`
        console.log('[AUDIT-LAB] Navigating to review page:', url)
        window.location.href = url
      } else {
        // Normal flow for other audit types
        onStartAudit(instance.id, previousFailures)
        setStartingAudit(false)
      }
    } catch (error) {
      console.error('Error starting audit:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to start audit: ${errorMessage}`)
      setStartingAudit(false)
      setUploadingHSAudit(false)
    }
  }

  const loadPreviousFailures = async (storeId: string) => {
    try {
      setLoadingPrevious(true)
      const supabase = createClient()
      const { data: previousInstance } = await supabase
        .from('fa_audit_instances')
        .select('id, conducted_at, created_at')
        .eq('store_id', storeId)
        .eq('template_id', templateId)
        .eq('status', 'completed')
        .order('conducted_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!previousInstance) {
        setPreviousFailures({})
        setPreviousAuditDate(null)
        return
      }

      const { data: responses } = await supabase
        .from('fa_audit_responses')
        .select(`
          question_id,
          response_value,
          response_json,
          fa_audit_template_questions (
            id,
            question_text,
            question_type
          )
        `)
        .eq('audit_instance_id', previousInstance.id)

      const failures: PreviousFailureMap = {}
      responses?.forEach((response: any) => {
        const question = response.fa_audit_template_questions
        if (!question || question.question_type !== 'yesno') return

        const rawAnswer = response.response_value || response.response_json?.value || response.response_json
        if (!rawAnswer) return
        const answer = String(rawAnswer).toLowerCase()
        if (answer === 'na' || answer === 'n/a') return

        const isEnforcement = question.question_text?.toLowerCase().includes('enforcement action')
        const failed = isEnforcement ? answer === 'yes' : answer === 'no'
        if (!failed) return

        failures[question.id] = {
          questionId: question.id,
          questionText: question.question_text || 'Unnamed question',
          failedAt: previousInstance.conducted_at || previousInstance.created_at,
        }
      })

      setPreviousFailures(failures)
      setPreviousAuditDate(previousInstance.conducted_at || previousInstance.created_at)
    } catch (error) {
      console.error('Error loading previous failures:', error)
      setPreviousFailures({})
      setPreviousAuditDate(null)
    } finally {
      setLoadingPrevious(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto" />
        </CardContent>
      </Card>
    )
  }

  if (!template) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-slate-500">Template not found</p>
          <Button onClick={onBack} variant="outline" className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Templates
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <CardTitle>{getTemplateDisplayTitle(template)}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {template.description && (
            <p className="text-slate-600">{getTemplateDisplayDescription(template)}</p>
          )}

          {/* Store Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Select Store *</label>
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
              disabled={startingAudit}
            >
              <option value="">-- Select a store --</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.store_name} {store.store_code && `(${store.store_code})`} 
                  {store.city && ` - ${store.city}`}
                </option>
              ))}
            </select>
          </div>

          {selectedStoreId && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              {loadingPrevious && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading previous audit findings...
                </div>
              )}
              {!loadingPrevious && Object.keys(previousFailures).length === 0 && (
                <div className="text-sm text-slate-600">
                  No failed points from the last completed audit.
                </div>
              )}
              {!loadingPrevious && Object.keys(previousFailures).length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-slate-800">
                    Failed points from last audit
                    {previousAuditDate && (
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        ({new Date(previousAuditDate).toLocaleDateString('en-GB')})
                      </span>
                    )}
                  </div>
                  <ul className="space-y-1 text-sm text-slate-700">
                    {Object.values(previousFailures).map((failure) => (
                      <li key={failure.questionId} className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-red-500" />
                        <span>{failure.questionText}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* H&S Audit Upload for FRA */}
          {template?.category === 'fire_risk_assessment' && (
            <div className="pt-4 border-t space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Upload H&S Audit PDF (Optional)
                </label>
                <p className="text-xs text-slate-500 mb-2">
                  Upload the H&S audit PDF to automatically populate the FRA report. If not uploaded, the system will use the most recent H&S audit from the database.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
                          alert('Please select a PDF file')
                          return
                        }
                        if (file.size > 10 * 1024 * 1024) {
                          alert('File size must be less than 10MB')
                          return
                        }
                        setHsAuditFile(file)
                        
                        // Try to auto-select store from filename
                        if (stores.length > 0) {
                          const matchedStoreId = findStoreFromFilename(file.name)
                          if (matchedStoreId) {
                            setSelectedStoreId(matchedStoreId)
                          } else {
                            // Show a message if we couldn't match
                            console.log('Could not auto-detect store from filename:', file.name)
                          }
                        }
                      }
                    }}
                    className="text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  />
                  {hsAuditFile && (
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-slate-600">{hsAuditFile.name}</span>
                      {selectedStoreId && stores.find(s => s.id === selectedStoreId) && (
                        <span className="text-xs text-green-600">
                          ✓ Auto-selected: {stores.find(s => s.id === selectedStoreId)?.store_name}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Or paste H&S audit text</label>
                  <p className="text-xs text-slate-500">Paste the full H&S audit text here instead of uploading a PDF. It will be stored and used the same way.</p>
                  <Textarea
                    value={hsAuditPastedText}
                    onChange={(e) => setHsAuditPastedText(e.target.value)}
                    placeholder="Paste H&S audit text here..."
                    rows={6}
                    className="font-mono text-sm"
                  />
                  {hsAuditPastedText.trim().length > 0 && (
                    <p className="text-xs text-green-600">{hsAuditPastedText.trim().length} characters</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="pt-4 border-t">
            <Button 
              onClick={handleStartAudit} 
              disabled={!selectedStoreId || startingAudit || uploadingHSAudit}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {startingAudit || uploadingHSAudit ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {uploadingHSAudit ? 'Processing H&S Audit...' : 'Starting...'}
                </>
              ) : (
                <>
                  <ClipboardCheck className="h-4 w-4 mr-2" />
                  Start Audit
                </>
              )}
            </Button>
          </div>

        </div>
      </CardContent>
    </Card>
  )
}

function ImportAuditView({
  templates,
  onAuditCreated,
}: {
  templates: Template[]
  onAuditCreated: (templateId: string, instanceId: string) => void
}) {
  const [templateId, setTemplateId] = useState('')
  const [template, setTemplate] = useState<any>(null)
  const [stores, setStores] = useState<any[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [rawText, setRawText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [parsedAnswers, setParsedAnswers] = useState<Record<string, string>>({})
  const [parsedComments, setParsedComments] = useState<Record<string, string>>({})
  const [parseMeta, setParseMeta] = useState<{ durationMs: number; totalPages?: number | null; pagesParsed?: number | null } | null>(null)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [parseAllPages, setParseAllPages] = useState(false)

  useEffect(() => {
    const loadStores = async () => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('fa_stores')
          .select('id, store_code, store_name, city')
          .eq('is_active', true)
          .order('store_name', { ascending: true })
        if (!error && data) {
          setStores(data)
        }
      } catch (error) {
        console.error('Error loading stores:', error)
      }
    }
    loadStores()
  }, [])

  useEffect(() => {
    if (!templateId) {
      setTemplate(null)
      return
    }
    const loadTemplate = async () => {
      try {
        const data = await getTemplate(templateId)
        setTemplate(data)
      } catch (error) {
        console.error('Error loading template:', error)
      }
    }
    loadTemplate()
  }, [templateId])

  const applyParsedResponse = (data: any, durationMs: number) => {
    const normalizedAnswers: Record<string, string> = {}
    Object.entries(data.answers || {}).forEach(([key, value]) => {
      const str = String(value || '').trim().toLowerCase()
      if (str === 'n/a' || str === 'na') {
        normalizedAnswers[key] = 'na'
      } else if (str === 'yes' || str === 'no') {
        normalizedAnswers[key] = str
      } else {
        normalizedAnswers[key] = String(value || '')
      }
    })
    setParsedAnswers(normalizedAnswers)
    setParsedComments(data.comments || {})
    setParseMeta({
      durationMs,
      totalPages: data.totalPages,
      pagesParsed: data.pagesParsed,
    })
  }

  const handleParse = async () => {
    if (!file || !templateId) {
      setParseError('Please select a template and PDF file.')
      return
    }
    try {
      setParsing(true)
      setParseMeta(null)
      setSaveStatus(null)
      setParseError(null)
      const formData = new FormData()
      formData.append('file', file)
      formData.append('templateId', templateId)
      formData.append('maxPages', parseAllPages ? '0' : '10')
      const start = performance.now()
      const response = await fetch('/api/ai/audit-import', {
        method: 'POST',
        body: formData,
      })
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        const text = await response.text()
        throw new Error(text || 'Unexpected response from server.')
      }
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to parse audit')
      }
      applyParsedResponse(data, performance.now() - start)
    } catch (error: any) {
      console.error('Error parsing audit:', error)
      setParseError(error?.message || 'Failed to parse audit')
    } finally {
      setParsing(false)
    }
  }

  const handleParseText = async () => {
    if (!rawText.trim() || !templateId) {
      setParseError('Please select a template and paste the audit text.')
      return
    }
    try {
      setParsing(true)
      setParseMeta(null)
      setSaveStatus(null)
      setParseError(null)
      const formData = new FormData()
      formData.append('templateId', templateId)
      formData.append('rawText', rawText)
      const start = performance.now()
      const response = await fetch('/api/ai/audit-import', {
        method: 'POST',
        body: formData,
      })
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        const text = await response.text()
        throw new Error(text || 'Unexpected response from server.')
      }
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to parse audit')
      }
      applyParsedResponse(data, performance.now() - start)
    } catch (error: any) {
      console.error('Error parsing audit text:', error)
      setParseError(error?.message || 'Failed to parse audit text')
    } finally {
      setParsing(false)
    }
  }

  const normalizeAnswer = (question: any, answer: string) => {
    const raw = answer?.trim()
    if (!raw) return null
    const lower = raw.toLowerCase()

    if (question.question_type === 'yesno') {
      if (lower.includes('n/a') || lower === 'na') return 'na'
      if (lower.startsWith('y')) return 'yes'
      if (lower.startsWith('n')) return 'no'
      return null
    }

    if (question.question_type === 'number') {
      const match = raw.match(/-?\d+(\.\d+)?/)
      return match ? match[0] : null
    }

    if (question.question_type === 'date') {
      const date = new Date(raw)
      if (!Number.isNaN(date.getTime())) {
        return date.toISOString().slice(0, 10)
      }
      return raw
    }

    return raw
  }

  const handleImport = async () => {
    if (!template || !selectedStoreId) {
      setParseError('Please select a template and store.')
      return
    }
    try {
      setImporting(true)
      setParseError(null)
      setSaveStatus(null)
      const instance = await createAuditInstance(templateId, selectedStoreId)
      const questions = template.sections?.flatMap((section: any) => section.questions || []) || []
      const failures: { questionId: string; message: string }[] = []

      for (const question of questions) {
        const answer = parsedAnswers[question.id] || ''
        const normalized = normalizeAnswer(question, answer)
        const comment = parsedComments[question.id] || ''
        if (!normalized) continue
        try {
          if (question.question_type === 'multiple') {
            await saveAuditResponse(instance.id, question.id, {
              response_value: null,
              response_json: { value: normalized, comment: comment || undefined },
            })
          } else if (question.question_type === 'yesno') {
            const isEnforcement = question.question_text?.toLowerCase().includes('enforcement action')
            const lower = String(normalized).toLowerCase()
            const score =
              lower === 'na'
                ? null
                : isEnforcement
                ? lower === 'no'
                  ? 1
                  : 0
                : lower === 'yes'
                ? 1
                : 0
            await saveAuditResponse(instance.id, question.id, {
              response_value: normalized,
              response_json: { comment: comment || undefined },
              score,
            })
          } else {
            await saveAuditResponse(instance.id, question.id, {
              response_value: normalized,
              response_json: { comment: comment || undefined },
            })
          }
        } catch (error: any) {
          console.error('Error saving imported response:', error)
          failures.push({
            questionId: question.id,
            message: error?.message || 'Unknown error',
          })
        }
      }

      if (failures.length > 0) {
        setParseError(`Imported with ${failures.length} answer errors. Please review and re-save in the audit.`)
      }
      const result = await completeAudit(instance.id)
      const finalScore = result?.overall_score !== null && result?.overall_score !== undefined
        ? `${Math.round(result.overall_score)}%`
        : 'Score pending'
      setSaveStatus(`Audit saved to history (${finalScore}).`)
      onAuditCreated(templateId, instance.id)
    } catch (error) {
      console.error('Error importing audit:', error)
      setParseError((error as any)?.message || 'Failed to create audit from import.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Legacy Audit PDF</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-2">Template *</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">-- Select a template --</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Store *</label>
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">-- Select a store --</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.store_name} {store.store_code && `(${store.store_code})`} {store.city && `- ${store.city}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">PDF File *</label>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-slate-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Or paste audit text</label>
          <Textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste the full audit text extracted from the PDF..."
            className="min-h-[160px]"
          />
          <p className="mt-2 text-xs text-slate-500">
            Use this if you already copied the PDF content into text.
          </p>
        </div>

        {parseError && (
          <div className="text-sm text-red-600">{parseError}</div>
        )}

        <div className="flex flex-wrap gap-3 items-center">
          <Button onClick={handleParse} disabled={parsing || !file || !templateId}>
            {parsing ? 'Parsing…' : 'Parse PDF'}
          </Button>
          <Button
            variant="secondary"
            onClick={handleParseText}
            disabled={parsing || !rawText.trim() || !templateId}
          >
            {parsing ? 'Parsing…' : 'Parse Text'}
          </Button>
          <Button
            variant="outline"
            onClick={handleImport}
            disabled={importing || !template || Object.keys(parsedAnswers).length === 0}
          >
            {importing ? 'Saving…' : 'Save to History'}
          </Button>
        </div>
        {file && (
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={parseAllPages}
              onChange={(e) => setParseAllPages(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Parse all pages (slower but more accurate)
          </label>
        )}
        {parsing && file && (
          <div className="text-xs text-slate-500">
            Parsing PDF… this can take up to 30s on large files ({parseAllPages ? 'processing all pages' : 'processing first 10 pages'}).
          </div>
        )}
        {parsing && !file && (
          <div className="text-xs text-slate-500">
            Parsing audit text…
          </div>
        )}
        {parseMeta && (
          <div className="text-xs text-slate-500">
            Parsed in {(parseMeta.durationMs / 1000).toFixed(1)}s
            {parseMeta.totalPages || parseMeta.pagesParsed
              ? ` • ${parseMeta.pagesParsed || 0}/${parseMeta.totalPages || 0} pages`
              : ''}
            {parseMeta.totalPages && parseMeta.pagesParsed && parseMeta.pagesParsed < parseMeta.totalPages
              ? ' • Partial parse'
              : parseMeta.totalPages
              ? ' • Full parse'
              : ''}
          </div>
        )}
        {saveStatus && (
          <div className="text-xs text-emerald-600">{saveStatus}</div>
        )}

        {template && (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-slate-800">Parsed Answers</h4>
            {template.sections?.map((section: any) => (
              <div key={section.id} className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {section.title}
                </div>
                {section.questions?.map((question: any) => (
                  <div key={question.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="text-sm font-medium text-slate-800">{question.question_text}</div>
                    {question.question_type === 'yesno' ? (
                      <select
                        value={parsedAnswers[question.id] || ''}
                        onChange={(e) =>
                          setParsedAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))
                        }
                        className="mt-2 w-full max-w-[220px] px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">-- Select --</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                        <option value="na">N/A</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={parsedAnswers[question.id] || ''}
                        onChange={(e) =>
                          setParsedAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))
                        }
                        className="mt-2 w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="No answer parsed"
                      />
                    )}
                    {(question.question_type === 'yesno' || parsedComments[question.id]) && (
                      <div className="mt-3">
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Comment
                        </label>
                        <Textarea
                          value={parsedComments[question.id] || ''}
                          onChange={(e) =>
                            setParsedComments((prev) => ({ ...prev, [question.id]: e.target.value }))
                          }
                          placeholder="Add any comments or notes..."
                          className="min-h-[80px]"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Signature Canvas Component
function SignatureCanvasComponent({
  questionId,
  responseValue,
  onSignatureChange,
}: {
  questionId: string
  responseValue: string | null
  onSignatureChange: (dataURL: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Set canvas dimensions
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width || 600
    canvas.height = 192

    // Load existing signature if available
    if (responseValue && responseValue.startsWith('data:image')) {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        const img = new Image()
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        }
        img.src = responseValue
      }
    }
  }, [responseValue])

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x, y)

    const draw = (e: MouseEvent) => {
      const newX = e.clientX - rect.left
      const newY = e.clientY - rect.top
      ctx.lineTo(newX, newY)
      ctx.stroke()
      // Save continuously as user draws
      onSignatureChange(canvas.toDataURL())
    }

    const stopDrawing = () => {
      canvas.removeEventListener('mousemove', draw)
      canvas.removeEventListener('mouseup', stopDrawing)
      canvas.removeEventListener('mouseleave', stopDrawing)
      onSignatureChange(canvas.toDataURL())
    }

    canvas.addEventListener('mousemove', draw)
    canvas.addEventListener('mouseup', stopDrawing)
    canvas.addEventListener('mouseleave', stopDrawing)
  }

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const touch = e.touches[0]
    const x = touch.clientX - rect.left
    const y = touch.clientY - rect.top

    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x, y)

    const draw = (e: TouchEvent) => {
      e.preventDefault()
      const touch = e.touches[0]
      const newX = touch.clientX - rect.left
      const newY = touch.clientY - rect.top
      ctx.lineTo(newX, newY)
      ctx.stroke()
      onSignatureChange(canvas.toDataURL())
    }

    const stopDrawing = () => {
      canvas.removeEventListener('touchmove', draw)
      canvas.removeEventListener('touchend', stopDrawing)
      canvas.removeEventListener('touchcancel', stopDrawing)
      onSignatureChange(canvas.toDataURL())
    }

    canvas.addEventListener('touchmove', draw, { passive: false })
    canvas.addEventListener('touchend', stopDrawing)
    canvas.addEventListener('touchcancel', stopDrawing)
  }

  const handleClear = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      onSignatureChange('')
    }
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        className="w-full h-48 cursor-crosshair touch-none"
        style={{ borderTopLeftRadius: '0.5rem', borderTopRightRadius: '0.5rem' }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      />
      <div className="px-4 py-2 border-t border-slate-300 bg-slate-50 flex items-center justify-between">
        <p className="text-sm text-slate-600">Draw your signature above</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClear}
          className="text-xs"
        >
          Clear
        </Button>
      </div>
    </>
  )
}

// Audit Execution View - Section by section navigation
function AuditExecutionView({
  templateId,
  instanceId,
  previousFailures,
  onBack,
}: {
  templateId: string
  instanceId: string
  previousFailures: PreviousFailureMap
  onBack: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [template, setTemplate] = useState<any>(null)
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0)
  const [responses, setResponses] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, boolean>>({})
  const [comments, setComments] = useState<Record<string, string>>({})
  const [completed, setCompleted] = useState(false)
  const [completing, setCompleting] = useState(false)

  useEffect(() => {
    loadTemplate()
    loadResponses()
  }, [templateId, instanceId])

  const loadTemplate = async () => {
    try {
      setLoading(true)
      const data = await getTemplate(templateId)
      setTemplate(data)
    } catch (error) {
      console.error('Error loading template:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadResponses = async () => {
    try {
      const instance = await getAuditInstance(instanceId)
      const responsesMap: Record<string, any> = {}
      const commentsMap: Record<string, string> = {}
      instance.responses?.forEach((r: any) => {
        responsesMap[r.question_id] = r
        // Load comments from response_json if available
        if (r.response_json?.comment) {
          commentsMap[r.question_id] = r.response_json.comment
        }
      })
      setResponses(responsesMap)
      setComments(commentsMap)
    } catch (error) {
      console.error('Error loading responses:', error)
    }
  }

  const sections = template?.sections || []
  const currentSection = sections[currentSectionIndex]

  // Helper function to get short section name (before " - " or ":" if exists, otherwise truncate)
  const getShortSectionName = (title: string): string => {
    if (!title) return ''
    // Try to extract before " - " first
    const dashIndex = title.indexOf(' - ')
    if (dashIndex > 0) {
      return title.substring(0, dashIndex).trim()
    }
    // Try to extract before ":"
    const colonIndex = title.indexOf(':')
    if (colonIndex > 0) {
      return title.substring(0, colonIndex).trim()
    }
    // If no separator, return first 30 characters
    return title.length > 30 ? title.substring(0, 30).trim() + '...' : title.trim()
  }

  // Calculate scores - made reactive with useMemo
  const calculateSectionScore = (section: any, responsesMap: Record<string, any>) => {
    if (!section?.questions || section.questions.length === 0) {
      return { questions: 0, passes: 0, percentage: 0 }
    }
    
    const questions = section.questions.filter((q: any) => q.question_type === 'yesno')
    // Filter out N/A questions from scoring - only count questions with yes/no answers
    const scorableQuestions = questions.filter((question: any) => {
      const response = responsesMap[question.id]
      const responseValue = response?.response_value || response?.response_json
      return responseValue && responseValue !== 'na' && responseValue !== 'N/A'
    })
    const questionsCount = scorableQuestions.length
    let passes = 0

    scorableQuestions.forEach((question: any) => {
      const response = responsesMap[question.id]
      const responseValue = response?.response_value || response?.response_json
      
      // Special case: "enforcement action" question - "no" should get a point, "yes" shouldn't
      const isEnforcementQuestion = question.question_text?.toLowerCase().includes('enforcement action')
      
      if (isEnforcementQuestion) {
        // Inverted logic: "no" counts as pass
        if (responseValue === 'no') {
          passes++
        }
      } else {
        // Normal logic: "yes" counts as pass
        if (responseValue === 'yes') {
          passes++
        }
      }
    })

    const percentage = questionsCount > 0 ? Math.round((passes / questionsCount) * 100) : 0
    return { questions: questionsCount, passes, percentage }
  }

  // Make currentSectionScore reactive to responses changes
  const currentSectionScore = useMemo(() => {
    return calculateSectionScore(currentSection, responses)
  }, [currentSection, responses])

  // Calculate overall score (sum of all passes / sum of all questions across all sections)
  // NOTE: Only counts scored questions (yes/no questions), informational questions are excluded
  // calculateSectionScore already filters for question_type === 'yesno'
  // Make overallScore reactive to responses changes
  const overallScore = useMemo(() => {
    let totalQuestions = 0
    let totalPasses = 0

    sections.forEach((section: any) => {
      // calculateSectionScore only counts yes/no questions, ignoring informational questions
      const score = calculateSectionScore(section, responses)
      totalQuestions += score.questions // Only scored questions
      totalPasses += score.passes // Only passes from scored questions
    })

    const percentage = totalQuestions > 0 ? Math.round((totalPasses / totalQuestions) * 100) : 0
    return { questions: totalQuestions, passes: totalPasses, percentage }
  }, [sections, responses])

  // Check if section is disclaimer (no inputs needed, just display text)
  const isDisclaimerSection = currentSection?.title?.toLowerCase() === 'disclaimer'
  
  // Check if this is the Risk Assessments section
  const isRiskAssessmentsSection = currentSection?.title?.toLowerCase().includes('risk assessments')

  const handleNext = () => {
    if (currentSectionIndex < sections.length - 1) {
      setCurrentSectionIndex(currentSectionIndex + 1)
    }
  }

  const handleCompleteAudit = async () => {
    try {
      setCompleting(true)
      const result = await completeAudit(instanceId)
      setCompleted(true)
      // Reload responses to get updated status
      await loadResponses()
    } catch (error) {
      console.error('Error completing audit:', error)
      alert('Failed to complete audit. Please try again.')
    } finally {
      setCompleting(false)
    }
  }

  const isLastSection = currentSectionIndex === sections.length - 1

  const handlePrevious = () => {
    if (currentSectionIndex > 0) {
      setCurrentSectionIndex(currentSectionIndex - 1)
    }
  }

  const handleAnswerChange = async (questionId: string, value: any) => {
    // Update local state immediately for responsive UI
    const currentResponse = responses[questionId]
    const existingJson = currentResponse?.response_json || {}
    const existingComment = comments[questionId] || ''
    
    setResponses(prev => ({ 
      ...prev, 
      [questionId]: { 
        ...currentResponse,
        response_value: value,
        response_json: {
          ...existingJson,
          comment: existingComment || undefined,
        }
      } 
    }))
    
    try {
      setSaving(true)
      await saveAuditResponse(instanceId, questionId, {
        response_value: typeof value === 'string' ? value : null,
        response_json: {
          ...existingJson,
          comment: existingComment || undefined,
        },
      })
    } catch (error) {
      console.error('Error saving response:', error)
      // Reload responses on error to revert
      loadResponses()
    } finally {
      setSaving(false)
    }
  }

  const handleCommentChange = async (questionId: string, comment: string) => {
    setComments(prev => ({ ...prev, [questionId]: comment }))
    
    const currentResponse = responses[questionId]
    const existingJson = currentResponse?.response_json || {}
    
    try {
      setSaving(true)
      await saveAuditResponse(instanceId, questionId, {
        response_value: currentResponse?.response_value || null,
        response_json: {
          ...existingJson,
          comment: comment || undefined,
        },
      })
      // Update local state
      setResponses(prev => ({
        ...prev,
        [questionId]: {
          ...currentResponse,
          response_json: {
            ...existingJson,
            comment: comment || undefined,
          }
        }
      }))
    } catch (error) {
      console.error('Error saving comment:', error)
      loadResponses()
    } finally {
      setSaving(false)
    }
  }

  const handleFileUpload = async (questionId: string, file: File) => {
    try {
      setUploadingFiles(prev => ({ ...prev, [questionId]: true }))
      await uploadAuditMedia(instanceId, questionId, file)
      // Reload responses to get updated media
      await loadResponses()
    } catch (error) {
      console.error('Error uploading file:', error)
      alert(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setUploadingFiles(prev => ({ ...prev, [questionId]: false }))
    }
  }

  const renderQuestion = (question: any) => {
    const currentResponse = responses[question.id]
    const responseValue = currentResponse?.response_value || currentResponse?.response_json || null

    // Check if this is the enforcement action question (inverted scoring)
    const isEnforcementQuestion = question.question_text?.toLowerCase().includes('enforcement action')
    
    // Check if this question needs media upload and comments (1st and 3rd questions of H&S Policy section)
    const questionText = question.question_text?.toLowerCase() || ''
    const needsMediaAndComments = questionText.includes('health and safety policy available on site') || 
                                   questionText.includes('health and policy statement been signed')
    
    // Check if this is the 3rd question (needs auto-input text with date)
    const isSignedQuestion = questionText.includes('health and policy statement been signed')
    
    // Check if this is in Risk Assessments section and needs media upload
    const isRiskAssessmentsQuestion = isRiskAssessmentsSection && question.question_type === 'yesno'
    
    // Check if this is the first question in Risk Assessments (Slips, trips and falls?)
    const isFirstRiskAssessmentQuestion = isRiskAssessmentsSection && 
                                          questionText.includes('slips, trips and falls')
    
    // Check if this is in Training section and needs media upload
    const isTrainingSection = currentSection?.title?.toLowerCase() === 'training'
    const isTrainingQuestion = isTrainingSection && question.question_type === 'yesno'
    
    // Check if this is in Contractor & Visitor Safety section
    const isContractorSection = currentSection?.title?.toLowerCase().includes('contractor') || 
                                currentSection?.title?.toLowerCase().includes('visitor safety')
    
    // Check if this is the first question in Contractor section (about signing in)
    const isFirstContractorQuestion = isContractorSection && 
                                      questionText.includes('contractors managed whilst working on site')
    
    // Check if this is in Statutory Testing section and needs media upload
    const isStatutoryTestingSection = currentSection?.title?.toLowerCase().includes('statutory testing')
    const isStatutoryTestingQuestion = isStatutoryTestingSection && question.question_type === 'yesno'
    
    // Check if this is in Manual Handling section and needs media upload
    const isManualHandlingSection = currentSection?.title?.toLowerCase() === 'manual handling'
    const isManualHandlingQuestion = isManualHandlingSection && question.question_type === 'yesno'
    
    // Check if this is in COSHH section and needs media upload
    const isCoshhSection = currentSection?.title?.toLowerCase() === 'coshh'
    const isCoshhQuestion = isCoshhSection && question.question_type === 'yesno'
    
    // Check if this is in Premises and Equipment section and needs media upload
    const isPremisesEquipmentSection = currentSection?.title?.toLowerCase() === 'premises and equipment'
    const isPremisesEquipmentQuestion = isPremisesEquipmentSection && question.question_type === 'yesno'
    
    // Check if this is in Working at Height section and needs media upload
    const isWorkingAtHeightSection = currentSection?.title?.toLowerCase() === 'working at height'
    const isWorkingAtHeightQuestion = isWorkingAtHeightSection && question.question_type === 'yesno'
    
    // Check if this is question 1 or 3 in Working at Height section (needs comment box)
    const isWorkingAtHeightQuestion1 = isWorkingAtHeightSection && 
                                       questionText.includes('working at height / use of ladders')
    const isWorkingAtHeightQuestion3 = isWorkingAtHeightSection && 
                                       questionText.includes('ladder checks completed and recorded')
    
    // Check if this is in First Aid section and needs media upload and comments
    const isFirstAidSection = currentSection?.title?.toLowerCase() === 'first aid'
    const isFirstAidQuestion = isFirstAidSection && question.question_type === 'yesno'
    
    // Check if this is the "Date of last in store accident" question
    const isAccidentDateQuestion = questionText.includes('date of last in store accident') || 
                                   questionText.includes('date of last in-store accident')
    
    // Check if this is in Accident Reporting section and needs N/A
    const isAccidentReportingSection = currentSection?.title?.toLowerCase().includes('accident reporting') || 
                                      currentSection?.title?.toLowerCase().includes('accident reporting and investigation')
    
    // Check if this is the 3rd question in Accident Reporting (Accident investigations have been completed...)
    const isAccidentInvestigationQuestion = isAccidentReportingSection && 
                                           questionText.includes('accident investigations have been completed')
    
    // Check if this is in Fire Safety section and needs media upload and comments
    const isFireSafetySection = currentSection?.title?.toLowerCase() === 'fire safety'
    const isFireSafetyQuestion = isFireSafetySection && question.question_type === 'yesno'
    
    // Check if this is the sprinkler question in Fire Safety section (50mm clearance question)
    const isFireSafetySprinklerQuestion = isFireSafetySection && 
                                          questionText.includes('50mm clearance from stock to sprinkler')
    
    // Check if this is the "Location of Emergency Lighting Test Switch" question in Fire Safety
    const isEmergencyLightingLocationQuestion = isFireSafetySection && 
                                                questionText.includes('location of emergency lighting test switch')
    
    // Check if this is in Store Compliance section and needs media upload and comments
    const isStoreComplianceSection = currentSection?.title?.toLowerCase() === 'store compliance'
    const isStoreComplianceQuestion = isStoreComplianceSection && question.question_type === 'yesno'

    switch (question.question_type) {
      case 'yesno':
        const currentComment = comments[question.id] || ''
        const currentJson = currentResponse?.response_json || {}
        const dateValue = currentJson.date || ''
        
        return (
          <div className="space-y-4 mt-4">
            {/* Yes/No Buttons and Media Upload on same row */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              {/* Yes/No/N/A Buttons on the left */}
              <div className="flex gap-4">
                <Button
                  variant={responseValue === 'yes' ? 'default' : 'outline'}
                  onClick={() => handleAnswerChange(question.id, 'yes')}
                  className={
                    responseValue === 'yes'
                      ? isEnforcementQuestion
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                      : ''
                  }
                >
                  Yes
                </Button>
                <Button
                  variant={responseValue === 'no' ? 'default' : 'outline'}
                  onClick={() => handleAnswerChange(question.id, 'no')}
                  className={
                    responseValue === 'no'
                      ? isEnforcementQuestion
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-red-600 hover:bg-red-700 text-white'
                      : ''
                  }
                >
                  No
                </Button>
                {/* N/A button - only show on Statutory Testing page, asbestos question, accident investigation question, or Fire Safety sprinkler question */}
                {(isStatutoryTestingSection || questionText.includes('asbestos') || isAccidentInvestigationQuestion || isFireSafetySprinklerQuestion) && (
                  <Button
                    variant={responseValue === 'na' || responseValue === 'N/A' ? 'default' : 'outline'}
                    onClick={() => handleAnswerChange(question.id, 'na')}
                    className={
                      responseValue === 'na' || responseValue === 'N/A'
                        ? 'bg-slate-600 hover:bg-slate-700 text-white'
                        : ''
                    }
                  >
                    N/A
                  </Button>
                )}
              </div>
              
              {/* Media Upload on the right */}
              {(needsMediaAndComments || isRiskAssessmentsQuestion || isTrainingQuestion || isStatutoryTestingQuestion || isManualHandlingQuestion || isCoshhQuestion || isPremisesEquipmentQuestion || isWorkingAtHeightQuestion || isFirstAidQuestion || isFireSafetyQuestion || isStoreComplianceQuestion) && (
                <div className="flex items-center gap-3 shrink-0">
                  {/* Camera button - opens device camera */}
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          handleFileUpload(question.id, file)
                        }
                        // Reset input so same file can be selected again
                        e.target.value = ''
                      }}
                      disabled={uploadingFiles[question.id]}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      id={`camera-${question.id}`}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={uploadingFiles[question.id]}
                      className="h-10 w-10 p-0 border-slate-300 hover:bg-indigo-50 hover:border-indigo-300"
                      title="Take Photo"
                      onClick={() => document.getElementById(`camera-${question.id}`)?.click()}
                    >
                      <Camera className="h-5 w-5 text-slate-700" />
                    </Button>
                  </div>
                  
                  {/* File/Gallery button - opens file picker */}
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          handleFileUpload(question.id, file)
                        }
                        // Reset input so same file can be selected again
                        e.target.value = ''
                      }}
                      disabled={uploadingFiles[question.id]}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      id={`file-${question.id}`}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={uploadingFiles[question.id]}
                      className="h-10 w-10 p-0 border-slate-300 hover:bg-indigo-50 hover:border-indigo-300"
                      title="Upload from Gallery"
                      onClick={() => document.getElementById(`file-${question.id}`)?.click()}
                    >
                      <ImageIcon className="h-5 w-5 text-slate-700" />
                    </Button>
                  </div>
                  
                  {uploadingFiles[question.id] && (
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                  )}
                </div>
              )}
            </div>
            
            {/* Conditional text for first Contractor question */}
            {isFirstContractorQuestion && (responseValue === 'yes' || responseValue === 'no') && (
              <div className="mt-4">
                <p className="text-slate-700 font-medium">
                  {responseValue === 'yes' 
                    ? 'I was asked to sign in on arrival'
                    : 'I was not asked to sign in on arrival'}
                </p>
              </div>
            )}
            
            {/* Auto-input text with date for 3rd question */}
            {isSignedQuestion && responseValue === 'yes' && (
              <div className="mt-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-slate-700">
                  <span>The Health and Safety Policy Statement was last updated and signed by the chief financial officer on</span>
                  <input
                    type="date"
                    value={dateValue}
                    onChange={async (e) => {
                      const newDate = e.target.value
                      const newJson = { ...currentJson, date: newDate }
                      
                      // Update local state immediately
                      setResponses(prev => ({
                        ...prev,
                        [question.id]: {
                          ...currentResponse,
                          response_json: newJson
                        }
                      }))
                      
                      // Save to database
                      try {
                        setSaving(true)
                        await saveAuditResponse(instanceId, question.id, {
                          response_value: responseValue,
                          response_json: newJson,
                        })
                      } catch (error) {
                        console.error('Error saving date:', error)
                        loadResponses()
                      } finally {
                        setSaving(false)
                      }
                    }}
                    className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            )}
            
            {/* Comments for questions 1 and 3 of H&S Policy, all Risk Assessment questions, Training questions, Statutory Testing questions, Manual Handling questions, COSHH questions, Premises and Equipment questions, questions 1 & 3 of Working at Height, all First Aid questions, all Fire Safety questions, and all Store Compliance questions */}
            {(needsMediaAndComments || isRiskAssessmentsQuestion || isTrainingQuestion || isStatutoryTestingQuestion || isManualHandlingQuestion || isCoshhQuestion || isPremisesEquipmentQuestion || isWorkingAtHeightQuestion1 || isWorkingAtHeightQuestion3 || isFirstAidQuestion || isFireSafetyQuestion || isStoreComplianceQuestion) && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Comments
                </label>
                <textarea
                  value={currentComment}
                  onChange={(e) => handleCommentChange(question.id, e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  rows={3}
                  placeholder="Add any comments or notes..."
                />
              </div>
            )}
          </div>
        )
      case 'multiple':
        const options = question.options || []
        // Check if this multiple choice question needs media upload (e.g., in Risk Assessments)
        const needsMultipleChoiceMedia = isRiskAssessmentsSection
        
        return (
          <div className="mt-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              {/* Multiple choice buttons on the left */}
              <div className="flex flex-wrap gap-3">
                {options.map((opt: string) => (
                  <Button
                    key={opt}
                    type="button"
                    variant={responseValue === opt ? 'default' : 'outline'}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleAnswerChange(question.id, opt)
                    }}
                    className={
                      responseValue === opt
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white min-w-[80px] cursor-pointer'
                        : 'min-w-[80px] cursor-pointer'
                    }
                  >
                    {opt}
                  </Button>
                ))}
              </div>
              
              {/* Media Upload on the right */}
              {needsMultipleChoiceMedia && (
                <div className="flex items-center gap-3 shrink-0">
                  {/* Camera button - opens device camera */}
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          handleFileUpload(question.id, file)
                        }
                        e.target.value = ''
                      }}
                      disabled={uploadingFiles[question.id]}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      id={`camera-multiple-${question.id}`}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={uploadingFiles[question.id]}
                      className="h-10 w-10 p-0 border-slate-300 hover:bg-indigo-50 hover:border-indigo-300"
                      title="Take Photo"
                      onClick={() => document.getElementById(`camera-multiple-${question.id}`)?.click()}
                    >
                      <Camera className="h-5 w-5 text-slate-700" />
                    </Button>
                  </div>
                  
                  {/* File/Gallery button - opens file picker */}
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          handleFileUpload(question.id, file)
                        }
                        e.target.value = ''
                      }}
                      disabled={uploadingFiles[question.id]}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      id={`file-multiple-${question.id}`}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={uploadingFiles[question.id]}
                      className="h-10 w-10 p-0 border-slate-300 hover:bg-indigo-50 hover:border-indigo-300"
                      title="Upload from Gallery"
                      onClick={() => document.getElementById(`file-multiple-${question.id}`)?.click()}
                    >
                      <ImageIcon className="h-5 w-5 text-slate-700" />
                    </Button>
                  </div>
                  
                  {uploadingFiles[question.id] && (
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                  )}
                </div>
              )}
            </div>
          </div>
        )
      case 'text':
        // Special handling for name fields - use single-line input instead of textarea
        const isNameField = questionText.includes('store manager name') || 
                           questionText.includes('auditor name')
        
        if (isNameField) {
          return (
            <input
              type="text"
              value={responseValue || ''}
              onChange={(e) => handleAnswerChange(question.id, e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 mt-4"
              placeholder="Enter name..."
            />
          )
        }
        
        // Special handling for Emergency Lighting location question - add media upload
        if (isEmergencyLightingLocationQuestion) {
          return (
            <div className="mt-4 space-y-4">
              <textarea
                value={responseValue || ''}
                onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                rows={3}
                placeholder="Enter your answer..."
              />
              {/* Media Upload for Emergency Lighting location */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Add Photo
                </label>
                <div className="flex items-center gap-3">
                  {/* Camera button - opens device camera */}
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          handleFileUpload(question.id, file)
                        }
                        e.target.value = ''
                      }}
                      disabled={uploadingFiles[question.id]}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      id={`camera-text-${question.id}`}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={uploadingFiles[question.id]}
                      className="h-10 w-10 p-0 border-slate-300 hover:bg-indigo-50 hover:border-indigo-300"
                      title="Take Photo"
                      onClick={() => document.getElementById(`camera-text-${question.id}`)?.click()}
                    >
                      <Camera className="h-5 w-5 text-slate-700" />
                    </Button>
                  </div>
                  
                  {/* File/Gallery button - opens file picker */}
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          handleFileUpload(question.id, file)
                        }
                        e.target.value = ''
                      }}
                      disabled={uploadingFiles[question.id]}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      id={`file-text-${question.id}`}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={uploadingFiles[question.id]}
                      className="h-10 w-10 p-0 border-slate-300 hover:bg-indigo-50 hover:border-indigo-300"
                      title="Upload from Gallery"
                      onClick={() => document.getElementById(`file-text-${question.id}`)?.click()}
                    >
                      <ImageIcon className="h-5 w-5 text-slate-700" />
                    </Button>
                  </div>
                  
                  {uploadingFiles[question.id] && (
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                  )}
                </div>
              </div>
            </div>
          )
        }
        
        // Regular text input for other text questions
        return (
          <textarea
            value={responseValue || ''}
            onChange={(e) => handleAnswerChange(question.id, e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 mt-4"
            rows={3}
            placeholder="Enter your answer..."
          />
        )
      case 'number':
        return (
          <input
            type="number"
            value={responseValue || ''}
            onChange={(e) => handleAnswerChange(question.id, e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 mt-4"
            placeholder="Enter a number..."
          />
        )
      case 'date':
        // Special handling for "Date of last in store accident" - add "No accident reported" option
        if (isAccidentDateQuestion) {
          const hasNoAccident = responseValue === 'na' || responseValue === 'N/A' || responseValue === 'no_accident'
          return (
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-4">
                <input
                  type="date"
                  value={hasNoAccident ? '' : (responseValue || '')}
                  onChange={(e) => {
                    // If date is selected, clear the "no accident" flag
                    handleAnswerChange(question.id, e.target.value)
                  }}
                  disabled={hasNoAccident}
                  className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-500"
                />
                <Button
                  type="button"
                  variant={hasNoAccident ? 'default' : 'outline'}
                  onClick={() => handleAnswerChange(question.id, 'na')}
                  className={
                    hasNoAccident
                      ? 'bg-slate-600 hover:bg-slate-700 text-white'
                      : ''
                  }
                >
                  No accident reported
                </Button>
              </div>
            </div>
          )
        }
        
        // Regular date input for other date questions
        return (
          <input
            type="date"
            value={responseValue || ''}
            onChange={(e) => handleAnswerChange(question.id, e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 mt-4"
          />
        )
      case 'signature':
        return (
          <div className="mt-4">
            <div className="border-2 border-slate-300 rounded-lg bg-white">
              <SignatureCanvasComponent
                questionId={question.id}
                responseValue={responseValue}
                onSignatureChange={(dataURL) => handleAnswerChange(question.id, dataURL)}
              />
            </div>
          </div>
        )
      default:
        return (
          <input
            type="text"
            value={responseValue || ''}
            onChange={(e) => handleAnswerChange(question.id, e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 mt-4"
            placeholder="Enter your answer..."
          />
        )
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto" />
        </CardContent>
      </Card>
    )
  }

  if (!template || !currentSection) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-slate-500">Template or section not found</p>
          <Button onClick={onBack} variant="outline" className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <CardTitle>{template.title}</CardTitle>
              <p className="text-sm text-slate-500 mt-1">
                Section {currentSectionIndex + 1} of {sections.length}: {currentSection.title}
              </p>
            </div>
          </div>
          {saving && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Section Score */}
          {currentSectionScore.questions > 0 && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-indigo-900">Section Score</p>
                  <p className="text-2xl font-bold text-indigo-700 mt-1">
                    {currentSectionScore.passes} / {currentSectionScore.questions} ({currentSectionScore.percentage}%)
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-indigo-600">Overall Score</p>
                  <p className="text-2xl font-bold text-indigo-900 mt-1">
                    {overallScore.passes} / {overallScore.questions} ({overallScore.percentage}%)
                  </p>
                </div>
              </div>
            </div>
          )}

          <h2 className="text-2xl font-semibold border-b pb-3">{currentSection.title}</h2>
          
          {/* Date field for Risk Assessments section - before first question */}
          {isRiskAssessmentsSection && currentSection.questions && currentSection.questions.length > 0 && (() => {
            const firstQuestion = currentSection.questions[0]
            const firstQuestionResponse = responses[firstQuestion.id]
            const sectionDate = firstQuestionResponse?.response_json?.sectionDate || ''
            const firstQuestionText = firstQuestion.question_text?.toLowerCase() || ''
            const isFirstQuestion = firstQuestionText.includes('slips, trips and falls')
            
            if (!isFirstQuestion) return null
            
            return (
              <div className="mb-8 pb-6 border-b">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Risk Assessment Date
                    </label>
                    <input
                      type="date"
                      value={sectionDate}
                      onChange={async (e) => {
                        const newDate = e.target.value
                        const currentJson = firstQuestionResponse?.response_json || {}
                        const newJson = { ...currentJson, sectionDate: newDate }
                        
                        // Format date for comment text
                        const formattedDate = newDate 
                          ? new Date(newDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                          : ''
                        const autoCommentText = formattedDate 
                          ? `The Risk Assessment is present and dated ${formattedDate}`
                          : ''
                        
                        // Update local state
                        setResponses(prev => ({
                          ...prev,
                          [firstQuestion.id]: {
                            ...firstQuestionResponse,
                            response_json: newJson
                          }
                        }))
                        
                        // Auto-fill comments for all questions in this section with the date text
                        if (autoCommentText && currentSection?.questions) {
                          const updatedComments: Record<string, string> = {}
                          currentSection.questions.forEach((q: any) => {
                            updatedComments[q.id] = autoCommentText
                          })
                          setComments(prev => ({ ...prev, ...updatedComments }))
                          
                          // Save comments for all questions
                          try {
                            for (const question of currentSection.questions) {
                              const questionResponse = responses[question.id] || {}
                              const questionJson = questionResponse?.response_json || {}
                              await saveAuditResponse(instanceId, question.id, {
                                response_value: questionResponse?.response_value || null,
                                response_json: {
                                  ...questionJson,
                                  comment: autoCommentText,
                                },
                              })
                            }
                          } catch (error) {
                            console.error('Error auto-filling comments:', error)
                          }
                        }
                        
                        // Save to database
                        try {
                          setSaving(true)
                          await saveAuditResponse(instanceId, firstQuestion.id, {
                            response_value: firstQuestionResponse?.response_value || null,
                            response_json: newJson,
                          })
                        } catch (error) {
                          console.error('Error saving section date:', error)
                          loadResponses()
                        } finally {
                          setSaving(false)
                        }
                      }}
                      className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  {sectionDate && (
                    <p className="text-slate-700 font-medium">
                      The Risk Assessment is present and dated {new Date(sectionDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
            )
          })()}
          
          {currentSection.questions && currentSection.questions.length > 0 ? (
            <div className="space-y-8">
              {currentSection.questions.map((question: any) => {
                // For disclaimer section, just display text without input
                if (isDisclaimerSection) {
                  return (
                    <div key={question.id} className="prose max-w-none">
                      <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                        {question.question_text}
                      </p>
                    </div>
                  )
                }

                // Check if this question contributes to scoring
                const isScoredQuestion = question.question_type === 'yesno'
                const isInformationalQuestion = !isScoredQuestion

                const previousFailure = previousFailures?.[question.id]
                const previousFailureDate = previousFailure?.failedAt
                  ? new Date(previousFailure.failedAt).toLocaleDateString('en-GB')
                  : null

                return (
                  <div key={question.id} className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-lg">{question.question_text}</p>
                      <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                        {previousFailure && (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                            Failed previously{previousFailureDate ? ` (${previousFailureDate})` : ''}
                          </Badge>
                        )}
                        {isScoredQuestion && (
                          <Badge className="bg-green-100 text-green-800 border-green-300">Scored</Badge>
                        )}
                        {isInformationalQuestion && (
                          <Badge className="bg-slate-100 text-slate-600 border-slate-300">Information</Badge>
                        )}
                        {question.is_required && (
                          <Badge variant="destructive">Required</Badge>
                        )}
                      </div>
                    </div>
                    {renderQuestion(question)}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-slate-500">No questions in this section</p>
          )}

          <div className="flex items-center justify-between pt-6 border-t gap-4">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentSectionIndex === 0}
              className="max-w-[200px] truncate"
            >
              <ArrowLeft className="h-4 w-4 mr-2 shrink-0" />
              <span className="truncate">
                Previous {currentSectionIndex > 0 ? `(${getShortSectionName(sections[currentSectionIndex - 1]?.title || '')})` : ''}
              </span>
            </Button>
            <div className="text-sm text-slate-500 shrink-0">
              Section {currentSectionIndex + 1} of {sections.length}
            </div>
            {isLastSection ? (
              <Button
                onClick={handleCompleteAudit}
                disabled={completing || completed}
                className="bg-green-600 hover:bg-green-700 max-w-[200px] truncate"
              >
                {completing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin shrink-0" />
                    <span>Completing...</span>
                  </>
                ) : completed ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2 shrink-0" />
                    <span>Completed</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2 shrink-0" />
                    <span>Complete Audit</span>
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                className="bg-indigo-600 hover:bg-indigo-700 max-w-[200px] truncate"
              >
                <span className="truncate">
                  Next ({getShortSectionName(sections[currentSectionIndex + 1]?.title || '')})
                </span>
                <ChevronRight className="h-4 w-4 ml-2 shrink-0" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>

      {/* Completion Dialog */}
      <Dialog open={completed} onOpenChange={setCompleted}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
              Audit Completed Successfully!
            </DialogTitle>
            <DialogDescription>
              Your audit has been saved and is now complete.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 mt-4">
            {/* Final Score Display */}
            <div className="bg-indigo-50 rounded-lg p-6 border-2 border-indigo-200">
              <h3 className="text-lg font-semibold text-indigo-900 mb-4">Final Audit Score</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-indigo-600">Score</p>
                  <p className="text-4xl font-bold text-indigo-900 mt-1">
                    {overallScore.passes} / {overallScore.questions}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-indigo-600">Percentage</p>
                  <p className="text-4xl font-bold text-indigo-900 mt-1">
                    {overallScore.percentage}%
                  </p>
                </div>
              </div>
            </div>

            {/* PDF Options */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-slate-900">Report Options</h3>
              <div className="flex gap-3">
                {template?.category === 'fire_risk_assessment' ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const url = `/audit-lab/view-fra-report?instanceId=${instanceId}`
                      window.open(url, '_blank')
                    }}
                    className="flex-1"
                  >
                    <Flame className="h-4 w-4 mr-2" />
                    View FRA Report
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const url = `/audit-lab/view-report?instanceId=${instanceId}`
                        window.open(url, '_blank')
                      }}
                      className="flex-1"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      View Report
                    </Button>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          const response = await fetch(`/api/audit-pdfs/generate?instanceId=${instanceId}`)
                          if (!response.ok) throw new Error('Failed to generate PDF')
                          const blob = await response.blob()
                          const url = window.URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `inspection-report-${instanceId.slice(-8)}.pdf`
                          document.body.appendChild(a)
                          a.click()
                          window.URL.revokeObjectURL(url)
                          document.body.removeChild(a)
                        } catch (error) {
                          console.error('Error downloading PDF:', error)
                          alert('Failed to download PDF. Please try again.')
                        }
                      }}
                      className="flex-1"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download PDF
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setCompleted(false)
                  onBack()
                }}
              >
                Back to Audits
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// Active Audits View
function ActiveAuditsView({
  audits,
  loading,
  onReload,
  onEdit,
}: {
  audits: any[]
  loading: boolean
  onReload?: () => void
  onEdit?: (auditId: string) => void
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (auditId: string) => {
    const audit = audits.find(a => a.id === auditId)
    const templateName = (audit?.fa_audit_templates as any)?.title || 'this audit'
    const storeName = (audit?.fa_stores as any)?.store_name || 'Unknown Store'
    
    if (!confirm(`Are you sure you want to delete "${templateName}" for ${storeName}? This action cannot be undone.`)) {
      return
    }

    try {
      setDeletingId(auditId)
      await deleteAuditInstance(auditId)
      if (onReload) {
        onReload()
      } else {
        window.location.reload()
      }
    } catch (error: any) {
      console.error('Error deleting audit:', error)
      alert(`Failed to delete audit: ${error.message}`)
    } finally {
      setDeletingId(null)
    }
  }

  const handleEdit = (auditId: string) => {
    if (onEdit) {
      onEdit(auditId)
    } else {
      // TODO: Implement edit navigation
      alert('Edit functionality coming soon')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Audits</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto" />
          </div>
        ) : audits.length === 0 ? (
          <div className="py-12 text-center">
            <ClipboardCheck className="h-12 w-12 mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500">No active audits</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audits.map((audit) => (
                  <TableRow key={audit.id}>
                    <TableCell className="font-medium">
                      {getTemplateDisplayTitle({
                        title: (audit.fa_audit_templates as any)?.title,
                        category: (audit.fa_audit_templates as any)?.category,
                      })}
                    </TableCell>
                    <TableCell>
                      {(audit.fa_stores as any)?.store_name || 'Unknown Store'}
                      {(audit.fa_stores as any)?.store_code && (
                        <span className="text-xs text-slate-500 ml-2">
                          ({(audit.fa_stores as any).store_code})
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge>{audit.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {formatAppDate(audit.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(audit.id)}
                          className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                        >
                          <Edit2 className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(audit.id)}
                          disabled={deletingId === audit.id}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          {deletingId === audit.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Trash2 className="h-4 w-4 mr-1" />
                              Delete
                            </>
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Audit History View
function AuditHistoryView({
  audits,
  loading,
  onEdit,
}: {
  audits: any[]
  loading: boolean
  onEdit?: (auditId: string, templateId: string) => void
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const handleDelete = async (auditId: string) => {
    const audit = audits.find(a => a.id === auditId)
    const templateName = (audit?.fa_audit_templates as any)?.title || 'this audit'
    const storeName = (audit?.fa_stores as any)?.store_name || 'Unknown Store'

    if (!confirm(`Are you sure you want to delete "${templateName}" for ${storeName}? This action cannot be undone.`)) {
      return
    }

    try {
      setDeletingId(auditId)
      await deleteAuditInstance(auditId)
      window.location.reload()
    } catch (error: any) {
      console.error('Error deleting audit:', error)
      alert(`Failed to delete audit: ${error.message}`)
    } finally {
      setDeletingId(null)
    }
  }

  const toggleSelect = (auditId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(auditId)) {
        next.delete(auditId)
      } else {
        next.add(auditId)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === audits.length) {
      setSelectedIds(new Set())
      return
    }
    setSelectedIds(new Set(audits.map((audit) => audit.id)))
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Delete ${selectedIds.size} selected audit(s)? This action cannot be undone.`)) {
      return
    }
    try {
      setDeletingId('bulk')
      await bulkDeleteAuditInstances(Array.from(selectedIds))
      window.location.reload()
    } catch (error: any) {
      console.error('Error deleting audits:', error)
      alert(`Failed to delete audits: ${error.message}`)
      setDeletingId(null)
    }
  }
  const handleDownloadPDF = async (instanceId: string) => {
    try {
      const response = await fetch(`/api/audit-pdfs/generate?instanceId=${instanceId}`)
      if (!response.ok) throw new Error('Failed to generate PDF')
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `inspection-report-${instanceId.slice(-8)}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error downloading PDF:', error)
      alert('Failed to download PDF. Please try again.')
    }
  }

  const handleViewPDF = (instanceId: string, category?: string) => {
    const url = category === 'fire_risk_assessment' 
      ? `/audit-lab/view-fra-report?instanceId=${instanceId}`
      : `/audit-lab/view-report?instanceId=${instanceId}`
    window.open(url, '_blank')
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Audit History</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkDelete}
            disabled={selectedIds.size === 0 || deletingId === 'bulk'}
            className="h-8 px-3 text-red-600 border-red-200 hover:bg-red-50"
          >
            {deletingId === 'bulk' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <Trash2 className="h-3 w-3 mr-1" />
                Delete Selected
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto" />
          </div>
        ) : audits.length === 0 ? (
          <div className="py-12 text-center">
            <ClipboardCheck className="h-12 w-12 mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500">No audit history yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all audits"
                      checked={audits.length > 0 && selectedIds.size === audits.length}
                      onChange={toggleSelectAll}
                      className="h-4 w-4"
                    />
                  </TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Score / Risk Rating</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audits.map((audit) => (
                  <TableRow key={audit.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Select audit ${audit.id}`}
                        checked={selectedIds.has(audit.id)}
                        onChange={() => toggleSelect(audit.id)}
                        className="h-4 w-4"
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {(audit.fa_audit_templates as any)?.title || 'Unknown Template'}
                    </TableCell>
                    <TableCell>
                      {(audit.fa_stores as any)?.store_name || 'Unknown Store'}
                      {(audit.fa_stores as any)?.store_code && (
                        <span className="text-xs text-slate-500 ml-2">
                          ({(audit.fa_stores as any).store_code})
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {(audit.fa_audit_templates as any)?.category === 'fire_risk_assessment' ? (
                        (() => {
                          const riskRating = extractFraRiskRating(audit)
                          if (!riskRating) {
                            return <span className="text-xs text-slate-400">— (edit to add)</span>
                          }

                          return (
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${getFraRiskBadgeClass(riskRating)}`}>
                              {toTitleCase(riskRating)}
                            </span>
                          )
                        })()
                      ) : audit.overall_score !== null && audit.overall_score !== undefined ? (
                        <span className="font-semibold text-indigo-600">
                          {Math.round(audit.overall_score)}%
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {formatAppDate(audit.conducted_at || audit.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {audit.status === 'completed' ? (
                          <>
                            {(audit.fa_audit_templates as any)?.category === 'fire_risk_assessment' ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleViewPDF(audit.id, 'fire_risk_assessment')}
                                className="h-8 px-3"
                              >
                                <Flame className="h-3 w-3 mr-1" />
                                View FRA
                              </Button>
                            ) : (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleViewPDF(audit.id)}
                                  className="h-8 px-3"
                                >
                                  <FileText className="h-3 w-3 mr-1" />
                                  View
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDownloadPDF(audit.id)}
                                  className="h-8 px-3"
                                >
                                  <Download className="h-3 w-3 mr-1" />
                                  PDF
                                </Button>
                              </>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (onEdit) {
                                  onEdit(audit.id, audit.template_id)
                                }
                              }}
                              className="h-8 px-3"
                            >
                              <Edit2 className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(audit.id)}
                              disabled={deletingId === audit.id}
                              className="h-8 px-3 text-red-600 border-red-200 hover:bg-red-50"
                            >
                              {deletingId === audit.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <Trash2 className="h-3 w-3 mr-1" />
                                  Delete
                                </>
                              )}
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (onEdit) {
                                  onEdit(audit.id, audit.template_id)
                                }
                              }}
                              className="h-8 px-3"
                            >
                              <Edit2 className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(audit.id)}
                              disabled={deletingId === audit.id}
                              className="h-8 px-3 text-red-600 border-red-200 hover:bg-red-50"
                            >
                              {deletingId === audit.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <Trash2 className="h-3 w-3 mr-1" />
                                  Delete
                                </>
                              )}
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
