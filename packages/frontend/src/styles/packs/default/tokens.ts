import {defaultColors} from "./colors";
import {defaultEffects} from "./effects";
import {defaultTypography} from "./typography";
import {defaultVisualization} from "./visualization";

export const defaultTokens = {
    "--color-background": defaultColors.background,
    "--color-background-muted": defaultColors.backgroundMuted,

    "--color-surface": defaultColors.surface,
    "--color-surface-elevated": defaultColors.surfaceElevated,
    "--color-surface-inset": defaultColors.surfaceInset,

    "--color-border": defaultColors.border,
    "--color-border-muted": defaultColors.borderMuted,
    "--color-border-strong": defaultColors.borderStrong,

    "--color-text-primary": defaultColors.textPrimary,
    "--color-text-secondary": defaultColors.textSecondary,
    "--color-text-muted": defaultColors.textMuted,
    "--color-text-inverse": defaultColors.textInverse,

    "--color-accent-primary": defaultColors.accentPrimary,
    "--color-accent-secondary": defaultColors.accentSecondary,
    "--color-accent-tertiary": defaultColors.accentTertiary,

    "--color-success": defaultColors.success,
    "--color-warning": defaultColors.warning,
    "--color-danger": defaultColors.danger,
    "--color-info": defaultColors.info,

    "--color-grid": defaultColors.grid,
    "--color-grid-strong": defaultColors.gridStrong,

    "--color-shadow": defaultColors.shadow,
    "--color-glow": defaultColors.glow,
    "--color-glow-soft": defaultColors.glowSoft,

    "--font-family-body": defaultTypography.fontFamily.body,
    "--font-family-heading": defaultTypography.fontFamily.heading,
    "--font-family-mono": defaultTypography.fontFamily.mono,

    "--font-size-xs": defaultTypography.fontSize.xs,
    "--font-size-sm": defaultTypography.fontSize.sm,
    "--font-size-md": defaultTypography.fontSize.md,
    "--font-size-lg": defaultTypography.fontSize.lg,
    "--font-size-xl": defaultTypography.fontSize.xl,
    "--font-size-xxl": defaultTypography.fontSize.xxl,
    "--font-size-display": defaultTypography.fontSize.display,

    "--font-weight-regular": defaultTypography.fontWeight.regular,
    "--font-weight-medium": defaultTypography.fontWeight.medium,
    "--font-weight-semibold": defaultTypography.fontWeight.semibold,
    "--font-weight-bold": defaultTypography.fontWeight.bold,

    "--line-height-tight": defaultTypography.lineHeight.tight,
    "--line-height-heading": defaultTypography.lineHeight.heading,
    "--line-height-body": defaultTypography.lineHeight.body,
    "--line-height-relaxed": defaultTypography.lineHeight.relaxed,
    "--line-height-mono": defaultTypography.lineHeight.mono,

    "--letter-spacing-tight": defaultTypography.letterSpacing.tight,
    "--letter-spacing-normal": defaultTypography.letterSpacing.normal,
    "--letter-spacing-wide": defaultTypography.letterSpacing.wide,
    "--letter-spacing-label": defaultTypography.letterSpacing.label,

    "--effect-shadow-panel": defaultEffects.shadow.panel,
    "--effect-shadow-elevated": defaultEffects.shadow.elevated,
    "--effect-shadow-inset": defaultEffects.shadow.inset,
    "--effect-shadow-text": defaultEffects.shadow.text,

    "--effect-opacity-disabled": defaultEffects.opacity.disabled,
    "--effect-opacity-muted": defaultEffects.opacity.muted,
    "--effect-opacity-overlay": defaultEffects.opacity.overlay,
    "--effect-opacity-glass": defaultEffects.opacity.glass,
    "--effect-opacity-solid": defaultEffects.opacity.solid,

    "--effect-blur-panel": defaultEffects.blur.panel,
    "--effect-blur-overlay": defaultEffects.blur.overlay,
    "--effect-blur-backdrop": defaultEffects.blur.backdrop,

    "--effect-transition-fast": defaultEffects.transition.fast,
    "--effect-transition-standard": defaultEffects.transition.standard,
    "--effect-transition-slow": defaultEffects.transition.slow,
    "--effect-transition-diagnostic": defaultEffects.transition.diagnostic,

    "--motion-hover-lift": defaultEffects.motion.hoverLift,
    "--motion-press": defaultEffects.motion.press,
    "--motion-panel-enter": defaultEffects.motion.panelEnter,
    "--motion-scanline-duration": defaultEffects.motion.scanlineDuration,
    "--motion-pulse-duration": defaultEffects.motion.pulseDuration,

    "--viz-particle-primary": defaultVisualization.particle.primary,
    "--viz-particle-secondary": defaultVisualization.particle.secondary,
    "--viz-particle-neutral": defaultVisualization.particle.neutral,
    "--viz-particle-charged": defaultVisualization.particle.charged,
    "--viz-particle-photon": defaultVisualization.particle.photon,
    "--viz-particle-neutron": defaultVisualization.particle.neutron,
    "--viz-particle-electron": defaultVisualization.particle.electron,
    "--viz-particle-warning": defaultVisualization.particle.warning,

    "--viz-track-default": defaultVisualization.tracks.default,
    "--viz-track-selected": defaultVisualization.tracks.selected,
    "--viz-track-faded": defaultVisualization.tracks.faded,
    "--viz-track-collision": defaultVisualization.tracks.collision,
    "--viz-track-absorption": defaultVisualization.tracks.absorption,
    "--viz-track-scattering": defaultVisualization.tracks.scattering,

    "--viz-heatmap-low": defaultVisualization.heatmap.low,
    "--viz-heatmap-low-mid": defaultVisualization.heatmap.lowMid,
    "--viz-heatmap-mid": defaultVisualization.heatmap.mid,
    "--viz-heatmap-high-mid": defaultVisualization.heatmap.highMid,
    "--viz-heatmap-high": defaultVisualization.heatmap.high,

    "--viz-dose-low": defaultVisualization.dose.low,
    "--viz-dose-moderate": defaultVisualization.dose.moderate,
    "--viz-dose-elevated": defaultVisualization.dose.elevated,
    "--viz-dose-high": defaultVisualization.dose.high,
    "--viz-dose-critical": defaultVisualization.dose.critical,

    "--viz-vector-streamline": defaultVisualization.vectorField.streamline,
    "--viz-vector-streamline-muted": defaultVisualization.vectorField.streamlineMuted,
    "--viz-vector-glyph": defaultVisualization.vectorField.glyph,
    "--viz-vector-glyph-selected": defaultVisualization.vectorField.glyphSelected,
    "--viz-vector-curl": defaultVisualization.vectorField.curl,
    "--viz-vector-divergence": defaultVisualization.vectorField.divergence,

    "--viz-geometry-surface": defaultVisualization.geometry.surface,
    "--viz-geometry-surface-selected": defaultVisualization.geometry.surfaceSelected,
    "--viz-geometry-surface-wireframe": defaultVisualization.geometry.surfaceWireframe,
    "--viz-geometry-region": defaultVisualization.geometry.region,
    "--viz-geometry-region-selected": defaultVisualization.geometry.regionSelected,
    "--viz-geometry-boundary": defaultVisualization.geometry.boundary,

    "--viz-tally-histogram": defaultVisualization.tally.histogram,
    "--viz-tally-line": defaultVisualization.tally.line,
    "--viz-tally-area": defaultVisualization.tally.area,
    "--viz-tally-uncertainty": defaultVisualization.tally.uncertainty,

    "--viz-grid-major": defaultVisualization.grid.major,
    "--viz-grid-minor": defaultVisualization.grid.minor,
    "--viz-grid-axis-x": defaultVisualization.grid.axisX,
    "--viz-grid-axis-y": defaultVisualization.grid.axisY,
    "--viz-grid-axis-z": defaultVisualization.grid.axisZ,
} as const;

export type DefaultTokens = typeof defaultTokens;
export type DefaultTokenName = keyof DefaultTokens;