/** M9a client PO tracker helpers. */

export type ClientPoStatus = 'open' | 'partial' | 'fulfilled' | 'canceled'

export function clientPoIsOpen(status: ClientPoStatus | string): boolean {
  return status === 'open' || status === 'partial'
}

export function clientPoSummary(input: {
  poNumber: string
  accountName: string
  amount: number
  currency: string
  status: string
}): string {
  return `${input.accountName} PO ${input.poNumber}: ${input.amount} ${input.currency} (${input.status})`
}
