/** Thrown when an Edge Function answers 404 (not deployed) or cannot be reached. */
export class FunctionNotDeployedError extends Error {
  readonly functionName: string
  constructor(functionName: string) {
    super(`The ${functionName} function is not deployed. Deploy it from Actions, Deploy Edge Functions, if you need it.`)
    this.name = 'FunctionNotDeployedError'
    this.functionName = functionName
  }
}

export function isNotDeployed(e: unknown): e is FunctionNotDeployedError {
  return e instanceof FunctionNotDeployedError
}
