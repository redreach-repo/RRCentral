import { Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import EmptyState from './EmptyState'

/** Shown instead of a page the signed-in person may not open (typed or bookmarked link). */
export default function NoAccessPage() {
  const navigate = useNavigate()
  return (
    <div role="alert">
      <EmptyState
        icon={<Lock size={24} aria-hidden />}
        title="You do not have access to this page"
        subtitle="Ask an admin if you need it for your work."
        actionLabel="Go to Home"
        onAction={() => navigate('/app')}
      />
    </div>
  )
}
