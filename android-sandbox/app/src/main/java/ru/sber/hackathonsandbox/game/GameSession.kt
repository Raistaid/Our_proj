package ru.sber.hackathonsandbox.game

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import ru.sber.hackathonsandbox.bridge.BridgeAction
import ru.sber.hackathonsandbox.bridge.BridgeResult
import ru.sber.hackathonsandbox.bridge.PageEventHandler
import ru.sber.hackathonsandbox.bridge.ShareImage
import ru.sber.hackathonsandbox.bridge.SharePayload
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

/** Платформенные действия, которые Bridge Actions выполняют вне WebView. */
interface BridgeEffects {
    fun vibrate()
    suspend fun share(text: String?, image: Bitmap?)
}

/** Состояние одного открытия Game Screen: Event Log, тосты и выполнение Bridge Actions. */
class GameSession(
    val pageUrl: String,
    private val effects: BridgeEffects,
    private val scope: CoroutineScope,
) {

    data class Toast(val text: String, val id: String = UUID.randomUUID().toString())

    val log = mutableStateListOf<EventLogEntry>()

    var toast by mutableStateOf<Toast?>(null)
        private set
    var isClosed by mutableStateOf(false)
        private set
    var isLoading by mutableStateOf(true)
        private set

    private val handler = PageEventHandler()

    fun receive(body: Any?, origin: String) {
        var actions = emptyList<BridgeAction>()
        val entry = when (val result = handler.handle(body)) {
            is BridgeResult.Handled -> {
                actions = result.actions
                EventLogEntry(EventLogEntry.Kind.Event(result.type), warnings = result.warnings)
            }
            is BridgeResult.UnknownEvent -> EventLogEntry(EventLogEntry.Kind.UnknownEvent(result.type))
            is BridgeResult.InvalidMessage -> EventLogEntry(EventLogEntry.Kind.InvalidMessage(result.reason))
        }
        log += entry.copy(
            origin = origin,
            rawBody = EventLogEntry.describe(body),
            actions = actions.map { it.logDescription },
        )
        actions.forEach(::perform)
    }

    fun pageLoadingStarted() {
        isLoading = true
    }

    fun pageLoaded(url: String) {
        isLoading = false
        log += EventLogEntry(EventLogEntry.Kind.PageLoaded(url))
    }

    fun loadFailed(reason: String) {
        isLoading = false
        log += EventLogEntry(EventLogEntry.Kind.LoadFailed(reason))
        showToast("Не удалось загрузить страницу")
    }

    fun navigationBlocked(description: String) {
        log += EventLogEntry(EventLogEntry.Kind.BlockedNavigation(description))
        showToast("Переход наружу заблокирован")
    }

    fun clearLog() {
        log.clear()
    }

    fun close() {
        isClosed = true
    }

    val exportedLog: String
        get() = log.joinToString("\n\n") { it.exportText }

    private fun perform(action: BridgeAction) {
        when (action) {
            BridgeAction.Close -> close()
            is BridgeAction.ShowToast -> showToast(action.text)
            BridgeAction.Vibrate -> effects.vibrate()
            is BridgeAction.Share -> share(action.payload)
        }
    }

    private fun showToast(text: String) {
        val toast = Toast(text)
        this.toast = toast
        scope.launch {
            delay(2_000)
            if (this@GameSession.toast == toast) {
                this@GameSession.toast = null
            }
        }
    }

    private fun share(payload: SharePayload) {
        scope.launch {
            val image = when (val image = payload.image) {
                is ShareImage.Data -> decode(image.bytes).also {
                    if (it == null) {
                        log += EventLogEntry(EventLogEntry.Kind.LoadFailed("Не удалось декодировать картинку для шеринга"))
                    }
                }
                is ShareImage.Remote -> download(image.url).also {
                    if (it == null) {
                        log += EventLogEntry(EventLogEntry.Kind.LoadFailed("Не удалось скачать картинку для шеринга: ${image.url}"))
                    }
                }
                null -> null
            }
            if (payload.text != null || image != null) {
                effects.share(payload.text, image)
            }
        }
    }

    private suspend fun decode(bytes: ByteArray): Bitmap? = withContext(Dispatchers.Default) {
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    }

    private suspend fun download(url: String): Bitmap? = withContext(Dispatchers.IO) {
        runCatching {
            val connection = URL(url).openConnection() as HttpURLConnection
            connection.useCaches = false
            connection.connectTimeout = 15_000
            connection.readTimeout = 15_000
            try {
                connection.inputStream.use { BitmapFactory.decodeStream(it) }
            } finally {
                connection.disconnect()
            }
        }.getOrNull()
    }
}
