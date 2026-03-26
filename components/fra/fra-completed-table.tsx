'use client'

import { useMemo, useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { getFRAPDFDownloadUrl, deleteFRAPDF } from '@/app/actions/fra-pdfs'
import { uploadFraPdfFromClient } from '@/lib/fra/upload-pdf-client'
import { File, Search, Upload } from 'lucide-react'
import { PDFViewerModal } from '@/components/shared/pdf-viewer-modal'
import { getInternalAreaDisplayName } from '@/lib/areas'
import { getDisplayStoreCode } from '@/lib/utils'
import { 
  FRARow, 
  formatDate,
  calculateNextDueDate,
  getFRAStatus,
  getDaysUntilDue,
  fraRiskRatingBadge,
  statusBadge,
  storeNeedsFRA
} from './fra-table-helpers'

export function FRACompletedTable({ 
  rows, 
  areaFilter: externalAreaFilter, 
  onAreaFilterChange 
}: { 
  rows: FRARow[]
  areaFilter?: string
  onAreaFilterChange?: (area: string) => void
}) {
  const [search, setSearch] = useState('')
  const [internalArea, setInternalArea] = useState<string>('all')
  const area = externalAreaFilter !== undefined ? externalAreaFilter : internalArea
  const setArea = onAreaFilterChange || setInternalArea
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false)
  const [selectedPdfRow, setSelectedPdfRow] = useState<FRARow | null>(null)
  const [deletingPdf, setDeletingPdf] = useState<string | null>(null)
  const [uploadingPdf, setUploadingPdf] = useState<string | null>(null)
  const [tableMessage, setTableMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const hasActiveFilters = search.trim().length > 0 || area !== 'all'

  const resetFilters = () => {
    setSearch('')
    setArea('all')
  }

  const areaOptions = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((r) => r.region && set.add(r.region))
    return Array.from(set).sort()
  }, [rows])

  // Filter stores that have an in-date FRA only.
  // Due/overdue/required stores stay in the Required tab.
  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const needsFRA = storeNeedsFRA(row)
      const status = getFRAStatus(row.fire_risk_assessment_date, needsFRA)
      if (!needsFRA || status !== 'up_to_date') return false

      const matchesArea = area === 'all' || row.region === area
      const term = search.trim().toLowerCase()
      const matchesSearch =
        term.length === 0 ||
        row.store_name.toLowerCase().includes(term) ||
        (row.store_code || '').toLowerCase().includes(term)
      
      return matchesArea && matchesSearch
    })
  }, [rows, area, search])

  const grouped = useMemo(() => {
    const map = new Map<string, FRARow[]>()
    
    // 1. Group by Region
    filtered.forEach((row) => {
      const key = row.region || 'Unassigned'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(row)
    })

    // 2. Sort STORES within each area by next due date (earliest first)
    map.forEach((storeRows) => {
      storeRows.sort((a, b) => {
        const nextDueA = calculateNextDueDate(a.fire_risk_assessment_date)
        const nextDueB = calculateNextDueDate(b.fire_risk_assessment_date)
        
        if (!nextDueA && !nextDueB) return a.store_name.localeCompare(b.store_name)
        if (!nextDueA) return 1
        if (!nextDueB) return -1
        
        return nextDueA.getTime() - nextDueB.getTime()
      })
    })

    // 3. Sort AREAS alphabetically
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const handleViewPDF = (row: FRARow) => {
    if (!row.fire_risk_assessment_pdf_path) return
    setSelectedPdfRow(row)
    setPdfViewerOpen(true)
  }

  const handleGetPDFUrl = async () => {
    if (!selectedPdfRow?.fire_risk_assessment_pdf_path) return null
    try {
      return await getFRAPDFDownloadUrl(selectedPdfRow.fire_risk_assessment_pdf_path)
    } catch (error) {
      console.error('Error fetching PDF URL:', error)
      return null
    }
  }

  const handleDeletePDF = async (row: FRARow) => {
    if (!confirm('Are you sure you want to delete the Fire Risk Assessment PDF? This will also clear the FRA date and all related data.')) {
      return
    }

    setDeletingPdf(row.id)
    try {
      await deleteFRAPDF(row.id)
      
      // Close PDF viewer if it's open for this row
      if (selectedPdfRow?.id === row.id) {
        setPdfViewerOpen(false)
        setSelectedPdfRow(null)
      }
      
      // Refresh page to show updated data from server
      window.location.reload()
    } catch (error) {
      console.error('Error deleting PDF:', error)
      alert(`Failed to delete PDF: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setDeletingPdf(null)
    }
  }

  const handleUploadPDFStandalone = async (row: FRARow, file: File) => {
    setUploadingPdf(row.id)
    setTableMessage(null)

    try {
      await uploadFraPdfFromClient(row.id, file)

      setTableMessage({
        type: 'success',
        text: `FRA PDF uploaded for ${row.store_name}.`,
      })

      // Refresh to load latest server-side table data.
      window.location.reload()
    } catch (error) {
      console.error('Error uploading PDF:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setTableMessage({ type: 'error', text: `Failed to upload PDF: ${errorMessage}` })
    } finally {
      setUploadingPdf(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search store name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-[44px] bg-white pl-12 sm:pl-12"
            />
          </div>
          <Select value={area} onValueChange={setArea}>
            <SelectTrigger className="w-full sm:w-44 bg-white min-h-[44px]">
              <SelectValue placeholder="Area" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All areas</SelectItem>
              {areaOptions.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {getInternalAreaDisplayName(opt, { fallback: opt })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            onClick={resetFilters}
            disabled={!hasActiveFilters}
            className="min-h-[44px] text-slate-500 hover:text-slate-700"
          >
            Reset
          </Button>
        </div>
        <div className="text-sm text-slate-500">
          Showing {filtered.length} of {rows.length} stores
        </div>
      </div>

      {/* Table Container */}
      <div className="rounded-2xl border desktop-table-shell shadow-sm overflow-hidden flex flex-col">
        {tableMessage ? (
          <div
            className={`mx-4 mt-4 rounded-lg border px-3 py-2 text-sm ${
              tableMessage.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            {tableMessage.text}
          </div>
        ) : null}

        {/* Fixed Header */}
        <div className="hidden md:block border-b desktop-table-head overflow-x-auto">
          <Table className="w-full border-separate border-spacing-0" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '40px' }} />
              <col style={{ width: '60px' }} />
              <col style={{ width: '80px' }} />
              <col style={{ width: '180px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '150px' }} />
              <col style={{ width: '150px' }} />
            </colgroup>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-center bg-white">#</TableHead>
                <TableHead className="bg-white">Area</TableHead>
                <TableHead className="bg-white">Store Code</TableHead>
                <TableHead className="bg-white">Store Name</TableHead>
                <TableHead className="bg-white">FRA Date</TableHead>
                <TableHead className="bg-white">Next Due Date</TableHead>
                <TableHead className="bg-white">Status</TableHead>
                <TableHead className="bg-white">Risk Rating</TableHead>
                <TableHead className="bg-white">PDF</TableHead>
              </TableRow>
            </TableHeader>
          </Table>
        </div>

        {/* Scrollable Body */}
        <div className="h-[70vh] overflow-y-auto relative">
          {/* Mobile (fit-to-screen columns only) */}
          <div className="md:hidden">
            <div className="sticky top-0 z-10 bg-white border-b">
              <Table className="w-full border-separate border-spacing-0">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="bg-white">Area</TableHead>
                    <TableHead className="bg-white">Store Name</TableHead>
                    <TableHead className="bg-white">FRA Date</TableHead>
                    <TableHead className="bg-white">Risk</TableHead>
                    <TableHead className="bg-white">Status</TableHead>
                  </TableRow>
                </TableHeader>
              </Table>
            </div>
            <Table className="w-full border-separate border-spacing-0">
              <TableBody>
                {grouped.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                      No completed FRA data found matching your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  grouped.map(([groupKey, areaRows]) => {
                    return (
                      <>
                        <TableRow key={`mob-hdr-${groupKey}`} className="bg-slate-100/80 hover:bg-slate-100/80">
                          <TableCell colSpan={5} className="py-2 px-4 bg-slate-50 border-b border-t">
                            <span className="font-bold text-slate-700">
                              {getInternalAreaDisplayName(groupKey, { fallback: groupKey })}
                            </span>
                          </TableCell>
                        </TableRow>

                        {areaRows.map((row) => {
                          const days = getDaysUntilDue(row.fire_risk_assessment_date)
                          const status = getFRAStatus(row.fire_risk_assessment_date, true)

                          return (
                            <TableRow
                              key={`mob-${row.id}`}
                              className="group hover:bg-slate-50 transition-colors"
                            >
                              <TableCell className="text-xs text-muted-foreground border-b bg-white group-hover:bg-slate-50">
                                {getInternalAreaDisplayName(row.region, { fallback: '—' })}
                              </TableCell>
                              <TableCell className="font-semibold text-sm border-b bg-white group-hover:bg-slate-50">
                                {row.store_name}
                              </TableCell>
                              <TableCell className="border-b bg-white group-hover:bg-slate-50">
                                <span className="text-sm text-muted-foreground">
                                  {formatDate(row.fire_risk_assessment_date)}
                                </span>
                              </TableCell>
                              <TableCell className="border-b bg-white group-hover:bg-slate-50">
                                {fraRiskRatingBadge(row.fire_risk_assessment_rating)}
                              </TableCell>
                              <TableCell className="border-b bg-white group-hover:bg-slate-50">
                                {statusBadge(status, days)}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            <Table className="w-full border-separate border-spacing-0 min-w-[820px]" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '40px' }} />
                <col style={{ width: '60px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '180px' }} />
                <col style={{ width: '120px' }} />
                <col style={{ width: '120px' }} />
                <col style={{ width: '130px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '150px' }} />
              </colgroup>
              <TableBody>
                {grouped.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                      No completed FRA data found matching your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  grouped.map(([groupKey, areaRows]) => {
                    return (
                      <>
                        {/* Area Divider Row */}
                        <TableRow key={`hdr-${groupKey}`} className="desktop-group-bar hover:bg-transparent">
                          <TableCell 
                            colSpan={9} 
                            className="py-2 px-4 border-b border-t"
                          >
                            <span className="font-bold text-slate-700">
                              {getInternalAreaDisplayName(groupKey, { fallback: groupKey })}
                            </span>
                          </TableCell>
                        </TableRow>

                        {/* Store Rows */}
                        {areaRows.map((row, idx) => {
                          const nextDue = calculateNextDueDate(row.fire_risk_assessment_date)
                          const days = getDaysUntilDue(row.fire_risk_assessment_date)
                          const status = getFRAStatus(row.fire_risk_assessment_date, true)
                          
                          return (
                            <TableRow
                              key={row.id}
                              className="group hover:bg-slate-50 transition-colors"
                            >
                              <TableCell className="font-mono text-xs text-center text-muted-foreground border-b bg-white group-hover:bg-slate-50">
                                {idx + 1}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground border-b bg-white group-hover:bg-slate-50">
                                {getInternalAreaDisplayName(row.region, { fallback: '—' })}
                              </TableCell>
                              <TableCell className="font-mono text-xs font-medium border-b bg-white group-hover:bg-slate-50">
                                {getDisplayStoreCode(row.store_code) || '—'}
                              </TableCell>
                              <TableCell className="font-semibold text-sm border-b bg-white group-hover:bg-slate-50">
                                {row.store_name}
                              </TableCell>
                              
                              <TableCell className="border-b bg-white group-hover:bg-slate-50">
                                <span className="text-sm text-muted-foreground">
                                  {formatDate(row.fire_risk_assessment_date)}
                                </span>
                              </TableCell>
                              
                              <TableCell className="border-b bg-white group-hover:bg-slate-50">
                                <span className="text-sm text-muted-foreground">
                                  {nextDue ? formatDate(nextDue.toISOString().split('T')[0]) : '—'}
                                </span>
                              </TableCell>
                              
                              <TableCell className="border-b bg-white group-hover:bg-slate-50">
                                {statusBadge(status, days)}
                              </TableCell>

                              <TableCell className="border-b bg-white group-hover:bg-slate-50">
                                {fraRiskRatingBadge(row.fire_risk_assessment_rating)}
                              </TableCell>
                              
                              <TableCell className="border-b bg-white group-hover:bg-slate-50">
                                {row.fire_risk_assessment_pdf_path ? (
                                  <div className="flex items-center gap-1">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleViewPDF(row)}
                                      className="h-7 px-2 text-xs"
                                      title="View PDF"
                                    >
                                      <File className="h-4 w-4 text-blue-600" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="relative">
                                    <input
                                      type="file"
                                      id={`pdf-upload-completed-fra-${row.id}`}
                                      accept=".pdf,application/pdf"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0] || null
                                        if (file) {
                                          handleUploadPDFStandalone(row, file)
                                        }
                                      }}
                                      className="hidden"
                                      disabled={uploadingPdf === row.id}
                                    />
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => document.getElementById(`pdf-upload-completed-fra-${row.id}`)?.click()}
                                      disabled={uploadingPdf === row.id}
                                      className="h-7 border border-slate-300 bg-white px-2 text-xs hover:bg-slate-50"
                                      title="Upload PDF"
                                    >
                                      {uploadingPdf === row.id ? (
                                        <span className="text-xs">Uploading...</span>
                                      ) : (
                                        <Upload className="h-3 w-3 text-slate-500" />
                                      )}
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* PDF Viewer Modal */}
      <PDFViewerModal
        open={pdfViewerOpen}
        onOpenChange={(open) => {
          setPdfViewerOpen(open)
          if (!open) {
            setSelectedPdfRow(null)
          }
        }}
        pdfUrl={null}
        title={selectedPdfRow ? `Fire Risk Assessment - ${selectedPdfRow.store_name}` : 'Fire Risk Assessment PDF'}
        getDownloadUrl={handleGetPDFUrl}
        headerActions={selectedPdfRow ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => handleDeletePDF(selectedPdfRow)}
            disabled={deletingPdf === selectedPdfRow.id}
          >
            {deletingPdf === selectedPdfRow.id ? 'Deleting...' : 'Delete PDF'}
          </Button>
        ) : undefined}
      />
    </div>
  )
}
