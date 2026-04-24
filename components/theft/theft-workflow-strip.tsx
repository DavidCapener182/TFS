import { Archive, ClipboardList, Search, ShieldCheck, Store } from 'lucide-react'
import { WorkflowStrip } from '@/components/workspace/workflow-strip'

const steps = [
  { label: 'Store reported', icon: Store },
  { label: 'Triage', icon: ClipboardList },
  { label: 'Investigation', icon: Search },
  { label: 'Actions', icon: ShieldCheck },
  { label: 'Closed / logged', icon: Archive },
]

export function TheftWorkflowStrip() {
  return (
    <WorkflowStrip title="Store report to permanent theft log" steps={steps} />
  )
}
