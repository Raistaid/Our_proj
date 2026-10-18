package ru.sber.hackathonsandbox.bridge

import java.net.URI
import java.net.URISyntaxException
import java.util.Base64
import java.util.Locale

/** Картинка для системного «поделиться». */
sealed class ShareImage {

    /** Картинка пришла data URL и уже декодирована. */
    class Data(val bytes: ByteArray) : ShareImage() {
        override fun equals(other: Any?) = other is Data && bytes.contentEquals(other.bytes)
        override fun hashCode() = bytes.contentHashCode()
        override fun toString() = "Data(${bytes.size} bytes)"
    }

    /** Картинку нужно скачать перед показом шерилки. */
    data class Remote(val url: String) : ShareImage()

    companion object {

        /** Разбирает значение поля `image`: data URL с base64 или http(s)-ссылку. */
        fun from(string: String): ShareImage? {
            if (string.startsWith("data:")) {
                val bytes = decodeDataUrl(string) ?: return null
                return if (looksLikeImage(bytes)) Data(bytes) else null
            }
            val uri = try {
                URI(string)
            } catch (_: URISyntaxException) {
                return null
            }
            val scheme = uri.scheme?.lowercase(Locale.ROOT)
            return if ((scheme == "http" || scheme == "https") && !uri.host.isNullOrEmpty()) Remote(string) else null
        }

        private fun decodeDataUrl(string: String): ByteArray? {
            val comma = string.indexOf(',')
            if (comma < 0) {
                return null
            }
            val metadata = string.substring(5, comma)
            if (!metadata.endsWith(";base64")) {
                return null
            }
            val payload = string.substring(comma + 1).filterNot { it.isWhitespace() }
            return try {
                Base64.getMimeDecoder().decode(payload)
            } catch (_: IllegalArgumentException) {
                null
            }
        }

        /** Проверка по сигнатуре формата: PNG, JPEG, GIF, WebP, BMP. */
        private fun looksLikeImage(bytes: ByteArray): Boolean {
            fun startsWith(vararg signature: Int, offset: Int = 0) =
                bytes.size >= offset + signature.size &&
                    signature.indices.all { bytes[offset + it] == signature[it].toByte() }
            return startsWith(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A) ||
                startsWith(0xFF, 0xD8, 0xFF) ||
                startsWith(0x47, 0x49, 0x46, 0x38) ||
                (startsWith(0x52, 0x49, 0x46, 0x46) && startsWith(0x57, 0x45, 0x42, 0x50, offset = 8)) ||
                startsWith(0x42, 0x4D)
        }
    }
}

data class SharePayload(
    val text: String?,
    val image: ShareImage?,
)

/** Реакция приложения на Page Event. */
sealed class BridgeAction {
    data object Close : BridgeAction()
    data class ShowToast(val text: String) : BridgeAction()
    data object Vibrate : BridgeAction()
    data class Share(val payload: SharePayload) : BridgeAction()

    val logDescription: String
        get() = when (this) {
            Close -> "Закрыть экран игры"
            is ShowToast -> "Тост «$text»"
            Vibrate -> "Вибрация (EFFECT_CLICK)"
            is Share -> {
                val parts = listOfNotNull(
                    payload.text?.let { "текст «$it»" },
                    when (val image = payload.image) {
                        is ShareImage.Data -> "картинка data URL, ${formatByteCount(image.bytes.size)}"
                        is ShareImage.Remote -> "картинка ${image.url}"
                        null -> null
                    },
                )
                "Поделиться: " + parts.joinToString(", ")
            }
        }
}

private fun formatByteCount(count: Int): String = when {
    count < 1000 -> "$count байт"
    count < 1_000_000 -> String.format(Locale.forLanguageTag("ru"), "%.1f КБ", count / 1000.0)
    else -> String.format(Locale.forLanguageTag("ru"), "%.1f МБ", count / 1_000_000.0)
}
