import { InboundEmailImporter } from '@/components/admin/inbound-email-importer'
import { requireRole } from '@/lib/auth'

export default async function AdminInboundEmailImportPage() {
  await requireRole(['admin', 'ops'])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inbound Email Import</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Paste email text and create a `tfs_inbound_emails` row without writing SQL.
        </p>
      </div>
      <InboundEmailImporter />
    </div>
  )
}
