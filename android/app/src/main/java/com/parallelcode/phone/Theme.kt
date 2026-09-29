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

// Deep Space dark palette matching Parallel Code desktop and phone web UI
val ColorBackgroundDark = Color(0xFF0B0F14)
val ColorSurfaceDark = Color(0xFF121A23)
val ColorSurfaceVariantDark = Color(0xFF1A2633)
val ColorInputBgDark = Color(0xFF101720)
val ColorCardBgDark = Color(0xFF101821)
val ColorCardBgAttentionDark = Color(0xFF1B1711)
val ColorBorderDark = Color(0xFF253443)
val ColorBorderSubtleDark = Color(0xFF1A2530)
val ColorAttentionBorderDark = Color(0xFF766037)
val ColorAttentionBgDark = Color(0x66241E12)
val ColorWarningBannerBgDark = Color(0xFF302711)
val ColorWarningTextDark = Color(0xFFFFDD98)
val ColorAccentCyan = Color(0xFF65D5FF)
val ColorOnAccentCyan = Color(0xFF06202D)
val ColorPrimaryContainerDark = Color(0xFF183344)
val ColorOnPrimaryContainerDark = Color(0xFFBDEAFF)
val ColorInfoBlue = Color(0xFF60A5FA)
val ColorInfoContainerDark = Color(0xFF132838)
val ColorOnInfoContainerDark = Color(0xFFB3E6FF)
val ColorSuccessTeal = Color(0xFF79E2B7)
val ColorReviewPurple = Color(0xFFC084FC)
val ColorErrorRed = Color(0xFFFF5F73)
val ColorErrorContainerDark = Color(0xFF311B23)
val ColorOnErrorContainerDark = Color(0xFFFFB0BB)
val ColorTextPrimaryDark = Color(0xFFE0EAF3)
val ColorTextMutedDark = Color(0xFF9BB0C3)
val ColorTextSubtleDark = Color(0xFF678197)

@Immutable
data class ExtendedColors(
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
    border = ColorBorderDark,
    borderSubtle = ColorBorderSubtleDark,
    inputBg = ColorInputBgDark,
    cardBg = ColorCardBgDark,
    cardBgAttention = ColorCardBgAttentionDark,
    attentionBorder = ColorAttentionBorderDark,
    attentionBg = ColorAttentionBgDark,
    warningBannerBg = ColorWarningBannerBgDark,
    warningText = ColorWarningTextDark,
    success = ColorSuccessTeal,
    review = ColorReviewPurple,
    textPrimary = ColorTextPrimaryDark,
    textMuted = ColorTextMutedDark,
    textSubtle = ColorTextSubtleDark,
)

val LightExtendedColors = ExtendedColors(
    border = Color(0xFFD0DCE7),
    borderSubtle = Color(0xFFE2EAF1),
    inputBg = Color(0xFFF7F9FB),
    cardBg = Color(0xFFFFFFFF),
    cardBgAttention = Color(0xFFFFF9EE),
    attentionBorder = Color(0xFFE0A030),
    attentionBg = Color(0x33FFE8B3),
    warningBannerBg = Color(0xFFFFF3D6),
    warningText = Color(0xFF7A4B00),
    success = Color(0xFF1B8754),
    review = Color(0xFF6F42C1),
    textPrimary = Color(0xFF151D26),
    textMuted = Color(0xFF53677A),
    textSubtle = Color(0xFF7F95A8),
)

val LocalExtendedColors = staticCompositionLocalOf { DarkExtendedColors }

val ParallelCodeDarkColorScheme = darkColorScheme(
    primary = ColorAccentCyan,
    onPrimary = ColorOnAccentCyan,
    primaryContainer = ColorPrimaryContainerDark,
    onPrimaryContainer = ColorOnPrimaryContainerDark,
    secondary = ColorInfoBlue,
    onSecondary = ColorOnAccentCyan,
    secondaryContainer = ColorInfoContainerDark,
    onSecondaryContainer = ColorOnInfoContainerDark,
    tertiary = ColorReviewPurple,
    onTertiary = Color(0xFF2E104D),
    background = ColorBackgroundDark,
    onBackground = ColorTextPrimaryDark,
    surface = ColorSurfaceDark,
    onSurface = ColorTextPrimaryDark,
    surfaceVariant = ColorSurfaceVariantDark,
    onSurfaceVariant = ColorTextMutedDark,
    outline = ColorBorderDark,
    outlineVariant = ColorBorderSubtleDark,
    error = ColorErrorRed,
    onError = Color(0xFF310B11),
    errorContainer = ColorErrorContainerDark,
    onErrorContainer = ColorOnErrorContainerDark,
)

val ParallelCodeLightColorScheme = lightColorScheme(
    primary = Color(0xFF007A9E),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD6F3FF),
    onPrimaryContainer = Color(0xFF003546),
    secondary = Color(0xFF0D6EFD),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFE3EFFF),
    onSecondaryContainer = Color(0xFF002966),
    tertiary = Color(0xFF8250DF),
    onTertiary = Color.White,
    background = Color(0xFFF4F6F9),
    onBackground = Color(0xFF151D26),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF151D26),
    surfaceVariant = Color(0xFFEAEFF5),
    onSurfaceVariant = Color(0xFF53677A),
    outline = Color(0xFFD0DCE7),
    outlineVariant = Color(0xFFE2EAF1),
    error = Color(0xFFCF222E),
    onError = Color.White,
    errorContainer = Color(0xFFFFECEE),
    onErrorContainer = Color(0xFF7A0010),
)

val ParallelCodeShapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(10.dp),
    large = RoundedCornerShape(12.dp),
    extraLarge = RoundedCornerShape(16.dp),
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
            shapes = ParallelCodeShapes,
            content = content,
        )
    }
}

object AppTheme {
    val extra: ExtendedColors
        @Composable
        get() = LocalExtendedColors.current
}
