package com.parallelcode.phone

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

// Obsidian dark palette: the desktop's default look (html[data-look='obsidian'] in src/styles.css).
// Flat charcoal neutrals with an amber accent; "needs you" uses the distinct orange warning.
val ColorBackgroundDark = Color(0xFF171717) // --bg
val ColorSurfaceDark = Color(0xFF1E1E1E) // --task-panel-bg
val ColorSurfaceVariantDark = Color(0xFF242424) // --bg-elevated
val ColorInputBgDark = Color(0xFF262626) // --bg-input
val ColorCardBgDark = Color(0xFF1E1E1E) // --island-bg
val ColorCardBgAttentionDark = Color(0xFF2F2825) // --warning 8% over --island-bg
val ColorBorderDark = Color(0xFF333333) // --border
val ColorBorderSubtleDark = Color(0xFF292929) // --border-subtle
val ColorAttentionBorderDark = Color(0xFF885C47) // --warning 50% over --island-bg
val ColorAttentionBgDark = Color(0x33F29B70)
val ColorWarningBannerBgDark = Color(0xFF372D28) // --warning 12% over --island-bg
val ColorWarningTextDark = Color(0xFFF29B70) // --warning
val ColorAccentAmber = Color(0xFFC4A77D) // --accent
val ColorOnAccentAmber = Color(0xFF1E1B16) // --accent-text
val ColorPrimaryContainerDark = Color(0xFF39342D) // --accent 16% over --island-bg
val ColorOnPrimaryContainerDark = Color(0xFFD6BD96) // --accent-hover
val ColorInfoGrey = Color(0xFFC9C9C9) // --info
val ColorInfoContainerDark = Color(0xFF303030) // --bg-hover
val ColorOnInfoContainerDark = Color(0xFFEDEDED)
val ColorSuccessGreen = Color(0xFF98C9AE) // --success
val ColorReviewPurple = Color(0xFFC1B0E8) // --review
val ColorErrorRed = Color(0xFFEAA0AA) // --error
val ColorErrorContainerDark = Color(0xFF362E2F) // --error 12% over --island-bg
val ColorOnErrorContainerDark = Color(0xFFF5C6CC)
val ColorTextPrimaryDark = Color(0xFFEDEDED) // --fg
val ColorTextMutedDark = Color(0xFFB5B5B5) // --fg-muted
val ColorTextSubtleDark = Color(0xFF919191) // --fg-subtle

@Immutable
data class ExtendedColors(
    /** The app's own dark/light choice, which can differ from the phone's. */
    val dark: Boolean,
    val border: Color,
    val borderSubtle: Color,
    val inputBg: Color,
    val cardBg: Color,
    val cardBgAttention: Color,
    val attentionBorder: Color,
    val attentionBg: Color,
    val warningBannerBg: Color,
    val warningText: Color,
    val success: Color,
    val review: Color,
    val textPrimary: Color,
    val textMuted: Color,
    val textSubtle: Color,
)

val DarkExtendedColors = ExtendedColors(
    dark = true,
    border = ColorBorderDark,
    borderSubtle = ColorBorderSubtleDark,
    inputBg = ColorInputBgDark,
    cardBg = ColorCardBgDark,
    cardBgAttention = ColorCardBgAttentionDark,
    attentionBorder = ColorAttentionBorderDark,
    attentionBg = ColorAttentionBgDark,
    warningBannerBg = ColorWarningBannerBgDark,
    warningText = ColorWarningTextDark,
    success = ColorSuccessGreen,
    review = ColorReviewPurple,
    textPrimary = ColorTextPrimaryDark,
    textMuted = ColorTextMutedDark,
    textSubtle = ColorTextSubtleDark,
)

