package com.parallelcode.phone

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.ui.draw.clip
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import kotlinx.coroutines.delay
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import kotlinx.coroutines.launch
import java.io.IOException

private const val NOT_A_LINK = "That isn't a Parallel Code link. Open Connect Phone on your computer and try again."

@Composable
fun ConnectScreen(expired: Boolean, onLink: (ConnectionLink) -> Unit) {
    val context = LocalContext.current
    var pasted by rememberSaveable { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    fun accept(raw: String) {
        val link = ConnectionLink.parse(raw)
        if (link == null) error = NOT_A_LINK else onLink(link)
    }

    SetupPage(title = "Connect to your computer") {
        if (expired) {
            Surface(
                shape = RoundedCornerShape(10.dp),
                color = MaterialTheme.colorScheme.errorContainer,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.error),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    "This link no longer works. Your computer restarted Remote Access or disconnected this phone.",
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    modifier = Modifier.padding(12.dp),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
        Text(
            "On your computer, open Connect Phone and scan the QR code.",
            color = AppTheme.extra.textMuted,
            style = MaterialTheme.typography.bodyMedium,
        )
        Button(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
            ),
            onClick = {
                error = null
                val options = GmsBarcodeScannerOptions.Builder()
                    .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                    .build()
                GmsBarcodeScanning.getClient(context, options).startScan()
                    .addOnSuccessListener { accept(it.rawValue.orEmpty()) }
                    .addOnFailureListener { error = "The scanner isn't available. Paste the link instead." }
            },
        ) { Text("Scan QR code", fontWeight = FontWeight.SemiBold) }
        Text(
            "Or paste the link shown under the QR code:",
            style = MaterialTheme.typography.bodySmall,
            color = AppTheme.extra.textMuted,
        )
        OutlinedTextField(
            value = pasted,
            onValueChange = { pasted = it },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            placeholder = { Text("http://192.168.1.20:7777/?token=…") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = AppTheme.extra.inputBg,
                unfocusedContainerColor = AppTheme.extra.inputBg,
                focusedBorderColor = MaterialTheme.colorScheme.primary,
                unfocusedBorderColor = AppTheme.extra.border,
            ),
        )
        TextButton(onClick = { accept(pasted) }, enabled = pasted.isNotBlank()) {
            Text("Connect", fontWeight = FontWeight.SemiBold)
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    }
}

@Composable
fun PairScreen(pair: suspend (pin: String, remember: Boolean) -> Unit, onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    var pin by rememberSaveable { mutableStateOf("") }
    var remember by rememberSaveable { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    SetupPage(title = "Enable replies") {
        Text(
            "Enter the six-digit code from Connect Phone on your computer to send messages to agents.",
            color = AppTheme.extra.textMuted,
            style = MaterialTheme.typography.bodyMedium,
        )
        OutlinedTextField(
            value = pin,
            onValueChange = { pin = it.filter(Char::isDigit).take(6) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Code from your computer") },
            singleLine = true,
            enabled = !busy,
            textStyle = MaterialTheme.typography.headlineSmall.copy(fontFamily = FontFamily.Monospace),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = AppTheme.extra.inputBg,
                unfocusedContainerColor = AppTheme.extra.inputBg,
                focusedBorderColor = MaterialTheme.colorScheme.primary,
                unfocusedBorderColor = AppTheme.extra.border,
            ),
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Keep this phone authorized", fontWeight = FontWeight.Medium)
                Text(
                    "Stay paired after your computer restarts. Use only on a phone you trust.",
                    style = MaterialTheme.typography.bodySmall,
                    color = AppTheme.extra.textMuted,
                )
            }
            Switch(
                checked = remember,
                onCheckedChange = { remember = it },
                enabled = !busy,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = MaterialTheme.colorScheme.onPrimary,
                    checkedTrackColor = MaterialTheme.colorScheme.primary,
                ),
            )
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(
            modifier = Modifier.fillMaxWidth(),
            enabled = pin.length == 6 && !busy,
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
            ),
            onClick = {
                busy = true
                error = null
                scope.launch {
                    try {
                        pair(pin, remember)
                        onDone()
                    } catch (e: ApiException) {
                        error = e.message
                    } finally {
                        busy = false
                    }
                }
            },
        ) { Text(if (busy) "Authorizing…" else "Enable replies", fontWeight = FontWeight.SemiBold) }
        TextButton(modifier = Modifier.fillMaxWidth(), onClick = onDone, enabled = !busy) {
            Text("Continue viewing only")
        }
    }
}

@Composable
private fun SetupPage(title: String, content: @Composable () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background,
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        ) {
            Text(
                title,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground,
            )
            content()
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AgentsScreen(
    client: RemoteClient,
    host: String,
    state: ConnectionState,
    agents: List<RemoteAgent>,
    showMinimizedTasks: Boolean,
    onOpen: (RemoteAgent) -> Unit,
    onPair: () -> Unit,
    onNewTask: () -> Unit,
    onSettings: () -> Unit,
) {
    var refreshing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val activeAgents = remember(agents) { agents.filter { !it.collapsed } }
    val minimizedAgents = remember(agents) { agents.filter { it.collapsed } }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            Column {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                        titleContentColor = MaterialTheme.colorScheme.onSurface,
                        actionIconContentColor = MaterialTheme.colorScheme.primary,
                    ),
                    title = {
                        Column {
                            Text(
                                "Agents",
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                            )
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                val statusDotColor = when (state.status) {
                                    ConnectionStatus.CONNECTED -> AppTheme.extra.success
                                    ConnectionStatus.CONNECTING -> AppTheme.extra.warningText
                                    ConnectionStatus.DISCONNECTED -> MaterialTheme.colorScheme.error
                                }
                                val infiniteTransition = rememberInfiniteTransition(label = "connPulse")
                                val pulseAlpha by if (state.status == ConnectionStatus.CONNECTED) {
                                    infiniteTransition.animateFloat(
                                        initialValue = 0.45f,
                                        targetValue = 1f,
                                        animationSpec = infiniteRepeatable(
                                            animation = tween(1200, easing = FastOutSlowInEasing),
                                            repeatMode = RepeatMode.Reverse,
                                        ),
                                        label = "connDotAlpha",
                                    )
                                } else {
                                    remember { mutableFloatStateOf(1f) }
                                }
                                Box(
                                    Modifier
                                        .size(7.dp)
                                        .clip(CircleShape)
                                        .background(statusDotColor.copy(alpha = pulseAlpha)),
                                )
                                Text(
                                    "${statusLabel(state)} · ${host.substringAfter("://")}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = AppTheme.extra.textMuted,
                                )
                            }
                        }
                    },
                    actions = {
                        if (state.canControl) {
                            Button(
                                onClick = onNewTask,
                                shape = RoundedCornerShape(8.dp),
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.primary,
                                    contentColor = MaterialTheme.colorScheme.onPrimary,
                                ),
                                modifier = Modifier.padding(end = 4.dp),
                            ) {
                                Text("New task", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelLarge)
                            }
                        }
                        TextButton(onClick = onSettings) {
                            Text("Settings", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Medium)
                        }
                    },
                )
                HorizontalDivider(thickness = 1.dp, color = AppTheme.extra.border)
            }
        },
        bottomBar = {
            if (showMinimizedTasks && minimizedAgents.isNotEmpty()) {
                MinimizedTasksBottomBar(
                    minimizedAgents = minimizedAgents,
                    onOpen = onOpen,
                )
            }
        },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = {
                refreshing = true
                scope.launch {
                    client.reconnect()
                    delay(600)
                    refreshing = false
                }
            },
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            LazyColumn(
                Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                contentPadding = PaddingValues(vertical = 12.dp),
            ) {
                if (state.status == ConnectionStatus.CONNECTED && !state.canControl) {
                    item { PairBanner(onPair) }
                }
                if (state.status == ConnectionStatus.CONNECTED && activeAgents.isEmpty()) {
                    item {
                        Text(
                            if (showMinimizedTasks && minimizedAgents.isNotEmpty()) "No active agents running." else "No agents are running.",
                            Modifier.padding(24.dp),
                            color = AppTheme.extra.textMuted,
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    }
                }
                if (state.status != ConnectionStatus.CONNECTED && activeAgents.isEmpty() && (!showMinimizedTasks || minimizedAgents.isEmpty())) {
                    item {
                        Row(
                            Modifier.padding(24.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            CircularProgressIndicator(
                                Modifier.size(20.dp),
                                color = MaterialTheme.colorScheme.primary,
                                strokeWidth = 2.dp,
                            )
                            Spacer(Modifier.width(12.dp))
                            Text(
                                "Reaching your computer…",
                                color = AppTheme.extra.textMuted,
                            )
                        }
                    }
                }
                items(activeAgents, key = { it.agentId }) { agent ->
                    AgentCard(agent, onOpen, modifier = Modifier.animateItem())
                }
            }
        }
    }
}

