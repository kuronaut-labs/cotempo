import type { ComponentProps } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'destructive']
const SIZES: ButtonSize[] = ['sm', 'md', 'lg']

export function buttonClass(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
  extra = '',
) {
  const v = VARIANTS.includes(variant) ? variant : 'secondary'
  const s = SIZES.includes(size) ? size : 'md'
  return ['btn', `btn--${v}`, `btn--${s}`, extra].filter(Boolean).join(' ')
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />
}
