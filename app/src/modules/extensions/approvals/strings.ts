import type { ExtensionStrings } from '../types'

// Arabic drafted by Claude; needs a native speaker review before live use.
const strings: ExtensionStrings = {
  en: {
    'nav.module.approvals': 'Approvals',
    'nav.item.approvals': 'Approval queue',
    'page.approvals.title': 'Approvals',
    'page.approvals.subtitle': 'Four-eyes checks: the person who asks can never approve their own request.',
    'page.approvals.filter.pending': 'Waiting',
    'page.approvals.filter.all': 'All',
    'page.approvals.empty': 'Nothing waiting for a decision.',
    'page.approvals.approve': 'Approve',
    'page.approvals.reject': 'Reject',
    'page.approvals.cancel': 'Withdraw',
    'page.approvals.reason': 'Reason (needed to reject)',
    'page.approvals.ownRequest': 'Your request: someone else must decide.',
    'page.approvals.policies': 'Rules: which actions need a second person',
    'page.approvals.policy.minAmount': 'From amount',
    'page.approvals.policy.always': 'Always',
    'page.approvals.status.pending': 'Waiting',
    'page.approvals.status.approved': 'Approved',
    'page.approvals.status.rejected': 'Rejected',
    'page.approvals.status.cancelled': 'Withdrawn',
  },
  ar: {
    'nav.module.approvals': 'الموافقات',
    'nav.item.approvals': 'قائمة الموافقات',
    'page.approvals.title': 'الموافقات',
    'page.approvals.subtitle': 'مبدأ الأربع عيون: لا يمكن لمقدم الطلب الموافقة على طلبه.',
    'page.approvals.filter.pending': 'بانتظار القرار',
    'page.approvals.filter.all': 'الكل',
    'page.approvals.empty': 'لا توجد طلبات بانتظار القرار.',
    'page.approvals.approve': 'موافقة',
    'page.approvals.reject': 'رفض',
    'page.approvals.cancel': 'سحب الطلب',
    'page.approvals.reason': 'السبب (مطلوب عند الرفض)',
    'page.approvals.ownRequest': 'هذا طلبك: يجب أن يقرر شخص آخر.',
    'page.approvals.policies': 'القواعد: الإجراءات التي تحتاج إلى شخص ثانٍ',
    'page.approvals.policy.minAmount': 'ابتداءً من مبلغ',
    'page.approvals.policy.always': 'دائماً',
    'page.approvals.status.pending': 'بانتظار القرار',
    'page.approvals.status.approved': 'تمت الموافقة',
    'page.approvals.status.rejected': 'مرفوض',
    'page.approvals.status.cancelled': 'مسحوب',
  },
}

export default strings