@Composable
private fun MinimizedTasksBottomBar(
    minimizedAgents: List<RemoteAgent>,
    onOpen: (RemoteAgent) -> Unit,
    modifier: Modifier = Modifier,
) {
    var isExpanded by rememberSaveable { mutableStateOf(true) }
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, AppTheme.extra.border),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 8.dp),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { isExpanded = !isExpanded }
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(7.dp)
                            .clip(CircleShape)
                            .background(AppTheme.extra.textMuted),
                    )
                    Text(
                        "Minimized (${minimizedAgents.size})",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
                Text(
                    if (isExpanded) "Hide" else "Show",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            AnimatedVisibility(
                visible = isExpanded,
                enter = expandVertically(animationSpec = tween(220, easing = FastOutSlowInEasing)) + fadeIn(tween(180)),
                exit = shrinkVertically(animationSpec = tween(200, easing = FastOutSlowInEasing)) + fadeOut(tween(150)),
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    minimizedAgents.forEach { agent ->
                        MinimizedTaskCard(
                            agent = agent,
                            onClick = { onOpen(agent) },
                            single = minimizedAgents.size == 1,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MinimizedTaskCard(
    agent: RemoteAgent,
    onClick: () -> Unit,
    single: Boolean,
) {
    Card(
        modifier = Modifier
            .width(if (single) 260.dp else 220.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = AppTheme.extra.cardBg),
        border = BorderStroke(1.dp, AppTheme.extra.borderSubtle),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    text = agent.taskName,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = AppTheme.extra.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = "Minimized",
                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                    color = AppTheme.extra.textMuted,
                )
            }
            listOfNotNull(agent.projectName, agent.agentName).takeIf { it.isNotEmpty() }?.let {
                Text(
                    text = it.joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
                    color = AppTheme.extra.textMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (agent.lastLine.isNotBlank()) {
                Text(
                    text = agent.lastLine,
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp, lineHeight = 14.sp),
                    fontFamily = FontFamily.Monospace,
                    color = Color(0xFFB5C5D3),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun PairBanner(onPair: () -> Unit) {
    Card(
        modifier = Modifier.padding(horizontal = 16.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = AppTheme.extra.warningBannerBg),
        border = BorderStroke(1.dp, AppTheme.extra.attentionBorder),
    ) {
        Row(
            Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "View only. Pair to send replies.",
                Modifier.weight(1f),
                color = AppTheme.extra.warningText,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
            )
            Button(
                onClick = onPair,
                shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = AppTheme.extra.attentionBorder,
                    contentColor = AppTheme.extra.warningText,
                ),
            ) { Text("Pair", fontWeight = FontWeight.Bold) }
        }
    }
}

@Composable
private fun AgentCard(
    agent: RemoteAgent,
    onOpen: (RemoteAgent) -> Unit,
    modifier: Modifier = Modifier,
) {
    val isAttention = !agent.collapsed && (agent.attention == "needs_input" || agent.attention == "error")
    val attentionTransition = rememberInfiniteTransition(label = "attentionPulse")
    val attentionGlow by if (isAttention) {
        attentionTransition.animateFloat(
            initialValue = 0.45f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                animation = tween(900, easing = FastOutSlowInEasing),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "attentionGlow",
        )
    } else {
        remember { mutableFloatStateOf(1f) }
    }

    val cardBorderColor = if (isAttention) {
        if (agent.attention == "error") MaterialTheme.colorScheme.error.copy(alpha = attentionGlow)
        else AppTheme.extra.attentionBorder.copy(alpha = attentionGlow)
    } else {
        AppTheme.extra.border
    }
    val cardBg = if (isAttention) AppTheme.extra.cardBgAttention else AppTheme.extra.cardBg

    val (statusColor, statusText) = when {
        agent.collapsed -> Pair(AppTheme.extra.textMuted, "Minimized")
        !agent.running -> Pair(AppTheme.extra.textMuted, agent.exitCode?.let { "Exited ($it)" } ?: "Exited")
        agent.attention == "needs_input" -> Pair(AppTheme.extra.warningText, "Needs input")
        agent.attention == "error" -> Pair(MaterialTheme.colorScheme.error, "Error")
        agent.attention == "active" -> Pair(MaterialTheme.colorScheme.primary, "Working")
        agent.attention == "shell_busy" -> Pair(MaterialTheme.colorScheme.primary, "Running command")
        agent.attention == "ready" -> Pair(AppTheme.extra.success, "Ready")
        agent.attention == "review" -> Pair(AppTheme.extra.review, "Review")
        else -> Pair(AppTheme.extra.textMuted, "Idle")
    }

    val isWorking = !agent.collapsed && agent.running && (agent.attention == "active" || agent.attention == "shell_busy")
    val infiniteTransition = rememberInfiniteTransition(label = "agentWorkingPulse")
    val dotAlpha by if (isWorking) {
        infiniteTransition.animateFloat(
            initialValue = 0.35f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                animation = tween(800, easing = FastOutSlowInEasing),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "workingDotAlpha",
        )
    } else {
        remember { mutableFloatStateOf(1f) }
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .clickable(enabled = !agent.isChat) { onOpen(agent) },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = cardBg),
        border = BorderStroke(1.dp, cardBorderColor),
    ) {
        Column(
            Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    agent.taskName,
                    Modifier.weight(1f),
                    fontWeight = FontWeight.SemiBold,
                    style = MaterialTheme.typography.titleMedium,
                    color = AppTheme.extra.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = statusColor.copy(alpha = 0.12f),
                    border = BorderStroke(1.dp, statusColor.copy(alpha = 0.35f)),
                ) {
                    Row(
                        Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(5.dp),
                    ) {
                        Box(
                            Modifier
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(statusColor.copy(alpha = dotAlpha)),
                        )
                        Text(
                            statusText,
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = statusColor,
                        )
                    }
                }
            }
            listOfNotNull(agent.projectName, agent.agentName).takeIf { it.isNotEmpty() }?.let {
                Text(
                    it.joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = AppTheme.extra.textMuted,
                )
            }
            val detail = if (agent.isChat) "Built-in chat. Open it on your computer." else agent.lastLine
            if (detail.isNotBlank()) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(6.dp))
                        .background(MaterialTheme.colorScheme.background)
                        .border(BorderStroke(1.dp, AppTheme.extra.borderSubtle), RoundedCornerShape(6.dp))
                        .padding(horizontal = 10.dp, vertical = 7.dp),
                ) {
                    Text(
                        detail,
                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp, lineHeight = 16.sp),
                        fontFamily = FontFamily.Monospace,
                        color = Color(0xFFB5C5D3),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AgentScreen(
    agent: RemoteAgent?,
    agentId: String,
    state: ConnectionState,
    client: RemoteClient,
    onBack: () -> Unit,
    onPair: () -> Unit,
) {
    val buffer = remember(agentId) { client.getTerminalBuffer(agentId) }
    val version by buffer.version.collectAsState()
    // Recomposition is batched per frame, so a burst of output renders the text once.
    val lines = remember(version) { buffer.screen.styledLines() }
    var tab by rememberSaveable { mutableStateOf(AgentTab.TERMINAL) }

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
                            Text("Back", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
                        }
                    },
                    title = {
                        Column {
                            Text(
                                agent?.taskName ?: "Agent",
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                agent?.let(::agentStatusLabel) ?: statusLabel(state),
                                style = MaterialTheme.typography.bodySmall,
                                color = AppTheme.extra.textMuted,
                            )
                        }
                    },
                )
                HorizontalDivider(thickness = 1.dp, color = AppTheme.extra.border)
            }
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding(),
        ) {
            PrimaryTabRow(
                selectedTabIndex = tab.ordinal,
                containerColor = MaterialTheme.colorScheme.surface,
                contentColor = MaterialTheme.colorScheme.primary,
                divider = { HorizontalDivider(thickness = 1.dp, color = AppTheme.extra.border) },
            ) {
                AgentTab.entries.forEach {
                    Tab(
                        selected = tab == it,
                        onClick = { tab = it },
                        text = {
                            Text(
                                it.label,
                                fontWeight = if (tab == it) FontWeight.Bold else FontWeight.Normal,
                            )
                        },
                    )
                }
            }
            AnimatedContent(
                targetState = tab,
                transitionSpec = {
                    if (targetState == AgentTab.NOTES) {
                        (slideInHorizontally(animationSpec = tween(220)) { width -> width / 4 } + fadeIn(tween(180)))
                            .togetherWith(slideOutHorizontally(animationSpec = tween(200)) { width -> -width / 4 } + fadeOut(tween(160)))
                    } else {
                        (slideInHorizontally(animationSpec = tween(220)) { width -> -width / 4 } + fadeIn(tween(180)))
                            .togetherWith(slideOutHorizontally(animationSpec = tween(200)) { width -> width / 4 } + fadeOut(tween(160)))
                    }
                },
                modifier = Modifier.weight(1f),
                label = "agentTabTransition",
            ) { currentTab ->
                when (currentTab) {
                    AgentTab.TERMINAL -> if (agent?.collapsed == true) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(24.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Text(
                                    "This task is minimized on your computer.",
                                    style = MaterialTheme.typography.bodyLarge,
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colorScheme.onSurface,
                                )
                                Text(
                                    "Expand it on desktop to resume terminal interaction.",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = AppTheme.extra.textMuted,
                                )
                            }
                        }
                    } else {
                        TerminalText(lines, Modifier.fillMaxSize())
                    }
                    AgentTab.NOTES -> if (agent != null) {
                        NotesPane(agent.taskId, state.canControl, client, Modifier.fillMaxSize())
                    } else {
                        Text(
                            "This agent is no longer running.",
                            Modifier
                                .fillMaxSize()
                                .padding(16.dp),
                            color = AppTheme.extra.textMuted,
                        )
                    }
                }
            }
            if (!state.canControl) {
                Spacer(Modifier.height(8.dp))
                PairBanner(onPair)
                Spacer(Modifier.height(8.dp))
            } else if (tab == AgentTab.TERMINAL && agent?.collapsed != true) {
                ReplyBox(
                    send = { draft ->
                        val data = messageForTerminal(draft, buffer.screen.bracketedPaste)
                        if (data.isNotEmpty()) client.sendInput(agentId, data, submit = true)
                    },
                    sendKey = { client.sendInput(agentId, it, submit = false) },
                )
            }
        }
    }
}

