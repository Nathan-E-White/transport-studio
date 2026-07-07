import {livermoreColors} from "./colors";
import {livermoreEffects} from "./effects";
import {livermoreTypography} from "./typography";
import {livermoreVisualization} from "./visualization";

export const livermoreTokens = {
    "--color-background": livermoreColors.background,
    "--color-background-muted": livermoreColors.backgroundMuted,

    "--color-surface": livermoreColors.surface,
    "--color-surface-elevated": livermoreColors.surfaceElevated,
    "--color-surface-inset": livermoreColors.surfaceInset,

    "--color-border": livermoreColors.border,
    "--color-border-muted": livermoreColors.borderMuted,
    "--color-border-strong": livermoreColors.borderStrong,

    "--color-text-primary": livermoreColors.textPrimary,
    "--color-text-secondary": livermoreColors.textSecondary,
    "--color-text-muted": livermoreColors.textMuted,
    "--color-text-inverse": livermoreColors.textInverse,

    "--color-accent-primary": livermoreColors.accentPrimary,
    "--color-accent-secondary": livermoreColors.accentSecondary,
    "--color-accent-tertiary": livermoreColors.accentTertiary,

    "--color-success": livermoreColors.success,
    "--color-warning": livermoreColors.warning,
    "--color-danger": livermoreColors.danger,
    "--color-info": livermoreColors.info,

    "--color-grid": livermoreColors.grid,
    "--color-grid-strong": livermoreColors.gridStrong,

    "--color-shadow": livermoreColors.shadow,
    "--color-glow": livermoreColors.glow,
    "--color-glow-soft": livermoreColors.glowSoft,

    "--font-family-body": livermoreTypography.fontFamily.body,
    "--font-family-heading": livermoreTypography.fontFamily.heading,
    "--font-family-mono": livermoreTypography.fontFamily.mono,

    "--font-size-xs": livermoreTypography.fontSize.xs,
    "--font-size-sm": livermoreTypography.fontSize.sm,
    "--font-size-md": livermoreTypography.fontSize.md,
    "--font-size-lg": livermoreTypography.fontSize.lg,
    "--font-size-xl": livermoreTypography.fontSize.xl,
    "--font-size-xxl": livermoreTypography.fontSize.xxl,
    "--font-size-display": livermoreTypography.fontSize.display,

    "--font-weight-regular": livermoreTypography.fontWeight.regular,
    "--font-weight-medium": livermoreTypography.fontWeight.medium,
    "--font-weight-semibold": livermoreTypography.fontWeight.semibold,
    "--font-weight-bold": livermoreTypography.fontWeight.bold,

    "--line-height-tight": livermoreTypography.lineHeight.tight,
    "--line-height-heading": livermoreTypography.lineHeight.heading,
    "--line-height-body": livermoreTypography.lineHeight.body,
    "--line-height-relaxed": livermoreTypography.lineHeight.relaxed,
    "--line-height-mono": livermoreTypography.lineHeight.mono,

    "--letter-spacing-tight": livermoreTypography.letterSpacing.tight,
    "--letter-spacing-normal": livermoreTypography.letterSpacing.normal,
    "--letter-spacing-wide": livermoreTypography.letterSpacing.wide,
    "--letter-spacing-label": livermoreTypography.letterSpacing.label,

    "--effect-shadow-panel": livermoreEffects.shadow.panel,
    "--effect-shadow-elevated": livermoreEffects.shadow.elevated,
    "--effect-shadow-inset": livermoreEffects.shadow.inset,
    "--effect-shadow-text": livermoreEffects.shadow.text,

    "--effect-opacity-disabled": livermoreEffects.opacity.disabled,
    "--effect-opacity-muted": livermoreEffects.opacity.muted,
    "--effect-opacity-overlay": livermoreEffects.opacity.overlay,
    "--effect-opacity-glass": livermoreEffects.opacity.glass,
    "--effect-opacity-solid": livermoreEffects.opacity.solid,

    "--effect-blur-panel": livermoreEffects.blur.panel,
    "--effect-blur-overlay": livermoreEffects.blur.overlay,
    "--effect-blur-backdrop": livermoreEffects.blur.backdrop,

    "--effect-transition-fast": livermoreEffects.transition.fast,
    "--effect-transition-standard": livermoreEffects.transition.standard,
    "--effect-transition-slow": livermoreEffects.transition.slow,
    "--effect-transition-diagnostic": livermoreEffects.transition.diagnostic,

    "--motion-hover-lift": livermoreEffects.motion.hoverLift,
    "--motion-press": livermoreEffects.motion.press,
    "--motion-panel-enter": livermoreEffects.motion.panelEnter,
    "--motion-scanline-duration": livermoreEffects.motion.scanlineDuration,
    "--motion-pulse-duration": livermoreEffects.motion.pulseDuration,

    "--viz-particle-primary": livermoreVisualization.particle.primary,
    "--viz-particle-secondary": livermoreVisualization.particle.secondary,
    "--viz-particle-neutral": livermoreVisualization.particle.neutral,
    "--viz-particle-charged": livermoreVisualization.particle.charged,
    "--viz-particle-photon": livermoreVisualization.particle.photon,
    "--viz-particle-neutron": livermoreVisualization.particle.neutron,
    "--viz-particle-electron": livermoreVisualization.particle.electron,
    "--viz-particle-warning": livermoreVisualization.particle.warning,

    "--viz-track-default": livermoreVisualization.tracks.default,
    "--viz-track-selected": livermoreVisualization.tracks.selected,
    "--viz-track-faded": livermoreVisualization.tracks.faded,
    "--viz-track-collision": livermoreVisualization.tracks.collision,
    "--viz-track-absorption": livermoreVisualization.tracks.absorption,
    "--viz-track-scattering": livermoreVisualization.tracks.scattering,

    "--viz-heatmap-low": livermoreVisualization.heatmap.low,
    "--viz-heatmap-low-mid": livermoreVisualization.heatmap.lowMid,
    "--viz-heatmap-mid": livermoreVisualization.heatmap.mid,
    "--viz-heatmap-high-mid": livermoreVisualization.heatmap.highMid,
    "--viz-heatmap-high": livermoreVisualization.heatmap.high,

    "--viz-dose-low": livermoreVisualization.dose.low,
    "--viz-dose-moderate": livermoreVisualization.dose.moderate,
    "--viz-dose-elevated": livermoreVisualization.dose.elevated,
    "--viz-dose-high": livermoreVisualization.dose.high,
    "--viz-dose-critical": livermoreVisualization.dose.critical,

    "--viz-vector-streamline": livermoreVisualization.vectorField.streamline,
    "--viz-vector-streamline-muted": livermoreVisualization.vectorField.streamlineMuted,
    "--viz-vector-glyph": livermoreVisualization.vectorField.glyph,
    "--viz-vector-glyph-selected": livermoreVisualization.vectorField.glyphSelected,
    "--viz-vector-curl": livermoreVisualization.vectorField.curl,
    "--viz-vector-divergence": livermoreVisualization.vectorField.divergence,

    "--viz-geometry-surface": livermoreVisualization.geometry.surface,
    "--viz-geometry-surface-selected": livermoreVisualization.geometry.surfaceSelected,
    "--viz-geometry-surface-wireframe": livermoreVisualization.geometry.surfaceWireframe,
    "--viz-geometry-region": livermoreVisualization.geometry.region,
    "--viz-geometry-region-selected": livermoreVisualization.geometry.regionSelected,
    "--viz-geometry-boundary": livermoreVisualization.geometry.boundary,

    "--viz-tally-histogram": livermoreVisualization.tally.histogram,
    "--viz-tally-line": livermoreVisualization.tally.line,
    "--viz-tally-area": livermoreVisualization.tally.area,
    "--viz-tally-uncertainty": livermoreVisualization.tally.uncertainty,

    "--viz-grid-major": livermoreVisualization.grid.major,
    "--viz-grid-minor": livermoreVisualization.grid.minor,
    "--viz-grid-axis-x": livermoreVisualization.grid.axisX,
    "--viz-grid-axis-y": livermoreVisualization.grid.axisY,
    "--viz-grid-axis-z": livermoreVisualization.grid.axisZ,
} as const;

export type LivermoreTokens = typeof livermoreTokens;
export type LivermoreTokenName = keyof LivermoreTokens;