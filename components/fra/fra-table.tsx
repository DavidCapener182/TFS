'use client'

import { Fragment, useMemo, useState, useEffect } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn, getDisplayStoreCode } from '@/lib/utils'
import { UserRole } from '@/lib/auth'
import { getFRAPDFDownloadUrl, deleteFRAPDF } from '@/app/actions/fra-pdfs'
import { updateFRA } from '@/app/actions/stores'
import { uploadFraPdfFromClient } from '@/lib/fra/upload-pdf-client'
import { Upload, File, SlidersHorizontal, ChevronDown, ChevronUp, Search } from 'lucide-react'
import { PDFViewerModal } from '@/components/shared/pdf-viewer-modal'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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

// Re-export for backward compatibility
export type { FRARow }

interface EditState {
  storeId: string
  date: string
  notes: string
  pdfFile: File | null
}

interface DeleteFRAPdfState {
  row: FRARow
}

export function FRATable({ 
  rows, 
  userRole, 
  areaFilter: externalAreaFilter, 
  onAreaFilterChange 
}: { 
  rows: FRARow[]
  userRole: UserRole
  areaFilter?: string
  onAreaFilterChange?: (area: string) => void
}) {
  const [search, setSearch] = useState('')
  const [internalArea, setInternalArea] = useState<string>('all')
  const area = externalAreaFilter !== undefined ? externalAreaFilter : internalArea
  const setArea = onAreaFilterChange || setInternalArea
  const [editing, setEditing] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)
  const [localRows, setLocalRows] = useState<FRARow[]>(rows)
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null)
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false)
  const [selectedPdfRow, setSelectedPdfRow] = useState<FRARow | null>(null)
  const [uploadingPdf, setUploadingPdf] = useState<string | null>(null)
  const [deletingPdf, setDeletingPdf] = useState<string | null>(null)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [deletePdfDialog, setDeletePdfDialog] = useState<DeleteFRAPdfState | null>(null)
  const [tableMessage, setTableMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Sync localRows with rows prop when it changes
  useEffect(() => {
    setLocalRows(rows)
  }, [rows])

  useEffect(() => {
    if (!tableMessage) return
    const timer = window.setTimeout(() => setTableMessage(null), 4000)
    return () => window.clearTimeout(timer)
  }, [tableMessage])

  const areaOptions = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((r) => r.region && set.add(r.region))
    return Array.from(set).sort()
  }, [rows])

  // Filter stores that need FRA (not completed yet - completed ones go to separate tab)
  const filtered = useMemo(() => {
    return localRows.filter((row) => {
      const needsFRA = storeNeedsFRA(row)
      const status = getFRAStatus(row.fire_risk_assessment_date, needsFRA)
      
      // Only show stores that need FRA and are NOT "up_to_date"
      // "Up to date" stores should go to the Completed tab
      if (!needsFRA) return false
      if (status === 'up_to_date') return false // Up to date FRAs go to the Completed tab
      
      const matchesArea = area === 'all' || row.region === area
      const term = search.trim().toLowerCase()
      const matchesSearch =
        term.length === 0 ||
        row.store_name.toLowerCase().includes(term) ||
        (row.store_code || '').toLowerCase().includes(term)
      
      return matchesArea && matchesSearch
    })
  }, [localRows, area, search])
  
  const grouped = useMemo(() => {
    const map = new Map<string, FRARow[]>()
    
    // 1. Group by Region
    filtered.forEach((row) => {
      const key = row.region || 'Unassigned'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(row)
    })

    // 2. Sort STORES within each area by status (overdue first, then due, then up to date)
    map.forEach((storeRows) => {
      storeRows.sort((a, b) => {
        const needsA = storeNeedsFRA(a)
        const needsB = storeNeedsFRA(b)
        const statusA = getFRAStatus(a.fire_risk_assessment_date, needsA)
        const statusB = getFRAStatus(b.fire_risk_assessment_date, needsB)
        
        const statusOrder = { 'overdue': 0, 'due': 1, 'required': 2, 'up_to_date': 3, 'not_required': 4 }
        const orderA = statusOrder[statusA] ?? 4
        const orderB = statusOrder[statusB] ?? 4
        
        if (orderA !== orderB) return orderA - orderB
        
        // Same status, sort by store name
        return a.store_name.localeCompare(b.store_name)
      })
    })

    // 3. Sort AREAS alphabetically
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const handleAddFRA = (row: FRARow) => {
    setEditing({
      storeId: row.id,
      date: row.fire_risk_assessment_date || new Date().toISOString().split('T')[0],
      notes: row.fire_risk_assessment_notes || '',
      pdfFile: null
    })
  }

  const handleCancelEdit = () => {
    setEditing(null)
  }

  const handleSaveFRA = async () => {
    if (!editing) return

    const { storeId, date, notes, pdfFile } = editing

    // Validate
    if (!date) {
      setTableMessage({ type: 'error', text: 'Please enter an FRA date.' })
      return
    }
    
    setSaving(true)
    setTableMessage(null)
    const storeName = localRows.find((row) => row.id === storeId)?.store_name ?? 'store'

    try {
      // Upload PDF if provided
      let pdfPath: string | null = null
      if (pdfFile) {
        try {
          pdfPath = await uploadFraPdfFromClient(storeId, pdfFile)
        } catch (uploadError) {
          console.error('PDF upload error:', uploadError)
          const uploadErrorMessage = uploadError instanceof Error ? uploadError.message : 'Unknown error'
          setTableMessage({ type: 'error', text: `Failed to upload PDF: ${uploadErrorMessage}` })
          return
        }
      }

      // Update FRA data
      await updateFRA(storeId, date, notes || null, null, pdfPath)

      // Update local state
      setLocalRows(prevRows => 
        prevRows.map(row => {
          if (row.id === storeId) {
            return {
              ...row,
              fire_risk_assessment_date: date,
              fire_risk_assessment_pct: null,
              fire_risk_assessment_notes: notes || null,
              fire_risk_assessment_pdf_path: pdfPath || row.fire_risk_assessment_pdf_path,
            }
          }
          return row
        })
      )

      setEditing(null)
      setTableMessage({
        type: 'success',
        text: `FRA saved for ${storeName}.`,
      })
    } catch (error) {
      console.error('Error saving FRA:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to save FRA. Please try again.'
      setTableMessage({ type: 'error', text: errorMessage })
    } finally {
      setSaving(false)
    }
  }

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

  const handleUploadPDFStandalone = async (row: FRARow, file: File) => {
    setUploadingPdf(row.id)
    setTableMessage(null)
    try {
      const uploadedFilePath = await uploadFraPdfFromClient(row.id, file)

      // Update local state
      setLocalRows(prevRows => prevRows.map(r => {
        if (r.id === row.id) {
          return { ...r, fire_risk_assessment_pdf_path: uploadedFilePath }
        }
        return r
      }))
      setTableMessage({
        type: 'success',
        text: `FRA PDF uploaded for ${row.store_name}.`,
      })
    } catch (error) {
      console.error('Error uploading PDF:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setTableMessage({ type: 'error', text: `Failed to upload PDF: ${errorMessage}` })
    } finally {
      setUploadingPdf(null)
    }
  }

  const handleDeletePDF = (row: FRARow) => {
    setDeletePdfDialog({ row })
  }

  const handleConfirmDeletePDF = async () => {
    if (!deletePdfDialog) return
    const { row } = deletePdfDialog

    setDeletingPdf(row.id)
    setTableMessage(null)
    try {
      await deleteFRAPDF(row.id)
      
      // Update local state immediately - clear PDF and all FRA data
      setLocalRows(prevRows => prevRows.map(r => {
        if (r.id === row.id) {
          return { 
            ...r, 
            fire_risk_assessment_pdf_path: null,
            fire_risk_assessment_date: null,
            fire_risk_assessment_pct: null,
            fire_risk_assessment_rating: null,
            fire_risk_assessment_notes: null
          }
        }
        return r
      }))
      
      // Close PDF viewer if it's open for this row
      if (selectedPdfRow?.id === row.id) {
        setPdfViewerOpen(false)
        setSelectedPdfRow(null)
      }
      setDeletePdfDialog(null)
      setTableMessage({
        type: 'success',
        text: `FRA PDF deleted for ${row.store_name}.`,
      })
    } catch (error) {
      console.error('Error deleting PDF:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setTableMessage({ type: 'error', text: `Failed to delete PDF: ${errorMessage}` })
    } finally {
      setDeletingPdf(null)
    }
  }

  const renderDateCell = (date: string | null, storeId: string) => {
    const isEditing = editing?.storeId === storeId
    
    if (isEditing) {
      return (
        <Input
          type="date"
          value={editing.date}
          onChange={(e) => setEditing({ ...editing, date: e.target.value })}
          className="h-8 text-xs"
        />
      )
    }
    
    return <span className="text-sm text-muted-foreground">{formatDate(date)}</span>
  }

  const renderNotesCell = (notes: string | null, storeId: string) => {
    const isEditing = editing?.storeId === storeId
    
    if (isEditing) {
      return (
        <Textarea
          value={editing.notes}
          onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
          className="h-16 text-xs min-w-[200px]"
          placeholder="Optional notes..."
        />
      )
    }
    
    return (
      <span className="text-sm text-muted-foreground max-w-[200px] truncate block">
        {notes || '—'}
      </span>
    )
  }

  const hasActiveFilters = search.trim().length > 0 || area !== 'all'
  const activeFilterCount = Number(search.trim().length > 0) + Number(area !== 'all')
  const desktopTableDensityClass = 'desktop-table-comfortable'

  const resetFilters = () => {
    setSearch('')
    setArea('all')
  }

  return (
    <div className="space-y-4">
      {/* Mobile Sticky Controls */}
      <div className="md:hidden sticky top-2 z-20 px-0.5">
        <div className={cn('mobile-sticky-shell rounded-2xl border px-3 py-2.5', mobileFiltersOpen && 'shadow-md')}>
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMobileFiltersOpen((prev) => !prev)}
              className="h-8 px-2.5 text-xs border-slate-200 bg-white/80"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
              Filters
              {activeFilterCount > 0 ? (
                <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-slate-900 px-1 text-[10px] text-white">
                  {activeFilterCount}
                </span>
              ) : null}
              {mobileFiltersOpen ? (
                <ChevronUp className="h-3.5 w-3.5 ml-1.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 ml-1.5" />
              )}
            </Button>
            <div className="rounded-full bg-white/80 border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 font-medium">
              {filtered.length} of {localRows.length}
            </div>
          </div>

          {mobileFiltersOpen ? (
            <div className="mt-3 space-y-2 border-t pt-3">
              <Input
                placeholder="Search store name or code"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-white min-h-[var(--touch-target-min)]"
              />
              <Select value={area} onValueChange={setArea}>
                <SelectTrigger className="w-full bg-white min-h-[var(--touch-target-min)]">
                  <SelectValue placeholder="Area" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All areas</SelectItem>
                  {areaOptions.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={resetFilters}
                  disabled={!hasActiveFilters}
                  className="min-h-[var(--touch-target-min)] w-full text-slate-600"
                >
                  Reset
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Desktop Controls */}
      <div className="hidden md:flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search store name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-[var(--touch-target-min)] bg-white pl-9"
            />
          </div>
          <Select value={area} onValueChange={setArea}>
            <SelectTrigger className="w-full sm:w-44 bg-white min-h-[var(--touch-target-min)]">
              <SelectValue placeholder="Area" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All areas</SelectItem>
              {areaOptions.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            onClick={resetFilters}
            disabled={!hasActiveFilters}
            className="min-h-[var(--touch-target-min)] text-slate-500 hover:text-slate-700"
          >
            Reset
          </Button>
        </div>
        <div className="flex items-center gap-3 lg:border-l lg:border-slate-200 lg:pl-4">
          <div className="text-sm text-slate-500">
            Showing {filtered.length} of {localRows.length} stores
          </div>
        </div>
      </div>

      {tableMessage ? (
        <div
          className={cn(
            'rounded-lg border px-3 py-2 text-sm',
            tableMessage.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          )}
        >
          {tableMessage.text}
        </div>
      ) : null}

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {grouped.length === 0 ? (
          <div className="rounded-2xl border bg-white px-4 py-8 text-center text-sm text-muted-foreground">
            No FRA data found matching your filters.
          </div>
        ) : (
          grouped.map(([groupKey, areaRows]) => (
            <div key={`mob-${groupKey}`} className="space-y-2.5">
              <div className="mobile-group-bar rounded-xl border px-3 py-2 text-sm font-semibold text-slate-800">
                {groupKey}
              </div>
              <div className="space-y-2.5">
                {areaRows.map((row) => {
                  const needsFRA = storeNeedsFRA(row)
                  const status = getFRAStatus(row.fire_risk_assessment_date, needsFRA)
                  const days = getDaysUntilDue(row.fire_risk_assessment_date)
                  const nextDue = calculateNextDueDate(row.fire_risk_assessment_date)
                  const isEditingRow = editing?.storeId === row.id

                  return (
                    <div key={row.id} className="mobile-card-surface rounded-2xl border p-3.5 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate leading-tight">{row.store_name}</div>
                          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono">
                              {getDisplayStoreCode(row.store_code) || '—'}
                            </span>
                            <span>{row.region || 'Unassigned'}</span>
                          </div>
                        </div>
                        <div>{statusBadge(status, days)}</div>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="rounded-xl border bg-white/90 px-2.5 py-2">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">Last FRA</div>
                          <div className="mt-1 text-xs text-slate-700 leading-tight">{formatDate(row.fire_risk_assessment_date)}</div>
                        </div>
                        <div className="rounded-xl border bg-white/90 px-2.5 py-2">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">Next Due</div>
                          <div className="mt-1 text-xs text-slate-700 leading-tight">
                            {nextDue ? formatDate(nextDue.toISOString().split('T')[0]) : '—'}
                          </div>
                        </div>
                        <div className="rounded-xl border bg-white/90 px-2.5 py-2">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">Risk Rating</div>
                          <div className="mt-1">{fraRiskRatingBadge(row.fire_risk_assessment_rating)}</div>
                        </div>
                      </div>

                      {row.fire_risk_assessment_notes ? (
                        <p className="mt-2 text-xs text-slate-600 line-clamp-2">{row.fire_risk_assessment_notes}</p>
                      ) : null}

                      {isEditingRow ? (
                        <div className="mt-3 space-y-2.5 border-t border-slate-200/80 pt-3">
                          <Input
                            type="date"
                            value={editing?.date || ''}
                            onChange={(e) => setEditing((prev) => prev ? { ...prev, date: e.target.value } : prev)}
                            className="bg-white"
                          />
                          <Textarea
                            value={editing?.notes || ''}
                            onChange={(e) => setEditing((prev) => prev ? { ...prev, notes: e.target.value } : prev)}
                            className="min-h-[90px] bg-white"
                            placeholder="Notes (optional)"
                          />

                          <div className="flex items-center gap-2">
                            <input
                              type="file"
                              id={`pdf-upload-mobile-fra-${row.id}`}
                              accept=".pdf,application/pdf"
                              onChange={(e) => {
                                const file = e.target.files?.[0] || null
                                setEditing((prev) => prev ? { ...prev, pdfFile: file } : prev)
                              }}
                              className="hidden"
                              disabled={saving}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              type="button"
                              onClick={() => document.getElementById(`pdf-upload-mobile-fra-${row.id}`)?.click()}
                              disabled={saving}
                              className="border-slate-300 bg-white"
                            >
                              <Upload className="h-3 w-3 mr-1" />
                              Upload PDF
                            </Button>
                            {editing?.pdfFile ? (
                              <span className="text-xs text-slate-500 truncate">{editing.pdfFile.name}</span>
                            ) : null}
                          </div>

                          <div className="flex gap-2">
                            <Button size="sm" onClick={handleSaveFRA} disabled={saving} className="flex-1 bg-slate-900 text-white hover:bg-slate-800">
                              {saving ? 'Saving...' : 'Save'}
                            </Button>
                            <Button size="sm" variant="outline" onClick={handleCancelEdit} disabled={saving} className="flex-1 border-slate-300 bg-white">
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200/80 pt-3">
                          <Button size="sm" onClick={() => handleAddFRA(row)} className="w-full bg-slate-900 text-white hover:bg-slate-800">
                            {row.fire_risk_assessment_date ? 'Edit FRA' : 'Add FRA'}
                          </Button>
                          {row.fire_risk_assessment_pdf_path ? (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleViewPDF(row)}
                                className="h-8 border border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50"
                              >
                                <File className="h-3.5 w-3.5 mr-1" />
                                View PDF
                              </Button>
                            </>
                          ) : row.fire_risk_assessment_date ? (
                            <>
                              <input
                                type="file"
                                id={`pdf-upload-mobile-quick-fra-${row.id}`}
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
                                variant="outline"
                                onClick={() => document.getElementById(`pdf-upload-mobile-quick-fra-${row.id}`)?.click()}
                                disabled={uploadingPdf === row.id}
                                className="h-8 border-slate-300 bg-white"
                              >
                                <Upload className="h-3.5 w-3.5 mr-1" />
                                {uploadingPdf === row.id ? 'Uploading...' : 'Upload PDF'}
                              </Button>
                            </>
                          ) : null}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table Container */}
      <div className="hidden md:flex rounded-2xl border desktop-table-shell shadow-sm overflow-hidden flex-col">
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <div className="min-w-[940px]">
            <Table className={cn('w-full border-separate border-spacing-0', desktopTableDensityClass)} style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '32px' }} />
                <col style={{ width: '54px' }} />
                <col style={{ width: '68px' }} />
                <col style={{ width: '160px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '126px' }} />
                <col style={{ width: '128px' }} />
                <col style={{ width: '120px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '128px' }} />
              </colgroup>
              <TableHeader className="desktop-table-head border-b border-slate-200">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-center bg-transparent text-[11px] font-semibold uppercase tracking-wide text-slate-500">#</TableHead>
                  <TableHead className="bg-transparent text-[11px] font-semibold uppercase tracking-wide text-slate-500">Area</TableHead>
                  <TableHead className="bg-transparent text-[11px] font-semibold uppercase tracking-wide text-slate-500">Store Code</TableHead>
                  <TableHead className="bg-transparent text-[11px] font-semibold uppercase tracking-wide text-slate-500">Store Name</TableHead>
                  <TableHead className="bg-transparent text-[11px] font-semibold uppercase tracking-wide text-slate-500">Last FRA Date</TableHead>
                  <TableHead className="bg-transparent text-[11px] font-semibold uppercase tracking-wide text-slate-500">Next Due Date</TableHead>
                  <TableHead className="bg-transparent text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</TableHead>
                  <TableHead className="bg-transparent text-[11px] font-semibold uppercase tracking-wide text-slate-500">Risk Rating</TableHead>
                  <TableHead className="bg-transparent text-[11px] font-semibold uppercase tracking-wide text-slate-500">PDF</TableHead>
                  <TableHead className="bg-transparent text-[11px] font-semibold uppercase tracking-wide text-slate-500">Notes</TableHead>
                  <TableHead className="bg-transparent text-[11px] font-semibold uppercase tracking-wide text-slate-500">Actions</TableHead>
                </TableRow>
              </TableHeader>
            </Table>
            <div className="h-[70vh] overflow-y-auto">
              <Table className={cn('w-full border-separate border-spacing-0', desktopTableDensityClass)} style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '32px' }} />
                  <col style={{ width: '54px' }} />
                  <col style={{ width: '68px' }} />
                  <col style={{ width: '160px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '126px' }} />
                  <col style={{ width: '128px' }} />
                  <col style={{ width: '120px' }} />
                  <col style={{ width: '150px' }} />
                  <col style={{ width: '128px' }} />
                </colgroup>
                <TableBody>
                  {grouped.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-muted-foreground py-10">
                        No FRA data found matching your filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    grouped.map(([groupKey, areaRows]) => {
                      return (
                        <Fragment key={groupKey}>
                          {/* Area Divider Row */}
                          <TableRow className="desktop-group-bar hover:bg-transparent">
                            <TableCell 
                              colSpan={11} 
                              className="py-1.5 px-4 border-y border-slate-200/70"
                            >
                              <span className="font-bold text-slate-700">{groupKey}</span>
                            </TableCell>
                          </TableRow>

                      {/* Store Rows */}
                      {areaRows.map((row, idx) => {
                        const needsFRA = storeNeedsFRA(row)
                        const status = getFRAStatus(row.fire_risk_assessment_date, needsFRA)
                        const days = getDaysUntilDue(row.fire_risk_assessment_date)
                        const nextDue = calculateNextDueDate(row.fire_risk_assessment_date)
                        
                        return (
                          <TableRow
                            key={row.id}
                            className="group transition-colors hover:bg-slate-50/70"
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
                              {renderDateCell(row.fire_risk_assessment_date, row.id)}
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
                              <div className="flex items-center gap-1">
                                {row.fire_risk_assessment_pdf_path ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleViewPDF(row)}
                                      className="h-7 border border-slate-200 bg-white px-2 text-xs hover:bg-slate-50"
                                      title="View PDF"
                                    >
                                      <File className="h-4 w-4 text-slate-700" />
                                    </Button>
                                  </>
                                ) : row.fire_risk_assessment_date ? (
                                  <div className="relative">
                                    <input
                                      type="file"
                                      id={`pdf-upload-fra-${row.id}`}
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
                                      onClick={() => document.getElementById(`pdf-upload-fra-${row.id}`)?.click()}
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
                                ) : (
                                  <span className="text-sm text-muted-foreground">—</span>
                                )}
                              </div>
                            </TableCell>
                            
                            <TableCell className="border-b bg-white group-hover:bg-slate-50">
                              {renderNotesCell(row.fire_risk_assessment_notes, row.id)}
                            </TableCell>
                            
                            <TableCell className="border-b bg-white group-hover:bg-slate-50">
                              {editing?.storeId === row.id ? (
                                <div className="flex flex-col gap-1.5 min-w-[180px]">
                                  <div className="flex gap-1 flex-wrap">
                                    <Button
                                      size="sm"
                                      variant="default"
                                      onClick={handleSaveFRA}
                                      disabled={saving}
                                      className="h-7 bg-slate-900 px-2 text-xs text-white whitespace-nowrap hover:bg-slate-800"
                                    >
                                      {saving ? 'Saving...' : 'Save'}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={handleCancelEdit}
                                      disabled={saving}
                                      className="h-7 border-slate-300 bg-white px-2 text-xs whitespace-nowrap hover:bg-slate-50"
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                  <div className="relative">
                                    <input
                                      type="file"
                                      id={`pdf-upload-${row.id}`}
                                      accept=".pdf,application/pdf"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0] || null
                                        if (editing) {
                                          setEditing({ ...editing, pdfFile: file })
                                        }
                                      }}
                                      className="hidden"
                                      disabled={saving}
                                    />
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      type="button"
                                      onClick={() => document.getElementById(`pdf-upload-${row.id}`)?.click()}
                                      disabled={saving}
                                      className="h-6 w-fit border-slate-300 bg-white px-1.5 text-[11px] hover:bg-slate-50"
                                    >
                                      <Upload className="h-2.5 w-2.5 mr-1" />
                                      {editing?.pdfFile ? editing.pdfFile.name.substring(0, 12) + '...' : 'Upload PDF'}
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                // In Required tab, all stores need FRA and haven't completed it, so always show button
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => handleAddFRA(row)}
                                  className="h-7 bg-slate-900 px-2 text-xs text-white whitespace-nowrap hover:bg-slate-800"
                                >
                                  {row.fire_risk_assessment_date ? 'Edit FRA' : 'Add FRA'}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                          })}
                        </Fragment>
                      )
                    })
                  )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  </div>
      
      {/* PDF Viewer Modal */}
      <PDFViewerModal
        open={pdfViewerOpen}
        onOpenChange={setPdfViewerOpen}
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

      {/* Delete PDF Dialog */}
      <Dialog
        open={!!deletePdfDialog}
        onOpenChange={(open) => {
          if (!open) {
            setDeletePdfDialog(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete FRA PDF</DialogTitle>
            <DialogDescription>
              {deletePdfDialog
                ? `Remove the Fire Risk Assessment PDF for ${deletePdfDialog.row.store_name}?`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletePdfDialog(null)}
              disabled={!!deletingPdf}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDeletePDF}
              disabled={!deletePdfDialog || deletingPdf === deletePdfDialog.row.id}
            >
              {deletePdfDialog && deletingPdf === deletePdfDialog.row.id ? 'Deleting...' : 'Delete PDF'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