private enum class AgentTab(val label: String) { TERMINAL("Terminal"), NOTES("Notes") }

/** Keys agent TUIs ask for that a phone keyboard can't type, as in the phone web UI. */
private val QUICK_KEYS = listOf(
    "Enter" to "\r",
    "Esc" to "\u001b",
    "Tab" to "\t",
    "↑" to "\u001b[A",
    "↓" to "\u001b[B",
    "/" to "/",
    "Ctrl+C" to "\u0003",
    "Ctrl+D" to "\u0004",
    "Clear" to "\u000c",
)

@Composable
private fun TerminalText(lines: List<List<StyledSpan>>, modifier: Modifier) {
    val palette = if (isSystemInDarkTheme()) TerminalPalette.OBSIDIAN else TerminalPalette.OBSIDIAN_LIGHT
    val text = remember(lines, palette) { terminalAnnotatedString(lines, palette) }
    val vertical = rememberScrollState()
    val horizontal = rememberScrollState()
    val scope = rememberCoroutineScope()
    var follow by remember { mutableStateOf(true) }

    // Evaluates whether the scroll position is near the bottom (within 48px)
    val isNearBottom by remember {
        derivedStateOf {
            vertical.maxValue == 0 || (vertical.maxValue - vertical.value) <= 48
        }
    }

    var hasNewOutputWhileScrolled by remember { mutableStateOf(false) }

    // Pause follow immediately when dragging away from the bottom; resume if user flings/scrolls back to bottom
    LaunchedEffect(vertical.isScrollInProgress) {
        if (vertical.isScrollInProgress) {
            if (!isNearBottom) {
                follow = false
            }
        } else {
            if (isNearBottom) {
                follow = true
                hasNewOutputWhileScrolled = false
            }
        }
    }

    LaunchedEffect(text) {
        if (follow && !vertical.isScrollInProgress) {
            withFrameNanos {}
            vertical.scrollTo(vertical.maxValue)
        } else if (!isNearBottom) {
            hasNewOutputWhileScrolled = true
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(palette.background)),
    ) {
        // Outer vertical scroll with nested horizontal scroll for wide lines
        Box(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(vertical),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(horizontal)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            ) {
                Text(
                    text = text,
                    color = Color(palette.foreground),
                    fontFamily = FontFamily.Monospace,
                    fontSize = 11.sp,
                    lineHeight = 14.sp,
                    softWrap = false,
                )
            }
        }

        // Vertical scrollbar indicator along the right edge
        if (vertical.maxValue > 0) {
            TerminalVerticalScrollbar(
                scrollState = vertical,
                modifier = Modifier
                    .align(Alignment.CenterEnd)
                    .fillMaxHeight()
                    .padding(end = 2.dp, top = 4.dp, bottom = 4.dp),
            )
        }

        // Floating jump-to-bottom / new-output pill button
        AnimatedVisibility(
            visible = !isNearBottom,
            enter = fadeIn(tween(180)) + slideInVertically(tween(200)) { it / 2 },
            exit = fadeOut(tween(150)) + slideOutVertically(tween(180)) { it / 2 },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 16.dp, bottom = 12.dp),
        ) {
            val jumpInteractionSource = remember { MutableInteractionSource() }
            val isPressed by jumpInteractionSource.collectIsPressedAsState()
            val scale by animateFloatAsState(
                targetValue = if (isPressed) 0.94f else 1f,
                animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessLow),
                label = "jumpToBottomScale",
            )
            Surface(
                onClick = {
                    follow = true
                    hasNewOutputWhileScrolled = false
                    scope.launch {
                        vertical.animateScrollTo(vertical.maxValue)
                    }
                },
                interactionSource = jumpInteractionSource,
                shape = RoundedCornerShape(20.dp),
                color = if (hasNewOutputWhileScrolled) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
                border = BorderStroke(1.dp, if (hasNewOutputWhileScrolled) MaterialTheme.colorScheme.primary else AppTheme.extra.border),
                shadowElevation = 6.dp,
                modifier = Modifier.graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                },
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = if (hasNewOutputWhileScrolled) "↓ New output" else "↓ Latest",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = if (hasNewOutputWhileScrolled) MaterialTheme.colorScheme.onPrimaryContainer else AppTheme.extra.textPrimary,
                    )
                }
            }
        }
    }
}

