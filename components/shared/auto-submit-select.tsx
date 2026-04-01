'use client'

type SelectOption = {
  value: string
  label: string
}

interface AutoSubmitSelectProps {
  name: string
  defaultValue: string
  options: SelectOption[]
  className?: string
}

export function AutoSubmitSelect({ name, defaultValue, options, className }: AutoSubmitSelectProps) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      className={className}
      onChange={(event) => {
        const form = event.currentTarget.form
        if (!form) return
        form.requestSubmit()
      }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
