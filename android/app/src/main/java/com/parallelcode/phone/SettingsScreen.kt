package com.parallelcode.phone

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    keepScreenOn: Boolean,
    onKeepScreenOnChange: (Boolean) -> Unit,
    keepScreenOnOnlyActive: Boolean,
    onKeepScreenOnOnlyActiveChange: (Boolean) -> Unit,
    themeMode: String,
    onThemeModeChange: (String) -> Unit,
    showMinimizedTasks: Boolean,
    onShowMinimizedTasksChange: (Boolean) -> Unit,
    latencyMs: Long?,
    state: ConnectionState,
    onPair: () -> Unit,
    onForget: () -> Unit,
    onBack: () -> Unit,
) {
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            Column {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                        titleContentColor = MaterialTheme.colorScheme.onSurface,
                        navigationIconContentColor = MaterialTheme.colorScheme.primary,
                    ),
                    navigationIcon = {
                        TextButton(onClick = onBack) {
                            Text("← Back", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
                        }
                    },
                    title = {
                        Text(
                            "Settings",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                        )
                    },
                )
                HorizontalDivider(thickness = 1.dp, color = AppTheme.extra.border)
            }
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            // DISPLAY SECTION
            item {
                SectionHeader("DISPLAY")
                Spacer(Modifier.height(8.dp))
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, AppTheme.extra.border),
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Column(
                                modifier = Modifier
                                    .weight(1f)
                                    .padding(end = 16.dp),
                            ) {
                                Text(
                                    "Keep screen awake",
                                    style = MaterialTheme.typography.bodyLarge,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MaterialTheme.colorScheme.onSurface,
                                )
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    "Prevent the display from sleeping while Parallel Code is open.",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = AppTheme.extra.textMuted,
                                )
                            }
                            Switch(
                                checked = keepScreenOn,
                                onCheckedChange = onKeepScreenOnChange,
                                colors = SwitchDefaults.colors(
                                    checkedThumbColor = MaterialTheme.colorScheme.onPrimary,
                                    checkedTrackColor = MaterialTheme.colorScheme.primary,
                                    uncheckedThumbColor = AppTheme.extra.textMuted,
                                    uncheckedTrackColor = AppTheme.extra.inputBg,
                                    uncheckedBorderColor = AppTheme.extra.border,
                                ),
                            )
                        }

                        AnimatedVisibility(
                            visible = keepScreenOn,
                            enter = expandVertically(animationSpec = tween(280, easing = FastOutSlowInEasing)) + fadeIn(tween(220)),
                            exit = shrinkVertically(animationSpec = tween(240, easing = FastOutSlowInEasing)) + fadeOut(tween(180)),
                        ) {
                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                verticalArrangement = Arrangement.spacedBy(14.dp),
                            ) {
                                HorizontalDivider(thickness = 1.dp, color = AppTheme.extra.borderSubtle)
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Column(
                                        modifier = Modifier
                                            .weight(1f)
                                            .padding(end = 16.dp),
                                    ) {
                                        Text(
                                            "Only while tasks are active",
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = FontWeight.Medium,
                                            color = MaterialTheme.colorScheme.onSurface,
                                        )
                                        Spacer(Modifier.height(2.dp))
                                        Text(
                                            "Allow screen to sleep when all agents finish or are idle.",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = AppTheme.extra.textMuted,
                                        )
                                    }
                                    Switch(
                                        checked = keepScreenOnOnlyActive,
                                        onCheckedChange = onKeepScreenOnOnlyActiveChange,
                                        colors = SwitchDefaults.colors(
                                            checkedThumbColor = MaterialTheme.colorScheme.onPrimary,
                                            checkedTrackColor = MaterialTheme.colorScheme.primary,
                                            uncheckedThumbColor = AppTheme.extra.textMuted,
                                            uncheckedTrackColor = AppTheme.extra.inputBg,
                                            uncheckedBorderColor = AppTheme.extra.border,
                                        ),
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // APPEARANCE SECTION
            item {
                SectionHeader("APPEARANCE")
                Spacer(Modifier.height(8.dp))
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, AppTheme.extra.border),
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 8.dp, vertical = 6.dp),
                    ) {
                        ThemeOptionRow(
                            title = "Follow system",
                            subtitle = "Match Android device theme settings",
                            selected = themeMode == SettingsStore.THEME_SYSTEM,
                            onClick = { onThemeModeChange(SettingsStore.THEME_SYSTEM) },
                        )
                        HorizontalDivider(thickness = 1.dp, color = AppTheme.extra.borderSubtle, modifier = Modifier.padding(horizontal = 8.dp))
                        ThemeOptionRow(
                            title = "Deep Space Dark",
                            subtitle = "Signature obsidian and cyan theme",
                            selected = themeMode == SettingsStore.THEME_DARK,
                            onClick = { onThemeModeChange(SettingsStore.THEME_DARK) },
                        )
                        HorizontalDivider(thickness = 1.dp, color = AppTheme.extra.borderSubtle, modifier = Modifier.padding(horizontal = 8.dp))
                        ThemeOptionRow(
                            title = "Light",
                            subtitle = "Clean high-contrast daytime theme",
                            selected = themeMode == SettingsStore.THEME_LIGHT,
                            onClick = { onThemeModeChange(SettingsStore.THEME_LIGHT) },
                        )
                    }
                }
            }

            // TASKS SECTION
            item {
                SectionHeader("TASKS")
                Spacer(Modifier.height(8.dp))
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, AppTheme.extra.border),
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Column(
                                modifier = Modifier
                                    .weight(1f)
                                    .padding(end = 16.dp),
                            ) {
                                Text(
                                    "Show minimized tasks",
                                    style = MaterialTheme.typography.bodyLarge,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MaterialTheme.colorScheme.onSurface,
                                )
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    "Pin collapsed and minimized tasks to the bottom of the overview.",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = AppTheme.extra.textMuted,
                                )
                            }
                            Switch(
                                checked = showMinimizedTasks,
                                onCheckedChange = onShowMinimizedTasksChange,
                                colors = SwitchDefaults.colors(
                                    checkedThumbColor = MaterialTheme.colorScheme.onPrimary,
                                    checkedTrackColor = MaterialTheme.colorScheme.primary,
                                    uncheckedThumbColor = AppTheme.extra.textMuted,
                                    uncheckedTrackColor = AppTheme.extra.inputBg,
                                    uncheckedBorderColor = AppTheme.extra.border,
                                ),
                            )
                        }
                    }
                }
            }

            // DESKTOP CONNECTION SECTION
            item {
                SectionHeader("DESKTOP CONNECTION")
                Spacer(Modifier.height(8.dp))
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, AppTheme.extra.border),
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        val host = state.link?.baseUrl ?: "Not connected"
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text("Computer", style = MaterialTheme.typography.bodyMedium, color = AppTheme.extra.textMuted)
                            Text(
                                host.substringAfter("://"),
                                style = MaterialTheme.typography.bodyMedium,
                                fontFamily = FontFamily.Monospace,
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                        }

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text("Status", style = MaterialTheme.typography.bodyMedium, color = AppTheme.extra.textMuted)
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Box(
                                    modifier = Modifier
                                        .size(8.dp)
                                        .clip(CircleShape)
                                        .background(if (state.status == ConnectionStatus.CONNECTED) AppTheme.extra.success else AppTheme.extra.textMuted),
                                )
                                Text(
                                    statusLabel(state),
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Medium,
                                    color = if (state.status == ConnectionStatus.CONNECTED) AppTheme.extra.success else AppTheme.extra.textMuted,
                                )
                            }
                        }

                        if (state.status == ConnectionStatus.CONNECTED) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Text("Latency", style = MaterialTheme.typography.bodyMedium, color = AppTheme.extra.textMuted)
                                Text(
                                    latencyMs?.let { "${it} ms" } ?: "< 10 ms",
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontFamily = FontFamily.Monospace,
                                    fontWeight = FontWeight.Medium,
                                    color = AppTheme.extra.textPrimary,
                                )
                            }
                        }

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text("Permissions", style = MaterialTheme.typography.bodyMedium, color = AppTheme.extra.textMuted)
                            Text(
                                if (state.canControl) "Full control (paired)" else "View only",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Medium,
                                color = if (state.canControl) MaterialTheme.colorScheme.primary else AppTheme.extra.textMuted,
                            )
                        }

                        if (!state.canControl && state.status == ConnectionStatus.CONNECTED) {
                            Button(
                                onClick = onPair,
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(8.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.primary,
                                    contentColor = MaterialTheme.colorScheme.onPrimary,
                                ),
                            ) {
                                Text("Pair with PIN to enable replies", fontWeight = FontWeight.SemiBold)
                            }
                        }

                        HorizontalDivider(thickness = 1.dp, color = AppTheme.extra.border)

                        OutlinedButton(
                            onClick = onForget,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(8.dp),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.5f)),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                        ) {
                            Text("Forget this computer", fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }

            // ABOUT SECTION
            item {
                SectionHeader("ABOUT")
                Spacer(Modifier.height(8.dp))
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, AppTheme.extra.border),
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text("Parallel Code", fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
                            Text("v3.1.0", color = AppTheme.extra.textMuted, fontFamily = FontFamily.Monospace)
                        }
                        Text(
                            "Mobile companion for monitoring and interacting with parallel AI agents.",
                            style = MaterialTheme.typography.bodySmall,
                            color = AppTheme.extra.textMuted,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ThemeOptionRow(
    title: String,
    subtitle: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(
            selected = selected,
            onClick = null,
            colors = RadioButtonDefaults.colors(
                selectedColor = MaterialTheme.colorScheme.primary,
                unselectedColor = AppTheme.extra.textMuted,
            ),
        )
        Column(modifier = Modifier.padding(start = 10.dp)) {
            Text(
                title,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = AppTheme.extra.textMuted,
            )
        }
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.Bold,
        letterSpacing = 1.sp,
        color = AppTheme.extra.textMuted,
        modifier = Modifier.padding(start = 4.dp),
    )
}