@Composable
private fun TerminalVerticalScrollbar(
    scrollState: ScrollState,
    modifier: Modifier = Modifier,
) {
    if (scrollState.maxValue <= 0) return
    BoxWithConstraints(modifier.width(4.dp)) {
        val totalHeight = maxHeight
        val viewHeightPx = constraints.maxHeight.toFloat()
        val maxScroll = scrollState.maxValue.toFloat()
        val totalContentHeight = viewHeightPx + maxScroll
        val thumbHeightRatio = (viewHeightPx / totalContentHeight).coerceIn(0.08f, 0.9f)
        val thumbHeightDp = totalHeight * thumbHeightRatio
        val scrollRatio = (scrollState.value.toFloat() / maxScroll).coerceIn(0f, 1f)
        val thumbOffsetDp = (totalHeight - thumbHeightDp) * scrollRatio

        Box(
            Modifier
                .offset(y = thumbOffsetDp)
                .fillMaxWidth()
                .height(thumbHeightDp)
                .clip(RoundedCornerShape(2.dp))
                .background(
                    if (scrollState.isScrollInProgress) AppTheme.extra.textPrimary.copy(alpha = 0.55f)
                    else AppTheme.extra.textMuted.copy(alpha = 0.28f)
                ),
        )
    }
}

private fun terminalAnnotatedString(lines: List<List<StyledSpan>>, palette: TerminalPalette) =
    buildAnnotatedString {
        lines.forEachIndexed { i, line ->
            if (i > 0) append('\n')
            line.forEach { span ->
                if (span.style == CellStyle.DEFAULT) {
                    append(span.text)
                    return@forEach
                }
                val s = palette.resolve(span.style)
                withStyle(
                    SpanStyle(
                        color = Color(s.foreground),
                        background = s.background?.let(::Color) ?: Color.Unspecified,
                        fontWeight = if (s.bold) FontWeight.Bold else null,
                        fontStyle = if (s.italic) FontStyle.Italic else null,
                        textDecoration = when {
                            s.underline && s.strike -> TextDecoration.combine(
                                listOf(TextDecoration.Underline, TextDecoration.LineThrough),
                            )
                            s.underline -> TextDecoration.Underline
                            s.strike -> TextDecoration.LineThrough
                            else -> null
                        },
                    ),
                ) { append(span.text) }
            }
        }
    }

