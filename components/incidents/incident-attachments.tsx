'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { format } from 'date-fns'
import { Upload } from 'lucide-react'
import { uploadAttachment } from '@/app/actions/attachments'

interface IncidentAttachmentsProps {
  incidentId: string
  attachments: any[]
}

export function IncidentAttachments({ incidentId, attachments }: IncidentAttachmentsProps) {
  const [isUploading, setIsUploading] = useState(false)
  const router = useRouter()

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setIsUploading(true)
    try {
      for (const file of Array.from(files)) {
        await uploadAttachment('incident', incidentId, file)
      }
      router.refresh()
    } catch (error) {
      console.error('Failed to upload attachment:', error)
      alert('Failed to upload one or more files. Please try again.')
    } finally {
      setIsUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Attachments</CardTitle>
            <div>
              <input
                type="file"
                id="file-upload"
                className="hidden"
                multiple
                onChange={handleFileUpload}
              />
              <Button asChild disabled={isUploading}>
                <label htmlFor="file-upload" className="cursor-pointer">
                  <Upload className="h-4 w-4 mr-2" />
                  {isUploading ? 'Uploading...' : 'Upload Evidence'}
                </label>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {attachments.length === 0 ? (
            <p className="text-muted-foreground">No attachments uploaded yet.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Uploaded By</TableHead>
                    <TableHead>Uploaded At</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attachments.map((attachment) => (
                    <TableRow key={attachment.id}>
                      <TableCell className="font-medium">{attachment.file_name}</TableCell>
                      <TableCell>{attachment.file_type}</TableCell>
                      <TableCell>{(attachment.file_size / 1024).toFixed(2)} KB</TableCell>
                      <TableCell>{attachment.uploaded_by?.full_name || 'Unknown'}</TableCell>
                      <TableCell>{format(new Date(attachment.created_at), 'dd MMM yyyy HH:mm')}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <a href={`/api/attachments/${attachment.id}/download`} target="_blank" rel="noopener noreferrer">
                            Download
                          </a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

