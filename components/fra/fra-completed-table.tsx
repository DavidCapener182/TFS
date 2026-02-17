'use client'

import { useMemo, useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { getFRAPDFDownloadUrl, deleteFRAPDF } from '@/app/actions/fra-pdfs'
import { File, Trash2 } from 'lucide-react'
import { PDFViewerModal } from '@/components/shared/pdf-viewer-modal'
import { getDisplayStoreCode } from '@/lib/utils'
import { 
  FRARow, 
  formatDate,
  calculateNextDueDate,
  getFRAStatus,
  getDaysUntilDue,
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

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <Input
            placeholder="Search store name or code"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 md:w-64 bg-white min-h-[44px]"
          />
          <Select value={area} onValueChange={setArea}>
            <SelectTrigger className="w-full sm:w-40 bg-white min-h-[44px]">
              <SelectValue placeholder="Area" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All areas</SelectItem>
              {areaOptions.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-sm text-muted-foreground">
          Showing {filtered.length} of {rows.length} stores
        </div>
      </div>

      {/* Table Container */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden flex flex-col">
        {/* Fixed Header */}
        <div className="hidden md:block border-b bg-white overflow-x-auto">
          <Table className="w-full border-separate border-spacing-0" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '40px' }} />
              <col style={{ width: '60px' }} />
              <col style={{ width: '80px' }} />
              <col style={{ width: '180px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '120px' }} />
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
                    <TableHead className="bg-white">Status</TableHead>
                  </TableRow>
                </TableHeader>
              </Table>
            </div>
            <Table className="w-full border-separate border-spacing-0">
              <TableBody>
                {grouped.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                      No completed FRA data found matching your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  grouped.map(([groupKey, areaRows]) => {
                    return (
                      <>
                        <TableRow key={`mob-hdr-${groupKey}`} className="bg-slate-100/80 hover:bg-slate-100/80">
                          <TableCell colSpan={4} className="py-2 px-4 bg-slate-50 border-b border-t">
                            <span className="font-bold text-slate-700">{groupKey}</span>
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
                                {row.region || '—'}
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
                <col style={{ width: '150px' }} />
                <col style={{ width: '150px' }} />
              </colgroup>
              <TableBody>
                {grouped.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                      No completed FRA data found matching your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  grouped.map(([groupKey, areaRows]) => {
                    return (
                      <>
                        {/* Area Divider Row */}
                        <TableRow key={`hdr-${groupKey}`} className="bg-slate-100/80 hover:bg-slate-100/80">
                          <TableCell 
                            colSpan={8} 
                            className="py-2 px-4 bg-slate-50 border-b border-t"
                          >
                            <span className="font-bold text-slate-700">{groupKey}</span>
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
                                {row.region || '—'}
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
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleDeletePDF(row)}
                                      disabled={deletingPdf === row.id}
                                      className="h-7 px-1 text-red-600 hover:text-red-700"
                                      title="Delete PDF"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="text-sm text-muted-foreground">—</span>
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
      />
    </div>
  )
}