// Obsidian Light palette: html[data-look='obsidian-light'] in src/styles.css. Warm paper neutrals,
// bronze accent; status hues darkened for AA contrast on white.
val LightExtendedColors = ExtendedColors(
    dark = false,
    border = Color(0xFFDDDCD8), // --border
    borderSubtle = Color(0xFFE9E8E4), // --border-subtle
    inputBg = Color(0xFFF2F2F0), // --bg-input
    cardBg = Color(0xFFFFFFFF), // --island-bg
    cardBgAttention = Color(0xFFFBF3ED), // --warning 6% over white
    attentionBorder = Color(0xFFD9A57F), // --warning 45% over white
    attentionBg = Color(0x22AD4E00),
    warningBannerBg = Color(0xFFFAEFE6), // --warning 10% over white
    warningText = Color(0xFFAD4E00), // --warning
    success = Color(0xFF2F7D4F), // --success
    review = Color(0xFF6D4FC2), // --review
    textPrimary = Color(0xFF1F1F1F), // --fg
    textMuted = Color(0xFF555555), // --fg-muted
    textSubtle = Color(0xFF6E6E6E), // --fg-subtle
)

val LocalExtendedColors = staticCompositionLocalOf { DarkExtendedColors }

val ParallelCodeDarkColorScheme = darkColorScheme(
    primary = ColorAccentAmber,
    onPrimary = ColorOnAccentAmber,
    primaryContainer = ColorPrimaryContainerDark,
    onPrimaryContainer = ColorOnPrimaryContainerDark,
    secondary = ColorInfoGrey,
    onSecondary = ColorBackgroundDark,
    secondaryContainer = ColorInfoContainerDark,
    onSecondaryContainer = ColorOnInfoContainerDark,
    tertiary = ColorReviewPurple,
    onTertiary = Color(0xFF231A38),
    background = ColorBackgroundDark,
    onBackground = ColorTextPrimaryDark,
    surface = ColorSurfaceDark,
    onSurface = ColorTextPrimaryDark,
    surfaceVariant = ColorSurfaceVariantDark,
    onSurfaceVariant = ColorTextMutedDark,
    outline = ColorBorderDark,
    outlineVariant = ColorBorderSubtleDark,
    error = ColorErrorRed,
    onError = Color(0xFF3A1519),
    errorContainer = ColorErrorContainerDark,
    onErrorContainer = ColorOnErrorContainerDark,
)

val ParallelCodeLightColorScheme = lightColorScheme(
    primary = Color(0xFF8A6433), // --accent
    onPrimary = Color.White, // --accent-text
    primaryContainer = Color(0xFFF1ECE6), // --accent 12% over white
    onPrimaryContainer = Color(0xFF75532A), // --accent-hover
    secondary = Color(0xFF5E5E5E), // --info
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFEBEBE8), // --bg-hover
    onSecondaryContainer = Color(0xFF1F1F1F),
    tertiary = Color(0xFF6D4FC2), // --review
    onTertiary = Color.White,
    background = Color(0xFFF4F4F2), // --bg
    onBackground = Color(0xFF1F1F1F),
    surface = Color(0xFFFFFFFF), // --bg-elevated
    onSurface = Color(0xFF1F1F1F),
    surfaceVariant = Color(0xFFEBEBE8),
    onSurfaceVariant = Color(0xFF555555),
    outline = Color(0xFFDDDCD8),
    outlineVariant = Color(0xFFE9E8E4),
    error = Color(0xFFB3383F), // --error
    onError = Color.White,
    errorContainer = Color(0xFFF7E9EA),
    onErrorContainer = Color(0xFF7D2328),
)

// Obsidian is square-edged in both variants: only small controls keep a slight rounding.
val ObsidianShapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = RoundedCornerShape(4.dp),
    medium = RoundedCornerShape(0.dp),
    large = RoundedCornerShape(0.dp),
    extraLarge = RoundedCornerShape(0.dp),
)

@Composable
fun ParallelCodeTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) ParallelCodeDarkColorScheme else ParallelCodeLightColorScheme
    val extendedColors = if (darkTheme) DarkExtendedColors else LightExtendedColors

    CompositionLocalProvider(LocalExtendedColors provides extendedColors) {
        MaterialTheme(
            colorScheme = colorScheme,
            shapes = ObsidianShapes,
            content = content,
        )
    }
}

object AppTheme {
    val extra: ExtendedColors
        @Composable
        get() = LocalExtendedColors.current
}
