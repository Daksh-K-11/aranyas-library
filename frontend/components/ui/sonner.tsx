'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { useIsMobile } from '@/hooks/use-mobile'

const Toaster = ({ position = 'top-center', swipeDirections, ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme()
  const isMobile = useIsMobile()

  // On mobile screen, toasts come below (bottom-center); on desktop screen, default to top-center (or passed position)
  const effectivePosition = isMobile ? 'bottom-center' : position

  // Enable terminating/dismissing the toast by sliding it off in any direction (left, right, bottom, top)
  const effectiveSwipeDirections = swipeDirections ?? ['left', 'right', 'bottom', 'top']

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      position={effectivePosition}
      swipeDirections={effectiveSwipeDirections}
      mobileOffset={{
        bottom: 'max(1rem, env(safe-area-inset-bottom, 16px))',
        left: '1rem',
        right: '1rem',
        top: '1rem',
      }}
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }

