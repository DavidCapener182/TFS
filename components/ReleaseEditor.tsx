'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Pencil, Wand2, Trash2, Eye, EyeOff } from 'lucide-react'
import { format } from 'date-fns'

interface ReleaseNote {
  id: string
  version: string
  title: string | null
  description: string | null
  content: string | null
  created_at: string
  is_active: boolean
}

interface FormState {
  version: string
  title: string
  description: string
  content: string
  is_active: boolean
}

const emptyForm: FormState = {
  version: '',
  title: '',
  description: '',
  content: '',
  is_active: true,
}

export function ReleaseEditor() {
  const [releases, setReleases] = useState<ReleaseNote[]>([])
  const [loading, setLoading] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const fetchReleases = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('release_notes')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      toast({ title: 'Error', description: 'Failed to load releases.', variant: 'destructive' })
    } else {
      setReleases(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchReleases()
  }, [fetchReleases])

  function openNewEditor() {
    setEditingId(null)
    setForm(emptyForm)
    setErrors({})
    setEditorOpen(true)
  }

  function openEditEditor(release: ReleaseNote) {
    setEditingId(release.id)
    setForm({
      version: release.version,
      title: release.title || '',
      description: release.description || '',
      content: release.content || '',
      is_active: release.is_active,
    })
    setErrors({})
    setEditorOpen(true)
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {}
    if (!form.version.trim()) newErrors.version = 'Version is required'
    if (!form.title.trim()) newErrors.title = 'Title is required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    const supabase = createClient()

    const payload = {
      version: form.version.trim(),
      title: form.title.trim(),
      description: form.description.trim(),
      content: form.content.trim(),
      is_active: form.is_active,
    }

    if (editingId) {
      const { error } = await supabase
        .from('release_notes')
        .update(payload)
        .eq('id', editingId)

      if (error) {
        toast({ title: 'Error', description: 'Failed to update release.', variant: 'destructive' })
        setSaving(false)
        return
      }
      toast({ title: 'Updated', description: 'Release notes updated.', variant: 'success' })
    } else {
      const { error } = await supabase
        .from('release_notes')
        .insert(payload)

      if (error) {
        toast({ title: 'Error', description: 'Failed to create release.', variant: 'destructive' })
        setSaving(false)
        return
      }
      toast({ title: 'Created', description: 'Release notes created.', variant: 'success' })
    }

    setSaving(false)
    setEditorOpen(false)
    fetchReleases()
  }

  async function toggleActive(id: string, currentActive: boolean) {
    const supabase = createClient()
    const { error } = await supabase
      .from('release_notes')
      .update({ is_active: !currentActive })
      .eq('id', id)

    if (error) {
      toast({ title: 'Error', description: 'Failed to update.', variant: 'destructive' })
      return
    }
    toast({ title: 'Updated', variant: 'success' })
    fetchReleases()
  }

  async function deleteRelease(id: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from('release_notes')
      .delete()
      .eq('id', id)

    if (error) {
      toast({ title: 'Error', description: 'Failed to delete.', variant: 'destructive' })
      return
    }
    toast({ title: 'Deleted', variant: 'success' })
    setDeleteConfirmId(null)
    fetchReleases()
  }

  async function generateChangelog() {
    setGenerating(true)
    const supabase = createClient()

    const lastActiveRelease = releases.find((r) => r.is_active)
    const sinceDate = lastActiveRelease
      ? lastActiveRelease.created_at
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const { data: resolved } = await supabase
      .from('user_feedback')
      .select('type, title')
      .eq('status', 'resolved')
      .gte('resolved_at', sinceDate)
      .order('type')

    if (!resolved || resolved.length === 0) {
      toast({ title: 'No Data', description: 'No resolved items found since the last release.', variant: 'destructive' })
      setGenerating(false)
      return
    }

    const features = resolved.filter((r) => r.type === 'feature')
    const bugs = resolved.filter((r) => r.type === 'bug')
    const improvements = resolved.filter((r) => r.type === 'feedback')

    let markdown = ''
    if (features.length > 0) {
      markdown += '## New Features\n'
      features.forEach((f) => { markdown += `- ${f.title}\n` })
      markdown += '\n'
    }
    if (improvements.length > 0) {
      markdown += '## Improvements\n'
      improvements.forEach((f) => { markdown += `- ${f.title}\n` })
      markdown += '\n'
    }
    if (bugs.length > 0) {
      markdown += '## Bug Fixes\n'
      bugs.forEach((f) => { markdown += `- ${f.title}\n` })
      markdown += '\n'
    }

    setForm((prev) => ({ ...prev, content: markdown.trim() }))
    toast({ title: 'Generated', description: 'Changelog generated from resolved feedback.', variant: 'success' })
    setGenerating(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Releases</h2>
          <p className="text-sm text-gray-500">{releases.length} total releases</p>
        </div>
        <Button onClick={openNewEditor}>
          <Plus className="h-4 w-4 mr-2" /> New Release
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : releases.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No releases yet. Create your first one.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Version</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
              <TableHead className="hidden md:table-cell">Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {releases.map((release) => (
              <TableRow key={release.id}>
                <TableCell>
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    v{release.version}
                  </span>
                </TableCell>
                <TableCell className="font-medium">{release.title || '—'}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge className={release.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}>
                    {release.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm text-gray-500">
                  {format(new Date(release.created_at), 'dd MMM yyyy')}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditEditor(release)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleActive(release.id, release.is_active)}
                      title={release.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {release.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteConfirmId(release.id)} title="Delete">
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Release' : 'New Release'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update the release notes.' : 'Create a new release version.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="release-version">Version</Label>
                <Input
                  id="release-version"
                  placeholder="e.g. 1.5.0"
                  value={form.version}
                  onChange={(e) => { setForm((p) => ({ ...p, version: e.target.value })); setErrors((p) => ({ ...p, version: '' })) }}
                />
                {errors.version && <p className="text-xs text-red-500">{errors.version}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="release-title">Title</Label>
                <Input
                  id="release-title"
                  placeholder="e.g. Performance & Bug Fixes"
                  value={form.title}
                  onChange={(e) => { setForm((p) => ({ ...p, title: e.target.value })); setErrors((p) => ({ ...p, title: '' })) }}
                />
                {errors.title && <p className="text-xs text-red-500">{errors.title}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="release-description">Description</Label>
              <Input
                id="release-description"
                placeholder="Brief summary of this release"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="release-content">Release Notes (Markdown)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={generateChangelog}
                  disabled={generating}
                >
                  <Wand2 className="h-4 w-4 mr-1" />
                  {generating ? 'Generating...' : 'Generate Changelog'}
                </Button>
              </div>
              <Textarea
                id="release-content"
                placeholder={"## New Features\n- Feature one\n\n## Bug Fixes\n- Fixed issue"}
                rows={12}
                className="font-mono text-sm"
                value={form.content}
                onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium">Publish (active)</span>
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(v) => { if (!v) setDeleteConfirmId(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Release</DialogTitle>
            <DialogDescription>Are you sure? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && deleteRelease(deleteConfirmId)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
