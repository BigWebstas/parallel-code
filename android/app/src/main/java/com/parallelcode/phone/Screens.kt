package com.parallelcode.phone

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
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
import androidx.compose.ui.platform.LocalContext
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
            Text(
                "This link no longer works. Your computer restarted Remote Access or disconnected this phone.",
                color = MaterialTheme.colorScheme.error,
            )
        }
        Text("On your computer, open Connect Phone and scan the QR code.")
        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                error = null
                val options = GmsBarcodeScannerOptions.Builder()
                    .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                    .build()
                GmsBarcodeScanning.getClient(context, options).startScan()
                    .addOnSuccessListener { accept(it.rawValue.orEmpty()) }
                    .addOnFailureListener { error = "The scanner isn't available. Paste the link instead." }
            },
        ) { Text("Scan QR code") }
        Text("Or paste the link shown under the QR code:", style = MaterialTheme.typography.bodySmall)
        OutlinedTextField(
            value = pasted,
            onValueChange = { pasted = it },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            placeholder = { Text("http://192.168.1.20:7777/?token=…") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
        )
        TextButton(onClick = { accept(pasted) }, enabled = pasted.isNotBlank()) { Text("Connect") }
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
        Text("Enter the six-digit code from Connect Phone on your computer to send messages to agents.")
        OutlinedTextField(
            value = pin,
            onValueChange = { pin = it.filter(Char::isDigit).take(6) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Code from your computer") },
            singleLine = true,
            enabled = !busy,
            textStyle = MaterialTheme.typography.headlineSmall.copy(fontFamily = FontFamily.Monospace),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Keep this phone authorized")
                Text(
                    "Stay paired after your computer restarts. Use only on a phone you trust.",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            Switch(checked = remember, onCheckedChange = { remember = it }, enabled = !busy)
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(
            modifier = Modifier.fillMaxWidth(),
            enabled = pin.length == 6 && !busy,
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
        ) { Text(if (busy) "Authorizing…" else "Enable replies") }
        TextButton(modifier = Modifier.fillMaxWidth(), onClick = onDone, enabled = !busy) {
            Text("Continue viewing only")
        }
    }
}

@Composable
private fun SetupPage(title: String, content: @Composable () -> Unit) {
    Surface(Modifier.fillMaxSize()) {
        Column(
            Modifier
                .fillMaxSize()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        ) {
            Text(title, style = MaterialTheme.typography.headlineMedium)
            content()
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AgentsScreen(
    host: String,
    state: ConnectionState,
    agents: List<RemoteAgent>,
    onOpen: (RemoteAgent) -> Unit,
    onPair: () -> Unit,
    onNewTask: () -> Unit,
    onForget: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Agents")
                        Text(
                            "${statusLabel(state)} · ${host.substringAfter("://")}",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                },
                actions = {
                    if (state.canControl) TextButton(onClick = onNewTask) { Text("New task") }
                    TextButton(onClick = { menuOpen = true }) { Text("More") }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        DropdownMenuItem(
                            text = { Text("Forget this computer") },
                            onClick = {
                                menuOpen = false
                                onForget()
                            },
                        )
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            Modifier
                .fillMaxSize()
                .padding(padding),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (state.status == ConnectionStatus.CONNECTED && !state.canControl) {
                item { PairBanner(onPair) }
            }
            if (state.status == ConnectionStatus.CONNECTED && agents.isEmpty()) {
                item { Text("No agents are running.", Modifier.padding(16.dp)) }
            }
            if (state.status != ConnectionStatus.CONNECTED && agents.isEmpty()) {
                item {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(Modifier.size(20.dp))
                        Spacer(Modifier.width(12.dp))
                        Text("Reaching your computer…")
                    }
                }
            }
            items(agents, key = { it.agentId }) { agent -> AgentCard(agent, onOpen) }
        }
    }
}

@Composable
private fun PairBanner(onPair: () -> Unit) {
    Card(Modifier.padding(horizontal = 16.dp)) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("View only. Pair to send replies.", Modifier.weight(1f))
            Button(onClick = onPair) { Text("Pair") }
        }
    }
}

@Composable
private fun AgentCard(agent: RemoteAgent, onOpen: (RemoteAgent) -> Unit) {
    Card(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .clickable(enabled = !agent.isChat) { onOpen(agent) },
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    agent.taskName,
                    Modifier.weight(1f),
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    agentStatusLabel(agent),
                    style = MaterialTheme.typography.labelMedium,
                    color = if (agent.attention == "needs_input" || agent.attention == "error") {
                        MaterialTheme.colorScheme.error
                    } else {
                        MaterialTheme.colorScheme.primary
                    },
                )
            }
            listOfNotNull(agent.projectName, agent.agentName).takeIf { it.isNotEmpty() }?.let {
                Text(it.joinToString(" · "), style = MaterialTheme.typography.bodySmall)
            }
            val detail = if (agent.isChat) "Built-in chat. Open it on your computer." else agent.lastLine
            if (detail.isNotBlank()) {
                Text(
                    detail,
                    style = MaterialTheme.typography.bodySmall,
                    fontFamily = FontFamily.Monospace,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
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
    val screen = remember(agentId) { TerminalScreen() }
    var version by remember { mutableIntStateOf(0) }
    DisposableEffect(agentId) {
        val stop = client.watchTerminal(
            agentId,
            object : TerminalListener {
                override fun onScrollback(data: ByteArray, cols: Int, rows: Int) {
                    screen.reset(cols, rows, data)
                    version++
                }

                override fun onOutput(data: ByteArray) {
                    screen.feed(data)
                    version++
                }
            },
        )
        onDispose { stop() }
    }
    // Recomposition is batched per frame, so a burst of output renders the text once.
    val lines = remember(version) { screen.styledLines() }
    var tab by rememberSaveable { mutableStateOf(AgentTab.TERMINAL) }

    Scaffold(
        topBar = {
            TopAppBar(
                navigationIcon = { TextButton(onClick = onBack) { Text("Back") } },
                title = {
                    Column {
                        Text(agent?.taskName ?: "Agent", maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(
                            agent?.let(::agentStatusLabel) ?: statusLabel(state),
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding(),
        ) {
            PrimaryTabRow(selectedTabIndex = tab.ordinal) {
                AgentTab.entries.forEach {
                    Tab(selected = tab == it, onClick = { tab = it }, text = { Text(it.label) })
                }
            }
            when (tab) {
                AgentTab.TERMINAL -> TerminalText(lines, Modifier.weight(1f))
                AgentTab.NOTES -> if (agent != null) {
                    NotesPane(agent.taskId, state.canControl, client, Modifier.weight(1f))
                } else {
                    Text("This agent is no longer running.", Modifier.weight(1f).padding(16.dp))
                }
            }
            if (!state.canControl) {
                PairBanner(onPair)
                Spacer(Modifier.padding(4.dp))
            } else if (tab == AgentTab.TERMINAL) {
                ReplyBox(
                    send = { draft ->
                        val data = messageForTerminal(draft, screen.bracketedPaste)
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
)

@Composable
private fun TerminalText(lines: List<List<StyledSpan>>, modifier: Modifier) {
    val palette = if (isSystemInDarkTheme()) TerminalPalette.OBSIDIAN else TerminalPalette.OBSIDIAN_LIGHT
    val text = remember(lines, palette) { terminalAnnotatedString(lines, palette) }
    val vertical = rememberScrollState()
    var follow by remember { mutableStateOf(true) }
    // Stay pinned to the newest output unless the reader scrolled up.
    LaunchedEffect(vertical.isScrollInProgress) {
        if (!vertical.isScrollInProgress) follow = !vertical.canScrollForward
    }
    LaunchedEffect(text) {
        if (follow) {
            withFrameNanos {}
            vertical.scrollTo(vertical.maxValue)
        }
    }
    Box(
        modifier
            .fillMaxWidth()
            .background(Color(palette.background))
            .verticalScroll(vertical)
            .horizontalScroll(rememberScrollState())
            .padding(12.dp),
    ) {
        Text(
            text,
            color = Color(palette.foreground),
            fontFamily = FontFamily.Monospace,
            fontSize = 11.sp,
            lineHeight = 14.sp,
            softWrap = false,
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
private fun ReplyBox(send: suspend (String) -> Unit, sendKey: suspend (String) -> Unit) {
    val scope = rememberCoroutineScope()
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
    Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            QUICK_KEYS.forEach { (label, data) ->
                OutlinedButton(onClick = { run { sendKey(data) } }, enabled = !busy) { Text(label) }
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        Row(verticalAlignment = Alignment.Bottom) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text("Reply to agent") },
                maxLines = 5,
                enabled = !busy,
            )
            Spacer(Modifier.width(8.dp))
            Button(
                enabled = draft.isNotBlank() && !busy,
                onClick = {
                    run {
                        send(draft)
                        draft = ""
                    }
                },
            ) { Text("Send") }
        }
    }
}

private fun statusLabel(state: ConnectionState) = when (state.status) {
    ConnectionStatus.CONNECTED -> if (state.canControl) "Connected" else "Connected, view only"
    ConnectionStatus.CONNECTING -> "Connecting…"
    ConnectionStatus.DISCONNECTED -> "Offline"
}

private fun agentStatusLabel(agent: RemoteAgent): String {
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
