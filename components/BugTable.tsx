'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Bug,
  Lightbulb,
  MessageSquare,
  ExternalLink,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { format } from 'date-fns'

interface FeedbackItem {
  id: string
  user_id: string
  type: string
  title: string
  description: string | null
  page_url: string | null
  browser_info: string | null
  status: string
  priority: string
  admin_notes: string | null
  created_at: string
  resolved_at: string | null
  user_email?: string
  user_name?: string
}

const statusColors: Record<string, string> = {
  open: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-amber-50 text-amber-700',
  resolved: 'bg-green-50 text-green-700',
  closed: 'bg-gray-100 text-gray-600',
}

const priorityColors: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-50 text-blue-700',
  high: 'bg-orange-50 text-orange-700',
  critical: 'bg-red-50 text-red-700',
}

const typeIcons: Record<string, React.ReactNode> = {
  bug: <Bug className="h-4 w-4 text-red-500" />,
  feature: <Lightbulb className="h-4 w-4 text-amber-500" />,
  feedback: <MessageSquare className="h-4 w-4 text-blue-500" />,
}

const PAGE_SIZE = 20

export function BugTable() {
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [selectedItem, setSelectedItem] = useState<FeedbackItem | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  const [stats, setStats] = useState({
    openBugs: 0,
    featureRequests: 0,
    resolvedThisWeek: 0,
    avgResolutionDays: 0,
  })

  const fetchFeedback = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    let query = supabase
      .from('tfs_user_feedback')
      .select('*')
      .order('created_at', { ascending: false })

    if (statusFilter !== 'all') query = query.eq('status', statusFilter)
    if (typeFilter !== 'all') query = query.eq('type', typeFilter)
    if (priorityFilter !== 'all') query = query.eq('priority', priorityFilter)

    const { data, error } = await query
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (error) {
      toast({ title: 'Error', description: 'Failed to load feedback.', variant: 'destructive' })
      setLoading(false)
      return
    }

    setItems(data || [])
    setLoading(false)
  }, [statusFilter, typeFilter, priorityFilter, page])

  const fetchStats = useCallback(async () => {
    const supabase = createClient()
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [openBugs, features, resolvedWeek, allResolved] = await Promise.all([
      supabase.from('tfs_user_feedback').select('id', { count: 'exact', head: true }).eq('type', 'bug').in('status', ['open', 'in_progress']),
      supabase.from('tfs_user_feedback').select('id', { count: 'exact', head: true }).eq('type', 'feature').in('status', ['open', 'in_progress']),
      supabase.from('tfs_user_feedback').select('id', { count: 'exact', head: true }).eq('status', 'resolved').gte('resolved_at', weekAgo),
      supabase.from('tfs_user_feedback').select('created_at, resolved_at').eq('status', 'resolved').not('resolved_at', 'is', null),
    ])

    let avgDays = 0
    if (allResolved.data && allResolved.data.length > 0) {
      const totalDays = allResolved.data.reduce((sum, item) => {
        const created = new Date(item.created_at).getTime()
        const resolved = new Date(item.resolved_at!).getTime()
        return sum + (resolved - created) / (1000 * 60 * 60 * 24)
      }, 0)
      avgDays = Math.round((totalDays / allResolved.data.length) * 10) / 10
    }

    setStats({
      openBugs: openBugs.count || 0,
      featureRequests: features.count || 0,
      resolvedThisWeek: resolvedWeek.count || 0,
      avgResolutionDays: avgDays,
    })
  }, [])

  useEffect(() => {
    fetchFeedback()
  }, [fetchFeedback])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  async function updateItem(id: string, updates: Record<string, unknown>) {
    const supabase = createClient()
    const { error } = await supabase
      .from('tfs_user_feedback')
      .update(updates)
      .eq('id', id)

    if (error) {
      toast({ title: 'Error', description: 'Failed to update.', variant: 'destructive' })
      return
    }

    toast({ title: 'Updated', description: 'Feedback updated successfully.', variant: 'success' })
    fetchFeedback()
    fetchStats()

    if (selectedItem?.id === id) {
      setSelectedItem((prev) => prev ? { ...prev, ...updates as Partial<FeedbackItem> } : null)
    }
  }

  async function deleteItem(id: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from('tfs_user_feedback')
      .delete()
      .eq('id', id)

    if (error) {
      toast({ title: 'Error', description: 'Failed to delete.', variant: 'destructive' })
      return
    }

    toast({ title: 'Deleted', description: 'Feedback deleted.', variant: 'success' })
    setDeleteConfirmId(null)
    if (selectedItem?.id === id) {
      setDetailOpen(false)
      setSelectedItem(null)
    }
    fetchFeedback()
    fetchStats()
  }

  function markResolved(id: string) {
    updateItem(id, { status: 'resolved', resolved_at: new Date().toISOString() })
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Open Bugs" value={stats.openBugs} color="text-red-600" bg="bg-red-50" />
        <StatCard label="Feature Requests" value={stats.featureRequests} color="text-amber-600" bg="bg-amber-50" />
        <StatCard label="Resolved This Week" value={stats.resolvedThisWeek} color="text-green-600" bg="bg-green-50" />
        <StatCard label="Avg Resolution (days)" value={stats.avgResolutionDays} color="text-blue-600" bg="bg-blue-50" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="w-40">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0) }}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-40">
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0) }}>
            <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="bug">Bug</SelectItem>
              <SelectItem value="feature">Feature</SelectItem>
              <SelectItem value="feedback">Feedback</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-40">
          <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v); setPage(0) }}>
            <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No feedback items found.</div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead className="hidden md:table-cell">Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="sm:hidden">{typeIcons[item.type]}</span>
                      <span className="font-medium text-gray-900 truncate max-w-[200px]">
                        {item.title}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex items-center gap-1.5">
                      {typeIcons[item.type]}
                      <span className="capitalize text-sm">{item.type}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge className={priorityColors[item.priority]}>
                      {item.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[item.status]}>
                      {item.status.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-gray-500">
                    {format(new Date(item.created_at), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setSelectedItem(item); setDetailOpen(true) }}
                        title="View details"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteConfirmId(item.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            <span className="text-sm text-gray-500">Page {page + 1}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={items.length < PAGE_SIZE}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </>
      )}

      {/* Detail Panel */}
      <BugDetailDialog
        item={selectedItem}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdateItem={updateItem}
        onMarkResolved={markResolved}
      />

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(v) => { if (!v) setDeleteConfirmId(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Feedback</DialogTitle>
            <DialogDescription>
              Are you sure? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && deleteItem(deleteConfirmId)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatCard({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div className={`rounded-xl ${bg} p-4`}>
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

function BugDetailDialog({
  item,
  open,
  onOpenChange,
  onUpdateItem,
  onMarkResolved,
}: {
  item: FeedbackItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdateItem: (id: string, updates: Record<string, unknown>) => void
  onMarkResolved: (id: string) => void
}) {
  const [adminNotes, setAdminNotes] = useState(item?.admin_notes || '')

  useEffect(() => {
    setAdminNotes(item?.admin_notes || '')
  }, [item])

  if (!item) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {typeIcons[item.type]}
            <DialogTitle>{item.title}</DialogTitle>
          </div>
          <DialogDescription asChild>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={statusColors[item.status]}>{item.status.replace('_', ' ')}</Badge>
              <Badge className={priorityColors[item.priority]}>{item.priority}</Badge>
              <span className="text-xs text-gray-400">
                {format(new Date(item.created_at), 'dd MMM yyyy HH:mm')}
              </span>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[50vh] overflow-y-auto">
          {item.description && (
            <div>
              <Label className="text-xs text-gray-500">Description</Label>
              <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{item.description}</p>
            </div>
          )}

          {item.page_url && (
            <div>
              <Label className="text-xs text-gray-500">Page URL</Label>
              <a
                href={item.page_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline flex items-center gap-1 mt-1"
              >
                {item.page_url} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {item.browser_info && (
            <div>
              <Label className="text-xs text-gray-500">Browser Info</Label>
              <p className="text-xs text-gray-500 mt-1 font-mono break-all">{item.browser_info}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Status</Label>
              <Select
                value={item.status}
                onValueChange={(v) => {
                  const updates: Record<string, unknown> = { status: v }
                  if (v === 'resolved') updates.resolved_at = new Date().toISOString()
                  onUpdateItem(item.id, updates)
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Priority</Label>
              <Select
                value={item.priority}
                onValueChange={(v) => onUpdateItem(item.id, { priority: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Admin Notes</Label>
            <Textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="Internal notes..."
              rows={3}
            />
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => onUpdateItem(item.id, { admin_notes: adminNotes })}
            >
              Save Notes
            </Button>
          </div>
        </div>

        <DialogFooter>
          {item.status !== 'resolved' && (
            <Button onClick={() => onMarkResolved(item.id)} className="bg-green-600 hover:bg-green-700 text-white">
              Mark Resolved
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
