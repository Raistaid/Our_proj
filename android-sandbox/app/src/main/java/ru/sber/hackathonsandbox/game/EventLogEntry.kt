package ru.sber.hackathonsandbox.game

import org.json.JSONArray
import org.json.JSONObject
import ru.sber.hackathonsandbox.bridge.PageEventType
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/** Одна запись Event Log. */
data class EventLogEntry(
    val kind: Kind,
    val origin: String? = null,
    val rawBody: String? = null,
    val actions: List<String> = emptyList(),
    val warnings: List<String> = emptyList(),
    val id: String = UUID.randomUUID().toString(),
    val date: Date = Date(),
) {

    sealed class Kind {
        data class PageLoaded(val url: String) : Kind()
        data class LoadFailed(val reason: String) : Kind()
        data class Event(val type: PageEventType) : Kind()
        data class UnknownEvent(val type: String) : Kind()
        data class InvalidMessage(val reason: String) : Kind()
        data class BlockedNavigation(val reason: String) : Kind()
    }

    val title: String
        get() = when (kind) {
            is Kind.PageLoaded -> "Страница загружена"
            is Kind.LoadFailed -> "Ошибка загрузки"
            is Kind.Event -> kind.type.rawValue
            is Kind.UnknownEvent -> "Неизвестное событие: ${kind.type}"
            is Kind.InvalidMessage -> "Некорректное сообщение"
            is Kind.BlockedNavigation -> "Заблокирован переход"
        }

    val details: String?
        get() = when (kind) {
            is Kind.PageLoaded -> kind.url
            is Kind.LoadFailed -> kind.reason
            is Kind.InvalidMessage -> kind.reason
            is Kind.BlockedNavigation -> kind.reason
            is Kind.Event, is Kind.UnknownEvent -> null
        }

    val isProblem: Boolean
        get() = when (kind) {
            is Kind.PageLoaded, is Kind.Event -> warnings.isNotEmpty()
            is Kind.LoadFailed, is Kind.UnknownEvent, is Kind.InvalidMessage, is Kind.BlockedNavigation -> true
        }

    val time: String
        get() = SimpleDateFormat("HH:mm:ss.SSS", Locale.ROOT).format(date)

    val exportText: String
        get() = buildList {
            add("[$time] $title")
            details?.let { add("  $it") }
            origin?.let { add("  Origin: $it") }
            rawBody?.let { add("  Тело: $it") }
            actions.forEach { add("  → $it") }
            warnings.forEach { add("  ⚠️ $it") }
        }.joinToString("\n")

    companion object {

        /** Читаемое представление тела сообщения для лога: JSON с отсортированными ключами. */
        fun describe(body: Any?): String = truncated(
            when (body) {
                null, JSONObject.NULL -> "null"
                is JSONObject, is JSONArray -> json(body)
                else -> body.toString()
            }
        )

        private fun json(value: Any?): String = when (value) {
            null, JSONObject.NULL -> "null"
            is JSONObject -> value.keys().asSequence().sorted()
                .joinToString(",", "{", "}") { "${quote(it)}:${json(value.opt(it))}" }
            is JSONArray -> (0 until value.length()).joinToString(",", "[", "]") { json(value.opt(it)) }
            is String -> quote(value)
            else -> value.toString()
        }

        private fun quote(string: String) = JSONObject.quote(string).replace("\\/", "/")

        private fun truncated(string: String): String {
            val limit = 500
            if (string.length <= limit) {
                return string
            }
            return string.take(limit) + "… (${string.length} символов)"
        }
    }
}
