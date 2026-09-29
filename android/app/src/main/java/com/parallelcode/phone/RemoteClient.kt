package com.parallelcode.phone

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

enum class ConnectionStatus { CONNECTING, CONNECTED, DISCONNECTED }

/** What the UI needs to know about the link to the desktop. */
data class ConnectionState(
    /** The linked desktop; null until a QR code is scanned. */
    val link: ConnectionLink? = null,
    val status: ConnectionStatus = ConnectionStatus.DISCONNECTED,
    /** True once the socket authenticated with the paired token, which may type. */
    val canControl: Boolean = false,
    /** Set when the desktop rejected the QR-code token; only a fresh scan recovers. */
    val linkExpired: Boolean = false,
)

interface TerminalListener {
    fun onScrollback(data: ByteArray, cols: Int, rows: Int)
    fun onOutput(data: ByteArray)
}

/** A REST call the desktop refused or could not answer; `status` is 0 when it was unreachable. */
class ApiException(message: String, val status: Int = 0) : IOException(message)

data class MobileProject(val id: String, val name: String, val agentName: String?)

/**
 * Client for the desktop's Remote Access server (electron/remote/server.ts). Mirrors the phone web
 * UI in src/remote/ws.ts: authenticate with the first WebSocket message, prefer the paired token,
 * and fall back to view-only when the desktop revokes it. All state changes on the main thread.
 */
