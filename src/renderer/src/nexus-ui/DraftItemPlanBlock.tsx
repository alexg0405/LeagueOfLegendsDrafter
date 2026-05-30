import type { DraftIntel } from '@shared/draft'

type DraftItemPlan = DraftIntel['matchupPlans'][number]['itemPlan']

type DraftItemPlanBlockProps = {
  itemPlan?: DraftItemPlan | null
  limit?: number
  className?: string
  labelClassName?: string
  noteClassName?: string
  separator?: string
}

export function DraftItemPlanBlock({
  itemPlan,
  limit = 3,
  className = 'mt-1.5 grid gap-0.5 text-nexus-muted/90',
  labelClassName = 'text-nexus-lime/80',
  noteClassName = 'text-nexus-muted/75',
  separator = ':'
}: DraftItemPlanBlockProps) {
  if (!itemPlan) {
    return null
  }
  const row = (label: string, line: string, key: string) => (
    <div key={key}>
      <span className={labelClassName}>{label}{separator}</span> {line}
    </div>
  )
  return (
    <div className={className}>
      {row('Core', itemPlan.core, 'core')}
      {row('Boots', itemPlan.boots, 'boots')}
      {row('Defense', itemPlan.defensive, 'defense')}
      {itemPlan.situational.slice(0, limit).map((line, idx) => row('Flex', line, `situational-${idx}`))}
      {itemPlan.notes.slice(0, 1).map((line, idx) => (
        <div key={`note-${idx}`} className={noteClassName}>
          {line}
        </div>
      ))}
    </div>
  )
}
