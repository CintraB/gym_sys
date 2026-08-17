/** Junta classes condicionais sem trazer uma dependência só para isso. */
export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}