class RemoteClient(private val credentials: CredentialStore) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val http = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .pingInterval(30, TimeUnit.SECONDS)
        .build()

    private val _state = MutableStateFlow(ConnectionState(link = credentials.link))
    val state: StateFlow<ConnectionState> = _state.asStateFlow()
    private val _agents = MutableStateFlow<List<RemoteAgent>>(emptyList())
    val agents: StateFlow<List<RemoteAgent>> = _agents.asStateFlow()
    private val _latencyMs = MutableStateFlow<Long?>(null)
    val latencyMs: StateFlow<Long?> = _latencyMs.asStateFlow()

    private var socket: WebSocket? = null
    // OkHttp queues sends before the socket opens, which would put them ahead of the auth message.
    private var socketOpen = false
    private var authKind = TokenKind.MOBILE
    private var started = false
    private var reconnectJob: Job? = null
    private var handshakeJob: Job? = null
    private val terminalBuffers = mutableMapOf<String, TerminalBuffer>()
    private val subscribedAgents = mutableSetOf<String>()
    private val terminalListeners = mutableMapOf<String, MutableSet<TerminalListener>>()
    private val pending = mutableMapOf<String, CompletableDeferred<Unit>>()
    private var nextRequestId = 0

    private enum class TokenKind { MOBILE, PAIRED }

    /** Keep a socket open while the app is in the foreground. */
    fun start() {
        started = true
        connect()
    }

    fun stop() {
        started = false
        closeSocket()
    }

    fun link(link: ConnectionLink) {
        credentials.saveLink(link)
        _state.value = ConnectionState(link = link)
        _agents.value = emptyList()
        terminalBuffers.clear()
        subscribedAgents.clear()
        terminalListeners.clear()
        reconnect()
    }

    fun forget() {
        closeSocket()
        credentials.clear()
        _agents.value = emptyList()
        _latencyMs.value = null
        _state.value = ConnectionState()
        terminalBuffers.clear()
        subscribedAgents.clear()
        terminalListeners.clear()
    }

    fun reconnect() {
        closeSocket()
        if (started) connect()
    }

    fun dispose() {
        stop()
        scope.cancel()
        http.dispatcher.executorService.shutdown()
    }

    /** Trade the desktop's six-digit PIN for a paired token, then reconnect with it. */
    suspend fun pair(pin: String, remember: Boolean) {
        val reply = api(
            "POST",
            "/api/pair/verify",
            JSONObject().put("pin", pin).put("remember", remember),
            token = credentials.pairedToken ?: credentials.link?.token,
        )
        val token = reply.optString("token").takeIf { it.isNotEmpty() }
            ?: throw ApiException("Your computer sent an unexpected reply.")
        credentials.savePairedToken(token)
        reconnect()
    }

    /** Projects a paired phone may start tasks in. */
    suspend fun fetchProjects(): List<MobileProject> {
        val list = JSONArray(apiRaw("GET", "/api/mobile/projects", null, pairedTokenOrThrow()))
        return List(list.length()) { i ->
            val p = list.getJSONObject(i)
            MobileProject(p.getString("id"), p.getString("name"), p.optString("agentName").ifEmpty { null })
        }
    }

    /** Start a top-level task on the desktop; returns its task id. */
    suspend fun createTask(projectId: String, name: String, prompt: String): String {
        val body = JSONObject().put("projectId", projectId).put("name", name).put("prompt", prompt)
        return api("POST", "/api/mobile/tasks", body, pairedTokenOrThrow()).getString("taskId")
    }

    /** The desktop status bar's subscription usage; readable with the view-only token. */
    suspend fun fetchUsage(): List<ProviderUsage> =
        parseUsage(api("GET", "/api/mobile/usage", null, credentials.pairedToken ?: credentials.link?.token))

    /** The task's notes panel; readable with the view-only token. */
    suspend fun fetchNotes(taskId: String): String =
        api("GET", notesPath(taskId), null, credentials.pairedToken ?: credentials.link?.token)
            .optString("notes")

    suspend fun saveNotes(taskId: String, notes: String) {
        api("PUT", notesPath(taskId), JSONObject().put("notes", notes), pairedTokenOrThrow())
    }

    private fun notesPath(taskId: String) = "/api/mobile/notes/" + URLEncoder.encode(taskId, "UTF-8").replace("+", "%20")

    private fun pairedTokenOrThrow(): String =
        credentials.pairedToken ?: throw ApiException("Pair this phone first.", 401)

    private suspend fun api(method: String, path: String, body: JSONObject?, token: String?): JSONObject =
        try {
            JSONObject(apiRaw(method, path, body, token))
        } catch (e: JSONException) {
            throw ApiException("Your computer sent an unexpected reply.")
        }

    private suspend fun apiRaw(method: String, path: String, body: JSONObject?, token: String?): String {
        val link = credentials.link ?: throw ApiException("Not connected to a computer.")
        if (token == null) throw ApiException("Not connected to a computer.")
        val request = Request.Builder()
            .url(link.baseUrl + path)
            .header("Authorization", "Bearer $token")
            .method(method, body?.toString()?.toRequestBody("application/json".toMediaType()))
            .build()
        val start = System.currentTimeMillis()
        val (code, text) = withContext(Dispatchers.IO) {
            try {
                http.newCall(request).execute().use { it.code to it.body.string() }
            } catch (e: IOException) {
                _latencyMs.value = null
                throw ApiException("Could not reach your computer. Check you're on the same network.")
            }
        }
        val elapsed = System.currentTimeMillis() - start
        _latencyMs.value = elapsed
        if (code in 200..299) return text
        val error = runCatching { JSONObject(text).optString("error") }.getOrNull()?.takeIf { it.isNotEmpty() }
        // 401 means the desktop no longer knows this token, so drop to view-only like a 4001 close.
        // 403 only means this route is not open to the token (or to an older desktop), so the
        // pairing stays.
        if (code == 401 && token == credentials.pairedToken && path != "/api/pair/verify") {
            credentials.clearPairedToken()
            reconnect()
            throw ApiException("This phone is no longer paired. Pair again to continue.", code)
        }
        throw ApiException(error ?: "Request failed ($code).", code)
    }

    /**
     * Get or create a persistent TerminalBuffer for an agent.
     * Subscribes to the desktop server so output streams and buffers in the background.
     */
    fun getTerminalBuffer(agentId: String): TerminalBuffer {
        val buffer = terminalBuffers.getOrPut(agentId) { TerminalBuffer(agentId) }
        subscribeAgent(agentId)
        return buffer
    }

    private fun subscribeAgent(agentId: String) {
        if (subscribedAgents.add(agentId) && socketOpen) {
            send(JSONObject().put("type", "subscribe").put("agentId", agentId))
        }
    }

    /** Stream an agent's terminal. Retained for backwards compatibility. */
    fun watchTerminal(agentId: String, listener: TerminalListener): () -> Unit {
        getTerminalBuffer(agentId)
        val listeners = terminalListeners.getOrPut(agentId) { mutableSetOf() }
        listeners.add(listener)
        return {
            listeners.remove(listener)
            if (listeners.isEmpty()) {
                terminalListeners.remove(agentId)
            }
        }
    }

    /** Type into an agent's terminal; `submit` presses Enter once the text has landed. */
    suspend fun sendInput(agentId: String, data: String, submit: Boolean) {
        if (data.length > MAX_INPUT_LENGTH) {
            throw IOException("This message is too long. Shorten it and try again.")
        }
        val ws = socket
        if (!_state.value.canControl || ws == null) {
            throw IOException("Reconnect before sending. Your draft has been kept.")
        }
        val requestId = (++nextRequestId).toString()
        val result = CompletableDeferred<Unit>()
        pending[requestId] = result
        val msg = JSONObject()
            .put("type", "input")
            .put("agentId", agentId)
            .put("data", data)
            .put("submit", submit)
            .put("requestId", requestId)
        if (!ws.send(msg.toString())) {
            pending.remove(requestId)
            throw IOException("Could not send. Your draft has been kept.")
        }
        try {
            withTimeout(REQUEST_TIMEOUT_MS) { result.await() }
        } catch (e: TimeoutCancellationException) {
            throw IOException(
                "Delivery could not be confirmed. Check the output before retrying; your draft has been kept.",
            )
        } finally {
            pending.remove(requestId)
        }
    }

    private fun connect() {
        if (socket != null) return
        val link = credentials.link ?: return
        val paired = credentials.pairedToken
        authKind = if (paired != null) TokenKind.PAIRED else TokenKind.MOBILE
        val token = paired ?: link.token

        reconnectJob?.cancel()
        _state.update { it.copy(status = ConnectionStatus.CONNECTING, canControl = false, linkExpired = false) }
        val request = Request.Builder().url(link.webSocketUrl).build()
        lateinit var ws: WebSocket
        ws = http.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                // Authenticate in the first message, not the URL, so the token stays out of logs.
                webSocket.send(JSONObject().put("type", "auth").put("token", token).toString())
                scope.launch {
                    if (socket !== ws) return@launch
                    socketOpen = true
                    subscribedAgents.forEach {
                        send(JSONObject().put("type", "subscribe").put("agentId", it))
                    }
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val msg = parseServerMessage(text) ?: return
                scope.launch { if (socket === ws) handle(msg) }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(code, null)
                scope.launch { if (socket === ws) onDisconnect(code) }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                scope.launch { if (socket === ws) onDisconnect(CLOSE_ABNORMAL) }
            }
        })
        socket = ws
        // A sleeping phone or unreachable computer may never finish the handshake.
        handshakeJob = scope.launch {
            delay(HANDSHAKE_TIMEOUT_MS)
            if (socket === ws && _state.value.status != ConnectionStatus.CONNECTED) {
                onDisconnect(CLOSE_ABNORMAL)
            }
        }
    }

    private fun handle(msg: ServerMessage) {
        when (msg) {
            is ServerMessage.Agents -> {
                handshakeJob?.cancel()
                _state.update {
                    it.copy(status = ConnectionStatus.CONNECTED, canControl = authKind == TokenKind.PAIRED)
                }
                _agents.value = msg.list

                // Buffer active running agents in the background
                msg.list.forEach { agent ->
                    if (agent.running && !agent.isChat) {
                        getTerminalBuffer(agent.agentId)
                    }
                }

                // Clean up deleted agents that no longer exist on the desktop
                val activeIds = msg.list.map { it.agentId }.toSet()
                val deleted = subscribedAgents.filter { it !in activeIds }
                deleted.forEach { id ->
                    subscribedAgents.remove(id)
                    terminalBuffers.remove(id)
                    terminalListeners.remove(id)
                    if (socketOpen) {
                        send(JSONObject().put("type", "unsubscribe").put("agentId", id))
                    }
                }
            }
            is ServerMessage.Status -> {
                _agents.update { list ->
                    list.map { if (it.agentId == msg.agentId) it.copy(running = msg.running, exitCode = msg.exitCode) else it }
                }
                if (msg.running) {
                    getTerminalBuffer(msg.agentId)
                }
            }
            is ServerMessage.Scrollback -> {
                val buffer = terminalBuffers.getOrPut(msg.agentId) { TerminalBuffer(msg.agentId) }
                buffer.onScrollback(msg.data, msg.cols, msg.rows)
                terminalListeners[msg.agentId]?.toList()?.forEach { it.onScrollback(msg.data, msg.cols, msg.rows) }
            }
            is ServerMessage.Output -> {
                terminalBuffers[msg.agentId]?.onOutput(msg.data)
                terminalListeners[msg.agentId]?.toList()?.forEach { it.onOutput(msg.data) }
            }
            is ServerMessage.InputResult -> {
                val result = pending.remove(msg.requestId) ?: return
                if (msg.ok) {
                    result.complete(Unit)
                } else {
                    result.completeExceptionally(IOException(msg.error ?: "Could not send. Your draft has been kept."))
                }
            }
        }
    }

    private fun onDisconnect(code: Int) {
        closeSocket()
        // 4001: the desktop rejected the token. A stale paired token falls back to view-only; a
        // stale QR-code token needs a fresh scan. 4003: this phone lost its typing rights.
        when {
            code == CLOSE_UNAUTHORIZED && authKind == TokenKind.MOBILE -> {
                credentials.clear()
                _agents.value = emptyList()
                _state.value = ConnectionState(linkExpired = true)
                return
            }
            code == CLOSE_UNAUTHORIZED || code == CLOSE_FORBIDDEN -> {
                credentials.clearPairedToken()
                if (code == CLOSE_UNAUTHORIZED) {
                    if (started) connect()
                    return
                }
            }
        }
        if (!started) return
        reconnectJob = scope.launch {
            delay(RECONNECT_DELAY_MS)
            connect()
        }
    }

    private fun closeSocket() {
        handshakeJob?.cancel()
        reconnectJob?.cancel()
        socketOpen = false
        socket?.let {
            socket = null
            it.close(CLOSE_NORMAL, null)
        }
        _state.update { it.copy(status = ConnectionStatus.DISCONNECTED, canControl = false) }
        _latencyMs.value = null
        val interrupted = IOException(
            "Connection interrupted. Your message may have reached the terminal. Check the output before retrying.",
        )
        pending.values.forEach { it.completeExceptionally(interrupted) }
        pending.clear()
    }

    private fun send(msg: JSONObject) {
        if (socketOpen) socket?.send(msg.toString())
    }

    private companion object {
        const val CLOSE_NORMAL = 1000
        const val CLOSE_ABNORMAL = 1006
        const val CLOSE_UNAUTHORIZED = 4001
        const val CLOSE_FORBIDDEN = 4003
        const val HANDSHAKE_TIMEOUT_MS = 10_000L
        const val RECONNECT_DELAY_MS = 3_000L
        const val REQUEST_TIMEOUT_MS = 10_000L
        const val MAX_INPUT_LENGTH = 4096
    }
}