@Composable
private fun QuickKeyButton(
    label: String,
    data: String,
    busy: Boolean,
    onSendKey: (String) -> Unit,
) {
    val haptic = LocalHapticFeedback.current
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (isPressed) 0.92f else 1f,
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        label = "quickKeyScale",
    )
    OutlinedButton(
        onClick = {
            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            onSendKey(data)
        },
        enabled = !busy,
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, AppTheme.extra.border),
        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
            contentColor = AppTheme.extra.textPrimary,
        ),
        interactionSource = interactionSource,
        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
        modifier = Modifier.graphicsLayer {
            scaleX = scale
            scaleY = scale
        },
    ) {
        Text(label, fontFamily = FontFamily.Monospace, fontSize = 12.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun ReplyBox(send: suspend (String) -> Unit, sendKey: suspend (String) -> Unit) {
    val scope = rememberCoroutineScope()
    val haptic = LocalHapticFeedback.current
    var draft by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    fun run(action: suspend () -> Unit) {
        busy = true
        error = null
        scope.launch {
            try {
                action()
            } catch (e: IOException) {
                error = e.message
            } finally {
                busy = false
            }
        }
    }
    Surface(
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, AppTheme.extra.border),
    ) {
        Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                QUICK_KEYS.forEach { (label, data) ->
                    QuickKeyButton(label, data, busy = busy) { run { sendKey(it) } }
                }
            }
            AnimatedVisibility(
                visible = error != null,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut(),
            ) {
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            }
            Row(verticalAlignment = Alignment.Bottom) {
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Reply to agent", color = AppTheme.extra.textSubtle) },
                    maxLines = 5,
                    enabled = !busy,
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = AppTheme.extra.inputBg,
                        unfocusedContainerColor = AppTheme.extra.inputBg,
                        focusedBorderColor = MaterialTheme.colorScheme.primary,
                        unfocusedBorderColor = AppTheme.extra.border,
                    ),
                )
                Spacer(Modifier.width(8.dp))
                val sendInteraction = remember { MutableInteractionSource() }
                val sendPressed by sendInteraction.collectIsPressedAsState()
                val sendScale by animateFloatAsState(
                    targetValue = if (sendPressed) 0.94f else 1f,
                    animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
                    label = "sendButtonScale",
                )
                Button(
                    enabled = draft.isNotBlank() && !busy,
                    shape = RoundedCornerShape(12.dp),
                    interactionSource = sendInteraction,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary,
                    ),
                    modifier = Modifier.graphicsLayer {
                        scaleX = sendScale
                        scaleY = sendScale
                    },
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        run {
                            send(draft)
                            draft = ""
                        }
                    },
                ) { Text("Send", fontWeight = FontWeight.Bold) }
            }
        }
    }
}

fun statusLabel(state: ConnectionState) = when (state.status) {
    ConnectionStatus.CONNECTED -> if (state.canControl) "Connected" else "Connected, view only"
    ConnectionStatus.CONNECTING -> "Connecting…"
    ConnectionStatus.DISCONNECTED -> "Offline"
}

private fun agentStatusLabel(agent: RemoteAgent): String {
    if (agent.collapsed) return "Minimized"
    if (!agent.running) return agent.exitCode?.let { "Exited ($it)" } ?: "Exited"
    return when (agent.attention) {
        "needs_input" -> "Needs input"
        "active" -> "Working"
        "shell_busy" -> "Running command"
        "error" -> "Error"
        "ready" -> "Ready"
        "review" -> "Review"
        else -> "Idle"
    }
}
